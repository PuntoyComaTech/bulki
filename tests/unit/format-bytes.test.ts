import { describe, it, expect } from 'vitest'
import { formatBytes } from '../../src/output/format-bytes.js'

describe('formatBytes', () => {
	describe('bytes range (< 1024)', () => {
		it('returns "0 B" for zero bytes', () => {
			expect(formatBytes(0)).toBe('0 B')
		})

		it('returns bytes without decimals for values under 1024', () => {
			expect(formatBytes(500)).toBe('500 B')
		})
	})

	describe('kilobytes range', () => {
		it('returns "1.00 KB" for exactly 1024 bytes', () => {
			expect(formatBytes(1024)).toBe('1.00 KB')
		})

		it('returns "1.50 KB" for 1536 bytes', () => {
			expect(formatBytes(1536)).toBe('1.50 KB')
		})
	})

	describe('megabytes range', () => {
		it('returns "1.00 MB" for exactly 1024 * 1024 bytes', () => {
			expect(formatBytes(1048576)).toBe('1.00 MB')
		})

		it('returns "1.50 MB" for 1.5 * 1024 * 1024 bytes', () => {
			expect(formatBytes(1572864)).toBe('1.50 MB')
		})
	})

	describe('gigabytes range', () => {
		it('returns "1.00 GB" for exactly 1024^3 bytes', () => {
			expect(formatBytes(1073741824)).toBe('1.00 GB')
		})

		it('returns "2.50 GB" for 2.5 * 1024^3 bytes', () => {
			expect(formatBytes(2684354560)).toBe('2.50 GB')
		})
	})

	describe('negative values', () => {
		it('throws a RangeError or returns "0 B" for negative input — not a generic "Not implemented" error', () => {
			let thrownMessage: string | undefined
			let returnValue: string | undefined
			try {
				returnValue = formatBytes(-1)
			} catch (err) {
				thrownMessage = (err as Error).message
			}

			if (thrownMessage !== undefined) {
				// If it throws, it must NOT be the stub's placeholder error
				expect(thrownMessage).not.toBe('Not implemented')
			} else {
				// If it returns a value, it must be "0 B"
				expect(returnValue).toBe('0 B')
			}
		})
	})
})
