import { availableParallelism } from 'node:os'
import path from 'node:path'
import * as p from '@clack/prompts'
import { isCancel } from '@clack/prompts'
import { installHook, uninstallHook } from '../commands/hook.js'
import { startWatch } from '../commands/watch.js'
import { processPool } from '../concurrency/pool.js'
import { formatSummary } from '../output/results.js'
import { collectImageFiles } from '../pipeline/discover.js'
import { optimizeImage } from '../pipeline/optimize.js'
import type { CompressOptions, FileResult } from '../types/index.js'
import { DEFAULTS } from '../validation/options.js'

const PRESETS = {
	web: {
		label: 'Web optimized',
		hint: 'WebP, quality 80, max 1920px',
		options: { format: 'webp', quality: 80, resize: 1920 },
	},
	social: {
		label: 'Social media',
		hint: 'PNG, quality 85, max 1080px — lossless colors',
		options: { format: 'png', quality: 85, resize: 1080 },
	},
	custom: {
		label: 'Custom settings',
		hint: 'Choose each option manually',
		options: null,
	},
}

async function collectPresetOptions(): Promise<{
	format: string | undefined
	quality: number
	resize: number | undefined
}> {
	const presetKey = await p.select({
		message: 'Choose a preset or configure manually',
		options: [
			{ value: 'web', label: PRESETS.web.label, hint: PRESETS.web.hint },
			{ value: 'social', label: PRESETS.social.label, hint: PRESETS.social.hint },
			{ value: 'custom', label: PRESETS.custom.label, hint: PRESETS.custom.hint },
		],
	})

	if (isCancel(presetKey)) {
		p.cancel('Operation cancelled.')
		process.exit(0)
	}

	let format: string | undefined
	let quality = DEFAULTS.quality
	let resize: number | undefined

	if (presetKey !== 'custom') {
		const preset = PRESETS[presetKey as keyof typeof PRESETS]
		const opts = preset.options as { format: string; quality: number; resize: number }
		format = opts.format
		quality = opts.quality
		resize = opts.resize
	} else {
		// Custom mode
		const settings = await p.group(
			{
				format: () =>
					p.select({
						message: 'Output format',
						options: [
							{ value: 'original', label: 'Keep original', hint: 'no conversion' },
							{ value: 'webp', label: 'WebP', hint: 'best compression/quality ratio' },
							{ value: 'avif', label: 'AVIF', hint: 'smallest files, slower encoding' },
							{ value: 'jpeg', label: 'JPEG', hint: 'universal compatibility' },
							{ value: 'png', label: 'PNG', hint: 'lossless' },
						],
					}),
				quality: () =>
					p.text({
						message: 'Quality (1-100)',
						placeholder: String(DEFAULTS.quality),
						initialValue: String(DEFAULTS.quality),
						validate(value) {
							const n = parseInt(value ?? '', 10)
							if (Number.isNaN(n) || n < 1 || n > 100) return 'Must be between 1 and 100'
						},
					}),
				resize: () =>
					p.select({
						message: 'Resize images?',
						options: [
							{ value: 'none', label: 'No resize', hint: 'keep original dimensions' },
							{ value: '1920', label: '1920px', hint: 'Full HD width' },
							{ value: '1080', label: '1080px', hint: 'HD width' },
							{ value: '800', label: '800px', hint: 'web thumbnails' },
							{ value: 'custom', label: 'Custom width...' },
						],
					}),
			},
			{
				onCancel: () => {
					p.cancel('Operation cancelled.')
					process.exit(0)
				},
			},
		)

		let resizeValue: number | undefined
		if (settings.resize === 'custom') {
			const customWidth = await p.text({
				message: 'Enter custom width (px)',
				placeholder: '1200',
				validate(value) {
					const n = parseInt(value ?? '', 10)
					if (Number.isNaN(n) || n <= 0) return 'Must be a positive number'
				},
			})
			if (isCancel(customWidth)) {
				p.cancel('Operation cancelled.')
				process.exit(0)
			}
			resizeValue = parseInt(customWidth as string, 10)
		} else if (settings.resize !== 'none') {
			resizeValue = parseInt(settings.resize as string, 10)
		}

		format = settings.format === 'original' ? undefined : (settings.format as string)
		quality = parseInt(settings.quality as string, 10)
		resize = resizeValue
	}

	return { format, quality, resize }
}

