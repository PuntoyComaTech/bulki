import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import * as p from '@clack/prompts'
import { HookError, installHook, uninstallHook } from '../commands/hook.js'
import { startWatch } from '../commands/watch.js'
import { formatBytes } from '../output/format-bytes.js'
import { UNSUPPORTED } from '../pipeline/filter.js'
import { runBatch } from '../pipeline/optimize.js'
import {
	cleanPathInput,
	displayPath,
	isInside,
	parsePathInput,
	samePath,
} from '../pipeline/paths.js'
import { assignOutputs, type PlanError, type Scan, scanInputs } from '../pipeline/plan.js'
import type { EncodeSettings, OutputFormat } from '../types/index.js'
import { DEFAULT_OUTPUT_FOLDER, defaultConcurrency } from '../validation/options.js'

/*
 * Interactive mode.
 *
 * Every screen is a step in a small state machine:
 *   Esc     → go back one step (never loses what you already chose)
 *   Ctrl+C  → quit bulki
 * Wrong input (a path that doesn't exist, a bad number) is rejected in place,
 * so you can fix it without starting over.
 */

// ─── prompt helpers ─────────────────────────────────────────────────────────

const BACK = Symbol('back')
type Back = typeof BACK

let ctrlCPressed = false

function quit(message = 'Bye!'): never {
	p.outro(message)
	process.exit(0)
}

/** Await a clack prompt. Esc → BACK, Ctrl+C → quit. */
async function ask<T>(prompt: Promise<T>): Promise<Exclude<T, symbol> | Back> {
	ctrlCPressed = false
	const value = await prompt
	if (p.isCancel(value)) {
		if (ctrlCPressed) quit()
		return BACK
	}
	return value as Exclude<T, symbol>
}

// ─── settings ───────────────────────────────────────────────────────────────

const PRESETS = {
	web: {
		label: 'Web optimized',
		hint: 'WebP, quality 80, max 1920px wide',
		settings: { format: 'webp', quality: 80, resize: 1920 } as EncodeSettings,
	},
	social: {
		label: 'Social media',
		hint: 'JPEG, quality 85, max 1080px wide',
		settings: { format: 'jpeg', quality: 85, resize: 1080 } as EncodeSettings,
	},
	keep: {
		label: 'Just make them smaller',
		hint: 'same format and size, quality 80',
		settings: { quality: 80 } as EncodeSettings,
	},
} as const

type PresetKey = keyof typeof PRESETS | 'custom'

function describeSettings(s: EncodeSettings): string {
	const fmt = s.format ? s.format.toUpperCase() : 'same format'
	const size = s.resize ? `max ${s.resize}px wide` : 'original size'
	return `${fmt}, quality ${s.quality}, ${size}`
}

/** Preset menu, plus the custom sub-flow. Esc inside custom goes back one question. */
async function chooseSettings(current?: { preset: PresetKey; settings: EncodeSettings }) {
	let highlighted: PresetKey = current?.preset ?? 'web'
	const customDraft = current?.preset === 'custom' ? current.settings : undefined
	while (true) {
		const preset = await ask(
			p.select<PresetKey>({
				message: 'How do you want to optimize them?',
				initialValue: highlighted,
				options: [
					...Object.entries(PRESETS).map(([value, preset]) => ({
						value: value as PresetKey,
						label: preset.label,
						hint: preset.hint,
					})),
					{ value: 'custom', label: 'Custom settings', hint: 'choose format, quality and size' },
				],
			}),
		)
		if (preset === BACK) return BACK
		if (preset !== 'custom') return { preset, settings: { ...PRESETS[preset].settings } }

		const custom = await chooseCustom(customDraft)
		if (custom !== BACK) return { preset, settings: custom }
		// Esc on the first custom question → back to the preset list, still on "Custom"
		highlighted = 'custom'
	}
}

