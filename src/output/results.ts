import path from 'node:path'
import type { FileResult, JsonError, JsonOutput } from '../types/index.js'
import { formatBytes } from './format-bytes.js'

function calcReduction(originalSize: number, newSize: number): number {
	return originalSize > 0 ? Math.round((1 - newSize / originalSize) * 100) : 0
}

export type { FileResult }

export function formatFileResult(result: FileResult): string {
	const filename = path.basename(result.inputPath)
	const original = formatBytes(result.originalSize)
	const newSize = formatBytes(result.newSize)
	const reduction = calcReduction(result.originalSize, result.newSize)
	const pct = reduction < 0 ? `+${Math.abs(reduction)}%` : `${reduction}%`
	const note = result.keptOriginal ? ' — already optimal, copied as-is' : ''
	return `${filename} ${original} -> ${newSize} (${pct})${note}`
}

export function buildJsonOutput(
	results: FileResult[],
	errors: JsonError[],
	totalDuration: number,
	outputDir?: string,
): JsonOutput {
	const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0)
	const totalNew = results.reduce((sum, r) => sum + r.newSize, 0)

	return {
		...(outputDir ? { output: outputDir } : {}),
		files: results.map((r) => ({
			input: r.inputPath,
			output: r.outputPath,
			originalSize: r.originalSize,
			newSize: r.newSize,
			reduction: calcReduction(r.originalSize, r.newSize),
			format: r.format,
			duration: r.duration,
			...(r.keptOriginal ? { keptOriginal: true } : {}),
		})),
		summary: {
			totalFiles: results.length,
			totalOriginalSize: totalOriginal,
			totalNewSize: totalNew,
			totalReduction: calcReduction(totalOriginal, totalNew),
			duration: totalDuration,
			errors: errors.length,
		},
		errors,
	}
}

export function formatSummary(
	results: FileResult[],
	errors: ArrayLike<unknown>,
	totalDuration: number,
): string {
	const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0)
	const totalNew = results.reduce((sum, r) => sum + r.newSize, 0)
	const reduction = calcReduction(totalOriginal, totalNew)
	const duration = `${(totalDuration / 1000).toFixed(1)}s`
	const fileCount = results.length
	let summary = `${fileCount} ${fileCount === 1 ? 'file' : 'files'} | ${formatBytes(totalOriginal)} -> ${formatBytes(totalNew)} (${reduction}%) | ${duration}`
	if (errors.length > 0) {
		summary += ` | ${errors.length} ${errors.length === 1 ? 'error' : 'errors'}`
	}
	return summary
}
