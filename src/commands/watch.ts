import fs from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'
import { formatFileResult } from '../output/results.js'
import { defaultOutputFormat, extensionFor } from '../pipeline/encode.js'
import { detectFormat } from '../pipeline/filter.js'
import { friendlyError, optimizeImage } from '../pipeline/optimize.js'
import { displayPath, isInside, resolveUserPath, samePath } from '../pipeline/paths.js'
import type { EncodeSettings } from '../types/index.js'
import {
	DEFAULT_OUTPUT_FOLDER,
	DEFAULTS,
	defaultConcurrency,
	parseInteger,
	resolveOutputDir,
	validateEncodeSettings,
} from '../validation/options.js'

export interface WatchOptions extends EncodeSettings {
	/** Absolute output folder */
	output: string
	log?: (line: string) => void
	logError?: (line: string) => void
}

export interface WatchHandle {
	output: string
	close(): void
}

/** How long a file must stop changing before we treat it as fully written. */
const SETTLE_MS = 400

/**
 * Watch `dir` recursively and optimize every image that appears or changes.
 * Throws if `dir` isn't a folder; per-file errors are logged, never fatal.
 */
export async function startWatch(dir: string, opts: WatchOptions): Promise<WatchHandle> {
	const root = path.resolve(dir)
	const stat = await fs.promises.stat(root).catch(() => null)
	if (!stat) throw new Error(`Path not found: ${root}`)
	if (!stat.isDirectory()) throw new Error(`Watch path must be a folder: ${root}`)
	if (samePath(root, opts.output)) {
		throw new Error(
			'The output folder is the same as the watched folder. Choose a different output folder.',
		)
	}

	const log = opts.log ?? console.log
	const logError = opts.logError ?? console.error
	const settings: EncodeSettings = {
		quality: opts.quality,
		format: opts.format,
		resize: opts.resize,
	}

	const timers = new Map<string, NodeJS.Timeout>()
	const queue: string[] = []
	const queued = new Set<string>()
	let active = 0
	const maxActive = defaultConcurrency()

	const pump = () => {
		while (active < maxActive && queue.length > 0) {
			const file = queue.shift() as string
			queued.delete(file)
			active++
			processFile(file).finally(() => {
				active--
				pump()
			})
		}
	}

	const processFile = async (file: string) => {
		const detectedFormat = await detectFormat(file)
		if (!detectedFormat) return
		const rel = path.relative(root, file)
		const parsed = path.parse(rel)
		const ext = settings.format ? extensionFor(settings.format) : parsed.ext
		const target = settings.format ?? defaultOutputFormat(detectedFormat)
		const output = path.join(
			opts.output,
			parsed.dir,
			`${parsed.name}${detectedFormat === 'unsupported' && !settings.format ? extensionFor(target) : ext}`,
		)
		try {
			const result = await optimizeImage({ input: file, detectedFormat, output }, settings)
			log(formatFileResult(result))
		} catch (err) {
			logError(`✗ ${rel}: ${friendlyError(err as Error)}`)
		}
	}

	const schedule = (file: string) => {
		clearTimeout(timers.get(file))
		timers.set(
			file,
			setTimeout(async () => {
				timers.delete(file)
				const s = await fs.promises.stat(file).catch(() => null)
				if (!s?.isFile() || queued.has(file)) return
				queue.push(file)
				queued.add(file)
				pump()
			}, SETTLE_MS),
		)
	}

	const watcher = fs.watch(root, { recursive: true }, (_event, filename) => {
		if (!filename) return
		const file = path.resolve(root, filename.toString())
		const rel = path.relative(root, file)
		if (isInside(file, opts.output)) return
		if (rel.split(path.sep).some((part) => part.startsWith('.') || part === DEFAULT_OUTPUT_FOLDER))
			return
		if (file.endsWith('.tmp')) return
		schedule(file)
	})
	watcher.on('error', (err) => logError(`Watcher error: ${err.message}`))

	return {
		output: opts.output,
		close() {
			watcher.close()
			for (const t of timers.values()) clearTimeout(t)
			timers.clear()
		},
	}
}

export const watchCommand = new Command('watch')
	.description('Watch a folder and auto-optimize images as they appear')
	.argument('<path>', 'Folder to watch')
	.option('-o, --output <dir>', 'Folder where optimized images are written', DEFAULTS.output)
	.option('-q, --quality <n>', 'Output quality (1-100)', parseInteger, DEFAULTS.quality)
	.option('-f, --format <fmt>', 'Convert to jpeg, png, webp, gif or avif (default: keep format)')
	.option('-r, --resize <width>', 'Max width in px (never enlarges)', parseInteger)
	.option('-d, --destination <dir>', 'Deprecated: base folder; output goes to <dir>/bulki-output')
	.option('--output-folder <name>', 'Deprecated: subfolder name inside --destination')
	.action(async (dirPath: string, opts, cmd: Command) => {
		try {
			const settings = validateEncodeSettings(opts)
			const outputFromCli = cmd.getOptionValueSource('output') === 'cli'
			const root = resolveUserPath(dirPath)
			const output = resolveOutputDir({ ...opts, output: outputFromCli ? opts.output : undefined })
			const handle = await startWatch(root, { ...settings, output })
			console.log(`Watching ${displayPath(root)} → ${displayPath(output)}`)
			console.log('Press Ctrl+C to stop.\n')
			process.once('SIGINT', () => {
				handle.close()
				console.log('\nWatch stopped.')
				process.exit(0)
			})
		} catch (err) {
			console.error(`error: ${(err as Error).message}`)
			process.exit(1)
		}
	})