async function chooseCustom(previous?: EncodeSettings): Promise<EncodeSettings | Back> {
	const s: EncodeSettings = { quality: 80, ...previous }
	let step = 0
	while (step < 3) {
		if (step === 0) {
			const format = await ask(
				p.select<OutputFormat | 'original'>({
					message: 'Output format',
					initialValue: s.format ?? 'original',
					options: [
						{ value: 'original', label: 'Keep original format' },
						{ value: 'webp', label: 'WebP', hint: 'best size/quality for the web' },
						{ value: 'avif', label: 'AVIF', hint: 'smallest files, slower' },
						{ value: 'jpeg', label: 'JPEG', hint: 'works everywhere' },
						{ value: 'png', label: 'PNG', hint: 'keeps transparency' },
					],
				}),
			)
			if (format === BACK) return BACK
			s.format = format === 'original' ? undefined : format
			step++
		} else if (step === 1) {
			const quality = await ask(
				p.text({
					message: 'Quality (1-100)',
					placeholder: `${s.quality}  — lower = smaller files`,
					defaultValue: String(s.quality),
					validate(value) {
						if (!value?.trim()) return
						const n = Number(value.trim())
						if (!Number.isInteger(n) || n < 1 || n > 100)
							return 'Enter a whole number between 1 and 100'
					},
				}),
			)
			if (quality === BACK) {
				step--
				continue
			}
			s.quality = Number(quality)
			step++
		} else {
			const presets = ['none', '3840', '2560', '1920', '1080', '800']
			const current = s.resize === undefined ? 'none' : String(s.resize)
			const resize = await ask(
				p.select<string>({
					message: 'Resize? (images are only made smaller, never bigger)',
					initialValue: presets.includes(current) ? current : 'custom',
					options: [
						{ value: 'none', label: 'Keep original size' },
						{ value: '3840', label: '3840px wide', hint: '4K' },
						{ value: '2560', label: '2560px wide', hint: 'retina screens' },
						{ value: '1920', label: '1920px wide', hint: 'full HD' },
						{ value: '1080', label: '1080px wide', hint: 'social media' },
						{ value: '800', label: '800px wide', hint: 'thumbnails' },
						{ value: 'custom', label: 'Other width…' },
					],
				}),
			)
			if (resize === BACK) {
				step--
				continue
			}
			if (resize === 'custom') {
				const width = await ask(
					p.text({
						message: 'Max width in pixels',
						placeholder: '1200',
						initialValue: s.resize && !presets.includes(String(s.resize)) ? String(s.resize) : '',
						validate(value) {
							const n = Number(value?.trim())
							if (!Number.isInteger(n) || n <= 0) return 'Enter a whole number greater than 0'
						},
					}),
				)
				if (width === BACK) continue // back to the resize list
				s.resize = Number(width)
			} else {
				s.resize = resize === 'none' ? undefined : Number(resize)
			}
			step++
		}
	}
	return s
}

// ─── paths ──────────────────────────────────────────────────────────────────

const DROP_HINT = 'type a path, or drag a folder or images into this window'

async function chooseSource(initial?: string): Promise<string[] | Back> {
	const raw = await ask(
		p.text({
			message: `Which images? (${DROP_HINT})`,
			placeholder: './photos',
			initialValue: initial,
			validate(value) {
				const parsed = parsePathInput(value)
				if (!parsed.ok) return parsed.error
			},
		}),
	)
	if (raw === BACK) return BACK
	const parsed = parsePathInput(raw)
	return parsed.ok ? parsed.paths : BACK
}

async function scanWithSpinner(inputs: string[]): Promise<Scan | null> {
	const spin = p.spinner()
	spin.start('Looking for images')
	try {
		const scan = await scanInputs(inputs)
		const supported = scan.images.filter(
			(i) => i.detectedFormat !== UNSUPPORTED || process.platform === 'darwin',
		)
		if (supported.length === 0) {
			spin.error(`No images found in ${inputs.map(displayPath).join(', ')}`)
			p.log.warn(
				'Supported formats: JPEG, PNG, WebP, GIF, AVIF (and HEIC on macOS). Pick another folder.',
			)
			return null
		}
		spin.stop(`Found ${supported.length} ${supported.length === 1 ? 'image' : 'images'}`)
		return { ...scan, images: supported }
	} catch (err) {
		spin.error('Could not read that location')
		p.log.error((err as Error).message)
		return null
	}
}

function validateOutput(output: string, scan: Scan): string | undefined {
	if (samePath(output, scan.sourceRoot) || scan.inputs.some((i) => samePath(i, output))) {
		return 'That is the source folder — pick a different one so your originals are not overwritten'
	}
	if (fs.existsSync(output) && !fs.statSync(output).isDirectory()) {
		return 'That path is a file, not a folder'
	}
	if (scan.inputs.some((i) => fs.statSync(i).isFile() && samePath(i, output))) {
		return 'That is one of the source images'
	}
	return checkWritable(output)
}

