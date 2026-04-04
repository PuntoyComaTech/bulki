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
	json: boolean
	maxSize: string
}

export function parseSize(input: string): number {
	const match = /^(\d+(?:\.\d+)?)(b|kb|mb)$/i.exec(input)
	if (!match) {
		throw new Error(`Invalid size format: "${input}". Expected format like 200kb, 1mb, 500b`)
	}
	const value = Number(match[1])
	const unit = match[2].toLowerCase()
	if (unit === 'b') return value
	if (unit === 'kb') return value * 1024
	return value * 1024 * 1024
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

	let maxSize: number | undefined
	if (raw.maxSize !== undefined) {
		maxSize = parseSize(raw.maxSize)
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
		json: raw.json ?? false,
		maxSize,
	}
}
