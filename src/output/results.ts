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
	return `${filename} ${original} -> ${newSize} (${pct})`
}

export function buildJsonOutput(
	results: FileResult[],
	errors: JsonError[],
	totalDuration: number,
): JsonOutput {
	const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0)
	const totalNew = results.reduce((sum, r) => sum + r.newSize, 0)
	const totalReduction = calcReduction(totalOriginal, totalNew)

	return {
		files: results.map((r) => ({
			input: r.inputPath,
			output: r.outputPath,
			originalSize: r.originalSize,
			newSize: r.newSize,
			reduction: calcReduction(r.originalSize, r.newSize),
			format: r.format,
			duration: r.duration,
		})),
		summary: {
			totalFiles: results.length,
			totalOriginalSize: totalOriginal,
			totalNewSize: totalNew,
			totalReduction,
			duration: totalDuration,
			errors: errors.length,
		},
		errors,
	}
}

export function formatSummary(
	results: FileResult[],
	errors: Error[],
	totalDuration: number,
): string {
	const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0)
	const totalNew = results.reduce((sum, r) => sum + r.newSize, 0)
	const reduction = totalOriginal > 0 ? Math.round((1 - totalNew / totalOriginal) * 100) : 0
	const duration = `${(totalDuration / 1000).toFixed(1)}s`
	const fileCount = results.length
	let summary = `${fileCount} files | ${formatBytes(totalOriginal)} -> ${formatBytes(totalNew)} (${reduction}%) | ${duration}`
	if (errors.length > 0) {
		summary += ` | ${errors.length} errors`
	}
	return summary
}