/** The folder (or the closest existing parent, since it will be created) must be writable. */
function checkWritable(dir: string): string | undefined {
	let existing = dir
	while (!fs.existsSync(existing)) {
		const parent = path.dirname(existing)
		if (parent === existing) break
		existing = parent
	}
	try {
		if (!fs.statSync(existing).isDirectory())
			return `${displayPath(existing)} is a file, not a folder`
		fs.accessSync(existing, fs.constants.W_OK)
	} catch {
		return `You don't have permission to write in ${displayPath(existing)} — choose another folder`
	}
}

async function chooseOutput(scan: Scan, current?: string): Promise<string | Back> {
	const fallback = current ?? path.join(scan.sourceRoot, DEFAULT_OUTPUT_FOLDER)
	const raw = await ask(
		p.text({
			message: `Where should the optimized copies go? (Enter = ${displayPath(fallback)})`,
			placeholder: displayPath(fallback),
			defaultValue: fallback,
			validate(value) {
				if (!value?.trim()) return
				return validateOutput(path.resolve(cleanPathInput(value)), scan)
			},
		}),
	)
	if (raw === BACK) return BACK
	return path.resolve(cleanPathInput(raw))
}

// ─── compress ───────────────────────────────────────────────────────────────

interface CompressState {
	inputs?: string[]
	scan?: Scan
	preset?: PresetKey
	settings?: EncodeSettings
	output?: string
}

type Step = 'source' | 'settings' | 'output' | 'review' | 'run'

async function runCompress(prefill?: string[]): Promise<'menu' | 'again'> {
	const state: CompressState = {}
	let step: Step = 'source'

	if (prefill) {
		state.inputs = prefill
		const scan = await scanWithSpinner(prefill)
		if (scan) {
			state.scan = scan
			step = 'settings'
		}
	}

	while (true) {
		if (step === 'source') {
			const inputs = await chooseSource(state.inputs?.join(' '))
			if (inputs === BACK) return 'menu'
			const scan = await scanWithSpinner(inputs)
			if (!scan) continue // stay on this step
			state.inputs = inputs
			state.scan = scan
			// A previous output that's now invalid (e.g. same as new source) is dropped
			if (state.output && validateOutput(state.output, scan)) state.output = undefined
			step = state.settings ? 'review' : 'settings'
		} else if (step === 'settings') {
			const chosen = await chooseSettings(
				state.preset && state.settings
					? { preset: state.preset, settings: state.settings }
					: undefined,
			)
			if (chosen === BACK) {
				step = state.output ? 'review' : 'source'
				continue
			}
			state.preset = chosen.preset
			state.settings = chosen.settings
			step = state.output ? 'review' : 'output'
		} else if (step === 'output') {
			const output = await chooseOutput(state.scan as Scan, state.output)
			if (output === BACK) {
				step = 'settings'
				continue
			}
			state.output = output
			step = 'review'
		} else if (step === 'review') {
			const scan = state.scan as Scan
			const settings = state.settings as EncodeSettings
			const output = state.output as string
			let plan: ReturnType<typeof assignOutputs>
			try {
				plan = assignOutputs(scan, output, settings.format)
			} catch (err) {
				p.log.error((err as PlanError).message)
				step = 'output'
				continue
			}
			const existing = plan.jobs.filter((j) => fs.existsSync(j.output)).length
			p.note(
				[
					`From:      ${scan.inputs.map(displayPath).join(', ')}`,
					`Images:    ${plan.jobs.length}`,
					`Settings:  ${describeSettings(settings)}`,
					`Save to:   ${displayPath(output)}${fs.existsSync(output) ? '' : '  (will be created)'}`,
					'',
					'Your original images are not modified.',
					...(existing > 0
						? [`${existing} file(s) already in the output folder will be replaced.`]
						: []),
				].join('\n'),
				'Ready',
			)
			const choice = await ask(
				p.select<string>({
					message: 'Start?',
					options: [
						{ value: 'run', label: 'Start optimizing' },
						{ value: 'source', label: 'Change images' },
						{ value: 'settings', label: 'Change settings' },
						{ value: 'output', label: 'Change output folder' },
						{ value: 'menu', label: 'Cancel — back to main menu' },
					],
				}),
			)
			if (choice === BACK) step = 'output'
			else if (choice === 'menu') return 'menu'
			else step = choice as Step
		} else {
			const plan = assignOutputs(state.scan as Scan, state.output as string, state.settings?.format)
			await executePlan(plan.jobs, state.settings as EncodeSettings, state.output as string)
			const next = await ask(
				p.select<string>({
					message: 'What next?',
					options: [
						{ value: 'open', label: 'Open the output folder' },
						{ value: 'again', label: 'Optimize more images' },
						{ value: 'retry', label: 'Run again with different settings' },
						{ value: 'menu', label: 'Main menu' },
						{ value: 'quit', label: 'Exit' },
					],
				}),
			)
			if (next === 'open') {
				openFolder(state.output as string)
				return 'menu'
			}
			if (next === 'retry') {
				step = 'settings'
				continue
			}
			if (next === 'quit') quit()
			return next === 'again' ? 'again' : 'menu'
		}
	}
}

