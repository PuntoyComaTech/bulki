import { availableParallelism } from 'node:os'
import type { CompressOptions } from '../types/index.js'

export interface RawOptions {
	quality: number
	format: string
	resize: number
	destination: string
	outputFolder: string
	concurrency: number
	exclude: string[]
	dryRun: boolean
	verbose: boolean
}

const VALID_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif']

export function validateOptions(raw: Partial<RawOptions>): CompressOptions {
	const quality = raw.quality ?? 70
	if (typeof quality !== 'number' || !Number.isInteger(quality) || quality < 1 || quality > 100) {
		throw new Error(`Invalid quality: must be an integer between 1 and 100`)
	}

	let format = raw.format
	if (format !== undefined && !VALID_FORMATS.includes(format)) {
		throw new Error(`Invalid format: "${format}" is not a supported format`)
	}
	if (format === 'jpg') format = 'jpeg'

	const resize = raw.resize
	if (resize !== undefined) {
		if (typeof resize !== 'number' || !Number.isInteger(resize) || resize <= 0) {
			throw new Error(`Invalid resize: must be a positive integer`)
		}
	}

	const concurrency = raw.concurrency ?? availableParallelism()
	if (typeof concurrency !== 'number' || concurrency < 1 || concurrency > 32) {
		throw new Error(`Invalid concurrency: must be between 1 and 32`)
	}

	return {
		quality,
		format,
		resize,
		destination: raw.destination ?? '.',
		outputFolder: raw.outputFolder ?? 'bulki-output',
		concurrency,
		exclude: raw.exclude ?? [],
		dryRun: raw.dryRun ?? false,
		verbose: raw.verbose ?? false,
	}
}
