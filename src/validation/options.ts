import { availableParallelism } from 'node:os'
import path from 'node:path'
import { cleanPathInput } from '../pipeline/paths.js'
import type { CompressOptions, EncodeSettings, OutputFormat } from '../types/index.js'

export interface RawOptions {
	quality: number
	format: string
	resize: number
	/** Folder where optimized images are written */
	output: string
	/** @deprecated legacy: base dir, combined with outputFolder → `<destination>/<outputFolder>` */
	destination: string
	/** @deprecated legacy: subfolder name inside `destination` */
	outputFolder: string
	concurrency: number
	exclude: string[]
	dryRun: boolean
	verbose: boolean
	json: boolean
	maxSize: string
}

export const DEFAULT_OUTPUT_FOLDER = 'bulki-output'

export const DEFAULTS = {
	quality: 70,
	output: `./${DEFAULT_OUTPUT_FOLDER}`,
} as const

export const OUTPUT_FORMATS: OutputFormat[] = ['jpeg', 'png', 'webp', 'gif', 'avif']
export const VALID_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif']

/** libvips already parallelises each image internally; more than 8 jobs only adds memory pressure. */
export function defaultConcurrency(): number {
	return Math.max(1, Math.min(availableParallelism(), 8))
}

export function parseSize(input: string): number {
	const match = /^(\d+(?:\.\d+)?)\s*(b|kb|mb)$/i.exec(input.trim())
	if (!match) {
		throw new Error(`Invalid size format: "${input}". Expected format like 200kb, 1mb, 500b`)
	}
	const value = Number(match[1])
	const unit = match[2].toLowerCase()
	if (unit === 'b') return value
	if (unit === 'kb') return value * 1024
	return value * 1024 * 1024
}

/** Strict integer parsing for CLI flags: "80" → 80, "80abc" / "abc" / "" → NaN. */
export function parseInteger(value: string): number {
	return /^\s*-?\d+\s*$/.test(value) ? Number(value) : Number.NaN
}

export function normalizeFormat(format: string | undefined): OutputFormat | undefined {
	if (format === undefined || format === '') return undefined
	const f = format.toLowerCase()
	if (!VALID_FORMATS.includes(f)) {
		throw new Error(
			`Invalid format: "${format}" is not a supported format. Use one of: ${OUTPUT_FORMATS.join(', ')}`,
		)
	}
	return (f === 'jpg' ? 'jpeg' : f) as OutputFormat
}

export function validateEncodeSettings(raw: {
	quality?: unknown
	format?: string
	resize?: unknown
}): EncodeSettings {
	const quality = raw.quality ?? DEFAULTS.quality
	if (typeof quality !== 'number' || !Number.isInteger(quality) || quality < 1 || quality > 100) {
		throw new Error('Invalid quality: must be an integer between 1 and 100')
	}

	const format = normalizeFormat(raw.format)

	const resize = raw.resize
	if (resize !== undefined) {
		if (typeof resize !== 'number' || !Number.isInteger(resize) || resize <= 0) {
			throw new Error('Invalid resize: must be a positive integer (width in pixels)')
		}
	}

	return { quality, format, resize: resize as number | undefined }
}

/**
 * Work out the absolute output folder.
 *
 *   --output <dir>                     → <dir>
 *   (nothing)                          → ./bulki-output
 * Legacy flags (still accepted so existing scripts and the GitHub Action keep working):
 *   --destination <base>               → <base>/bulki-output
 *   --destination <base> --output <x>  → <base>/<x>   (x relative)
 *   --output-folder <name>             → <base or .>/<name>
 */
export function resolveOutputDir(
	raw: Partial<Pick<RawOptions, 'output' | 'destination' | 'outputFolder'>>,
	cwd: string = process.cwd(),
): string {
	const base =
		raw.destination !== undefined ? path.resolve(cwd, cleanPathInput(raw.destination)) : cwd

	if (raw.output !== undefined && raw.output.trim() !== '') {
		return path.resolve(base, cleanPathInput(raw.output))
	}

	const folder = raw.outputFolder ?? DEFAULT_OUTPUT_FOLDER
	if (
		folder.includes('/') ||
		folder.includes('\\') ||
		folder.includes('..') ||
		folder.trim() === ''
	) {
		throw new Error(
			'Invalid outputFolder: must be a simple directory name. Use --output <path> to choose any folder.',
		)
	}
	return path.resolve(base, folder)
}

export function validateOptions(
	raw: Partial<RawOptions>,
	cwd: string = process.cwd(),
): CompressOptions {
	const settings = validateEncodeSettings(raw)

	const concurrency = raw.concurrency ?? defaultConcurrency()
	if (
		typeof concurrency !== 'number' ||
		!Number.isInteger(concurrency) ||
		concurrency < 1 ||
		concurrency > 32
	) {
		throw new Error('Invalid concurrency: must be an integer between 1 and 32')
	}

	let maxSize: number | undefined
	if (raw.maxSize !== undefined) {
		maxSize = parseSize(raw.maxSize)
	}

	return {
		...settings,
		output: resolveOutputDir(raw, cwd),
		concurrency,
		exclude: raw.exclude ?? [],
		dryRun: raw.dryRun ?? false,
		verbose: raw.verbose ?? false,
		json: raw.json ?? false,
		maxSize,
	}
}