async function executePlan(
	jobs: ReturnType<typeof assignOutputs>['jobs'],
	settings: EncodeSettings,
	output: string,
) {
	const controller = new AbortController()
	const onSigint = () => controller.abort()
	process.on('SIGINT', onSigint)

	const bar = p.progress({ max: jobs.length, size: 30 })
	bar.start(`Optimizing ${jobs.length} images (Ctrl+C to stop)`)
	let done = 0
	const batch = await runBatch(
		jobs,
		settings,
		defaultConcurrency(),
		(job) => {
			done++
			bar.advance(1, `${done}/${jobs.length}  ${path.basename(job.input)}`)
		},
		controller.signal,
	)
	process.off('SIGINT', onSigint)

	const { results, errors } = batch
	const stopped = controller.signal.aborted
	if (stopped) bar.stop(`Stopped — ${results.length} of ${jobs.length} images done`)
	else if (results.length === 0) bar.error('No image could be optimized')
	else bar.stop(`Done in ${(batch.duration / 1000).toFixed(1)}s`)

	const before = results.reduce((s, r) => s + r.originalSize, 0)
	const after = results.reduce((s, r) => s + r.newSize, 0)
	const pct = before > 0 ? Math.round((1 - after / before) * 100) : 0
	const kept = results.filter((r) => r.keptOriginal).length

	const lines = [
		`${results.length} ${results.length === 1 ? 'image' : 'images'} optimized`,
		`${formatBytes(before)} → ${formatBytes(after)}  (${pct}% smaller, ${formatBytes(before - after)} saved)`,
		`Saved to: ${displayPath(output)}`,
	]
	if (kept > 0) lines.push(`${kept} were already optimal and were copied unchanged.`)
	p.note(lines.join('\n'), errors.length > 0 ? 'Finished with errors' : 'Finished')

	if (errors.length > 0) {
		const shown = errors.slice(0, 8)
		p.log.error(
			[
				`${errors.length} ${errors.length === 1 ? 'image' : 'images'} could not be optimized:`,
				...shown.map((e) => `  ${path.basename(e.file)} — ${e.message}`),
				...(errors.length > shown.length ? [`  …and ${errors.length - shown.length} more`] : []),
			].join('\n'),
		)
	}
}

function openFolder(dir: string) {
	const cmd =
		process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
	try {
		const child = spawn(cmd, [dir], { detached: true, stdio: 'ignore' })
		child.on('error', () => p.log.warn(`Could not open the folder. It is here: ${dir}`))
		child.unref()
	} catch {
		p.log.warn(`Could not open the folder. It is here: ${dir}`)
	}
}

// ─── watch ──────────────────────────────────────────────────────────────────