async function runCompress(): Promise<void> {
	const { format, quality, resize } = await collectPresetOptions()

	// Path input
	const inputPath = await p.text({
		message: 'Path to images (file or directory)',
		placeholder: './photos',
		validate(value) {
			if (!value || value.trim() === '') return 'Path is required'
		},
	})

	if (isCancel(inputPath)) {
		p.cancel('Operation cancelled.')
		process.exit(0)
	}

	const resolvedPath = path.resolve(inputPath as string)

	let filePaths: { path: string; format: string }[]
	let isDirectory: boolean
	try {
		const collected = await collectImageFiles(resolvedPath, [])
		filePaths = collected.files
		isDirectory = collected.isDirectory
	} catch {
		p.cancel(`Path not found: ${resolvedPath}`)
		process.exit(1)
	}

	if (filePaths.length === 0) {
		p.outro('No images found to process.')
		return
	}

	// Destination input
	const destInput = await p.text({
		message: 'Destination directory',
		placeholder: DEFAULTS.destination,
		initialValue: DEFAULTS.destination,
	})

	if (isCancel(destInput)) {
		p.cancel('Operation cancelled.')
		process.exit(0)
	}

	const destination = (destInput as string) || DEFAULTS.destination

	// Show summary
	const resizeLabel = resize ? `${resize}px` : 'No resize'
	const formatLabel = format ?? 'Keep original'
	p.note(
		[
			`Source:    ${resolvedPath} (${filePaths.length} images found)`,
			`Format:    ${formatLabel}`,
			`Quality:   ${quality}`,
			`Resize:    ${resizeLabel}`,
			`Output:    ${path.join(destination, DEFAULTS.outputFolder)}`,
		].join('\n'),
		'Summary',
	)

	const confirmed = await p.confirm({ message: 'Start processing?' })

	if (isCancel(confirmed) || !confirmed) {
		p.cancel('Operation cancelled.')
		process.exit(0)
	}

	// Process images
	const options: CompressOptions = {
		quality: quality,
		format,
		resize,
		destination,
		outputFolder: DEFAULTS.outputFolder,
		concurrency: availableParallelism(),
		exclude: [],
		dryRun: false,
		verbose: false,
		json: false,
	}

	const sourcePath = isDirectory ? resolvedPath : path.dirname(resolvedPath)
	const startTime = performance.now()
	const errors: Error[] = []

	const bar = p.progress({ max: filePaths.length })
	bar.start('Processing images')

	const processedResults = await processPool(
		filePaths,
		async (file) => {
			try {
				const result = await optimizeImage(file.path, {
					...options,
					sourcePath,
					detectedFormat: file.format,
				})
				bar.advance(1, `Processed ${path.basename(file.path)}`)
				return result
			} catch (err) {
				errors.push(err as Error)
				bar.advance(1, `Failed ${path.basename(file.path)}`)
				return null
			}
		},
		options.concurrency,
	)

	bar.stop('All images processed')

	const validResults = processedResults.filter((r): r is FileResult => r !== null)
	const totalDuration = performance.now() - startTime

	const summary = formatSummary(validResults, errors, totalDuration)
	p.note(summary, 'Results')

	p.outro('Done! Your optimized images are ready.')
}

async function runWatch(): Promise<void> {
	const watchDir = await p.text({
		message: 'Directory to watch',
		placeholder: './photos',
		validate(value) {
			if (!value?.trim()) return 'Path is required'
		},
	})

	if (isCancel(watchDir)) {
		p.cancel('Operation cancelled.')
		process.exit(0)
	}

	const { format, quality, resize } = await collectPresetOptions()

	const destInput = await p.text({
		message: 'Destination directory',
		placeholder: DEFAULTS.destination,
		initialValue: DEFAULTS.destination,
	})

	if (isCancel(destInput)) {
		p.cancel('Operation cancelled.')
		process.exit(0)
	}

	const destination = (destInput as string) || DEFAULTS.destination

	p.log.info(`Watching ${watchDir}... Press Ctrl+C to stop.`)

	await startWatch(watchDir as string, {
		quality,
		format,
		resize,
		destination,
	})
}

async function runHook(): Promise<void> {
	const hookAction = await p.select({
		message: 'Git hook action',
		options: [
			{ value: 'install', label: 'Install', hint: 'auto-optimize images on commit' },
			{ value: 'uninstall', label: 'Uninstall', hint: 'remove the hook' },
		],
	})

	if (isCancel(hookAction)) {
		p.cancel('Operation cancelled.')
		process.exit(0)
	}

	if (hookAction === 'install') {
		await installHook()
		p.outro('Git hook installed! Images will be auto-optimized on commit.')
	} else {
		await uninstallHook()
		p.outro('Git hook removed.')
	}
}

export async function runInteractive(): Promise<void> {
	p.intro('Punto y Coma — bulki')

	const action = await p.select({
		message: 'What do you want to do?',
		options: [
			{ value: 'compress', label: 'Compress images', hint: 'optimize files or directories' },
			{ value: 'watch', label: 'Watch directory', hint: 'auto-optimize new images' },
			{ value: 'hook', label: 'Git hook', hint: 'auto-optimize on commit' },
		],
	})

	if (isCancel(action)) {
		p.cancel('Operation cancelled.')
		process.exit(0)
	}

	if (action === 'compress') {
		await runCompress()
	} else if (action === 'watch') {
		await runWatch()
	} else {
		await runHook()
	}
}
