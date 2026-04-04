import path from 'node:path'
import { formatBytes } from './format-bytes.js'
import type { FileResult } from '../types/index.js'

export function formatFileResult(result: FileResult): string {
	const filename = path.basename(result.inputPath)
	const original = formatBytes(result.originalSize)
	const newSize = formatBytes(result.newSize)
	const reduction = Math.round((1 - result.newSize / result.originalSize) * 100)
	const pct = reduction < 0 ? `+${Math.abs(reduction)}%` : `${reduction}%`
	return `${filename} ${original} -> ${newSize} (${pct})`
}

export function formatSummary(
	results: FileResult[],
	errors: Error[],
	totalDuration: number,
): string {
	const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0)
	const totalNew = results.reduce((sum, r) => sum + r.newSize, 0)
	const reduction = totalOriginal > 0 ? Math.round((1 - totalNew / totalOriginal) * 100) : 0
	const duration = (totalDuration / 1000).toFixed(1) + 's'
	const fileCount = results.length
	let summary = `${fileCount} files | ${formatBytes(totalOriginal)} -> ${formatBytes(totalNew)} (${reduction}%) | ${duration}`
	if (errors.length > 0) {
		summary += ` | ${errors.length} errors`
	}
	return summary
}