async function runWatch(): Promise<void> {
	let dir: string | undefined
	let chosen: { preset: PresetKey; settings: EncodeSettings } | undefined
	let output: string | undefined
	let step = 0

	while (step < 3) {
		if (step === 0) {
			const raw = await ask(
				p.text({
					message: `Which folder should be watched? (${DROP_HINT})`,
					placeholder: './uploads',
					initialValue: dir,
					validate(value) {
						const parsed = parsePathInput(value)
						if (!parsed.ok) return parsed.error
						if (parsed.paths.length > 1 || !fs.statSync(parsed.paths[0]).isDirectory())
							return 'Choose one folder (not files)'
					},
				}),
			)
			if (raw === BACK) return
			const parsed = parsePathInput(raw)
			if (!parsed.ok) continue
			dir = parsed.paths[0]
			step++
		} else if (step === 1) {
			const s = await chooseSettings(chosen)
			if (s === BACK) {
				step--
				continue
			}
			chosen = s
			step++
		} else {
			const fakeScan: Scan = { inputs: [dir as string], sourceRoot: dir as string, images: [] }
			const out = await chooseOutput(fakeScan, output)
			if (out === BACK) {
				step--
				continue
			}
			output = out
			step++
		}
	}

	const root = dir as string
	const out = output as string
	let handle: Awaited<ReturnType<typeof startWatch>>
	try {
		handle = await startWatch(root, {
			...(chosen?.settings as EncodeSettings),
			output: out,
			log: (line) => p.log.success(line),
			logError: (line) => p.log.error(line),
		})
	} catch (err) {
		p.log.error((err as Error).message)
		return
	}

	p.note(
		[
			`Watching:  ${displayPath(root)}`,
			`Settings:  ${describeSettings(chosen?.settings as EncodeSettings)}`,
			`Save to:   ${displayPath(out)}`,
			'',
			'New or changed images are optimized automatically.',
			isInside(out, root) ? `(${path.basename(out)} itself is ignored)` : '',
		]
			.filter(Boolean)
			.join('\n'),
		'Watching — press Ctrl+C to stop',
	)

	await new Promise<void>((resolve) => process.once('SIGINT', () => resolve()))
	handle.close()
	p.log.info('Stopped watching.')
}

// ─── hook ───────────────────────────────────────────────────────────────────

async function runHook(): Promise<void> {
	const action = await ask(
		p.select<string>({
			message: `Git hook for ${displayPath(process.cwd())}`,
			options: [
				{ value: 'install', label: 'Install', hint: 'optimize staged images on every commit' },
				{ value: 'uninstall', label: 'Uninstall', hint: 'remove the hook' },
			],
		}),
	)
	if (action === BACK) return
	try {
		if (action === 'install') await installHook()
		else await uninstallHook()
	} catch (err) {
		if (!(err instanceof HookError)) throw err
		p.log.error(`${err.message} (current folder: ${displayPath(process.cwd())})`)
	}
}

// ─── entry ──────────────────────────────────────────────────────────────────

export async function runInteractive(prefill?: string[]): Promise<void> {
	if (!process.stdin.isTTY) {
		console.error('Interactive mode needs a terminal. Run `bulki --help` to see the commands.')
		process.exit(1)
	}

	readline.emitKeypressEvents(process.stdin)
	process.stdin.on('keypress', (_str, key) => {
		if (key?.ctrl && key.name === 'c') ctrlCPressed = true
	})

	p.intro('Punto y Coma — bulki')
	p.log.message('Esc = go back · Ctrl+C = quit', { symbol: ' ' })

	let next: 'menu' | 'again' = 'menu'
	let pending = prefill
	while (true) {
		let action: string | Back = 'compress'
		if (next === 'menu' && !pending) {
			action = await ask(
				p.select<string>({
					message: 'What do you want to do?',
					options: [
						{ value: 'compress', label: 'Optimize images', hint: 'files or folders' },
						{ value: 'watch', label: 'Watch a folder', hint: 'auto-optimize new images' },
						{ value: 'hook', label: 'Git hook', hint: 'auto-optimize on commit' },
						{ value: 'quit', label: 'Exit' },
					],
				}),
			)
			if (action === 'quit') quit()
			if (action === BACK) {
				// Esc on the main menu must not close bulki — leaving is always explicit
				p.log.info('To leave bulki choose "Exit" or press Ctrl+C.')
				continue
			}
		}

		try {
			if (action === 'compress') {
				next = await runCompress(pending)
				pending = undefined
			} else if (action === 'watch') {
				await runWatch()
				next = 'menu'
			} else {
				await runHook()
				next = 'menu'
			}
		} catch (err) {
			// Last line of defence: report and return to the menu instead of crashing
			p.log.error(`Something went wrong: ${(err as Error).message}`)
			pending = undefined
			next = 'menu'
		}
	}
}
