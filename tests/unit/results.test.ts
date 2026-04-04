import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { formatFileResult, formatSummary } from '../../src/output/results.js'
import type { FileResult } from '../../src/output/results.js'

function makeFileResult(overrides: Partial<FileResult> = {}): FileResult {
	return {
		inputPath: '/photos/vacation/beach.jpg',
		outputPath: '/out/vacation/beach.jpg',
		originalSize: 1572864, // 1.50 MB
		newSize: 440401, // ~430 KB (72% reduction)
		format: 'jpeg',
		duration: 340,
		...overrides,
	}
}

describe('formatFileResult', () => {
	it('contains the basename of the input file', () => {
		const result = formatFileResult(makeFileResult())
		expect(result).toContain('beach.jpg')
	})

	it('contains the original size formatted as human-readable bytes', () => {
		const result = formatFileResult(makeFileResult({ originalSize: 1572864 }))
		// 1572864 bytes = 1.50 MB
		expect(result).toContain('1.50 MB')
	})

	it('contains the new size formatted as human-readable bytes', () => {
		const result = formatFileResult(
			makeFileResult({ newSize: 1024 * 500 }), // 500 KB
		)
		expect(result).toContain('500.00 KB')
	})

	it('contains the reduction percentage when new size is smaller than original', () => {
		// originalSize=1000, newSize=280 => 72% reduction
		const result = formatFileResult(
			makeFileResult({ originalSize: 1000, newSize: 280 }),
		)
		expect(result).toContain('72%')
	})

	it('shows an increase indicator when new size exceeds original size', () => {
		// newSize > originalSize => size grew, should show something like +15%
		const result = formatFileResult(
			makeFileResult({ originalSize: 1000, newSize: 1150 }),
		)
		expect(result).toMatch(/\+\d+%/)
	})
})

describe('formatSummary', () => {
	const sampleResults: FileResult[] = [
		makeFileResult({ originalSize: 2 * 1024 * 1024, newSize: 1 * 1024 * 1024 }),
		makeFileResult({
			inputPath: '/photos/logo.png',
			outputPath: '/out/logo.png',
			originalSize: 1 * 1024 * 1024,
			newSize: 512 * 1024,
		}),
	]

	it('contains total file count', () => {
		const result = formatSummary(sampleResults, [], 1200)
		expect(result).toContain('2')
	})

	it('contains the total original size formatted', () => {
		// 2 MB + 1 MB = 3 MB total original
		const result = formatSummary(sampleResults, [], 1200)
		expect(result).toContain('3.00 MB')
	})

	it('contains the total new size formatted', () => {
		// 1 MB + 512 KB = 1536 KB = 1.50 MB total new
		const result = formatSummary(sampleResults, [], 1200)
		expect(result).toContain('1.50 MB')
	})

	it('contains total reduction percentage', () => {
		// 3145728 original, 1572864 new => 50% reduction
		const result = formatSummary(sampleResults, [], 1200)
		expect(result).toContain('50%')
	})

	it('contains total duration formatted in seconds', () => {
		// 1200ms => 1.2s
		const result = formatSummary(sampleResults, [], 1200)
		expect(result).toContain('1.2s')
	})

	it('contains error count when errors are present', () => {
		const errors = [new Error('failed file 1'), new Error('failed file 2')]
		const result = formatSummary(sampleResults, errors, 500)
		expect(result).toContain('2')
	})

	it('works with empty results array', () => {
		const result = formatSummary([], [], 0)
		expect(result).toContain('0')
	})

	it('shows 0 errors or omits error count when there are no errors', () => {
		const result = formatSummary(sampleResults, [], 800)
		// Should not mention an error count > 0 — must be absent or explicitly "0 errors"
		expect(result).not.toMatch(/[1-9]\d* error/)
	})
})
