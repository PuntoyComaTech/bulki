import fs from 'node:fs/promises'
import path from 'node:path'
import { processPool } from '../concurrency/pool.js'
import type { EncodeSettings, FileResult, ImageJob, JsonError } from '../types/index.js'
import { encodeImage } from './encode.js'

export { getFormatOptions } from './encode.js'

/** Optimize one image and write it to `job.output` (atomically: temp file + rename). */
export async function optimizeImage(job: ImageJob, settings: EncodeSettings): Promise<FileResult> {
	const start = performance.now()
	const input = await fs.readFile(job.input)
	const result = await encodeImage(input, job.detectedFormat, settings, job.input)

	await fs.mkdir(path.dirname(job.output), { recursive: true })
	const tmp = `${job.output}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
	try {
		await fs.writeFile(tmp, result.data)
		await fs.rename(tmp, job.output)
	} catch (err) {
		await fs.rm(tmp, { force: true })
		throw err
	}

	return {
		inputPath: job.input,
		outputPath: job.output,
		originalSize: input.length,
		newSize: result.data.length,
		format: result.format,
		duration: performance.now() - start,
		keptOriginal: result.keptOriginal,
	}
}

export interface BatchResult {
	results: FileResult[]
	errors: JsonError[]
	duration: number
}

/**
 * Run many jobs in parallel. Never throws: per-file failures are collected in `errors`.
 * When `signal` aborts, jobs that haven't started yet are skipped.
 */
export async function runBatch(
	jobs: ImageJob[],
	settings: EncodeSettings,
	concurrency: number,
	onFileDone?: (job: ImageJob, result: FileResult | null, error?: Error) => void,
	signal?: AbortSignal,
): Promise<BatchResult> {
	const start = performance.now()
	const errors: JsonError[] = []
	const outcomes = await processPool(
		jobs,
		async (job) => {
			if (signal?.aborted) return null
			try {
				const result = await optimizeImage(job, settings)
				onFileDone?.(job, result)
				return result
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err))
				errors.push({ file: job.input, message: friendlyError(error) })
				onFileDone?.(job, null, error)
				return null
			}
		},
		concurrency,
	)
	return {
		results: outcomes.filter((r): r is FileResult => r !== null),
		errors,
		duration: performance.now() - start,
	}
}

export function friendlyError(err: Error): string {
	const code = (err as NodeJS.ErrnoException).code
	if (code === 'EACCES' || code === 'EPERM') return 'permission denied'
	if (code === 'ENOSPC') return 'disk is full'
	if (code === 'ENOENT') return 'file disappeared before it could be read'
	const msg = err.message.split('\n')[0]
	if (/VipsJpeg|premature end|corrupt|bad seek|unexpected end/i.test(msg))
		return `damaged image (${msg})`
	return msg
}
