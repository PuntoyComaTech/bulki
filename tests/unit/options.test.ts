import { describe, expect, it } from 'vitest'
import { parseSize, validateOptions } from '../../src/validation/options.js'

describe('validateOptions', () => {
	describe('default values', () => {
		it('returns quality 70 when no quality is specified', () => {
			const result = validateOptions({})
			expect(result.quality).toBe(70)
		})

		it('returns destination "." when no destination is specified', () => {
			const result = validateOptions({})
			expect(result.destination).toBe('.')
		})

		it('returns outputFolder "bulki-output" when not specified', () => {
			const result = validateOptions({})
			expect(result.outputFolder).toBe('bulki-output')
		})

		it('returns a numeric concurrency when not specified', () => {
			const result = validateOptions({})
			expect(typeof result.concurrency).toBe('number')
		})

		it('returns an empty exclude array when not specified', () => {
			const result = validateOptions({})
			expect(result.exclude).toEqual([])
		})

		it('returns dryRun false when not specified', () => {
			const result = validateOptions({})
			expect(result.dryRun).toBe(false)
		})

		it('returns verbose false when not specified', () => {
			const result = validateOptions({})
			expect(result.verbose).toBe(false)
		})
	})

	describe('valid custom options', () => {
		it('accepts custom quality 85', () => {
			const result = validateOptions({ quality: 85 })
			expect(result.quality).toBe(85)
		})

		it('accepts format "webp"', () => {
			const result = validateOptions({ format: 'webp' })
			expect(result.format).toBe('webp')
		})

		it('accepts format "jpeg"', () => {
			const result = validateOptions({ format: 'jpeg' })
			expect(result.format).toBe('jpeg')
		})

		it('accepts format "jpg"', () => {
			const result = validateOptions({ format: 'jpg' })
			expect(result.format).toBe('jpeg')
		})

		it('accepts format "png"', () => {
			const result = validateOptions({ format: 'png' })
			expect(result.format).toBe('png')
		})

		it('accepts format "gif"', () => {
			const result = validateOptions({ format: 'gif' })
			expect(result.format).toBe('gif')
		})

		it('accepts format "avif"', () => {
			const result = validateOptions({ format: 'avif' })
			expect(result.format).toBe('avif')
		})

		it('accepts resize 1920', () => {
			const result = validateOptions({ resize: 1920 })
			expect(result.resize).toBe(1920)
		})

		it('accepts a custom destination path', () => {
			const result = validateOptions({ destination: '/tmp/output' })
			expect(result.destination).toBe('/tmp/output')
		})

		it('accepts a custom outputFolder', () => {
			const result = validateOptions({ outputFolder: 'optimized' })
			expect(result.outputFolder).toBe('optimized')
		})

		it('accepts dryRun true', () => {
			const result = validateOptions({ dryRun: true })
			expect(result.dryRun).toBe(true)
		})

		it('accepts verbose true', () => {
			const result = validateOptions({ verbose: true })
			expect(result.verbose).toBe(true)
		})
	})

	describe('invalid quality', () => {
		it('throws a descriptive error (not "Not implemented") when quality is 0', () => {
			expect(() => validateOptions({ quality: 0 })).toThrowError(/quality/i)
		})

		it('throws a descriptive error (not "Not implemented") when quality is 101', () => {
			expect(() => validateOptions({ quality: 101 })).toThrowError(/quality/i)
		})

		it('throws a descriptive error (not "Not implemented") when quality is not a number', () => {
			expect(() => validateOptions({ quality: 'high' as unknown as number })).toThrowError(
				/quality/i,
			)
		})
	})

	describe('invalid format', () => {
		it('throws a descriptive error (not "Not implemented") when format is "bmp"', () => {
			expect(() => validateOptions({ format: 'bmp' })).toThrowError(/format/i)
		})
	})

	describe('invalid resize', () => {
		it('throws a descriptive error (not "Not implemented") when resize is 0', () => {
			expect(() => validateOptions({ resize: 0 })).toThrowError(/resize/i)
		})

		it('throws a descriptive error (not "Not implemented") when resize is negative', () => {
			expect(() => validateOptions({ resize: -100 })).toThrowError(/resize/i)
		})

		it('throws a descriptive error (not "Not implemented") when resize is 1.5', () => {
			expect(() => validateOptions({ resize: 1.5 })).toThrowError(/resize/i)
		})
	})

	describe('invalid concurrency', () => {
		it('throws a descriptive error (not "Not implemented") when concurrency is 0', () => {
			expect(() => validateOptions({ concurrency: 0 })).toThrowError(/concurrency/i)
		})

		it('throws a descriptive error (not "Not implemented") when concurrency is 33', () => {
			expect(() => validateOptions({ concurrency: 33 })).toThrowError(/concurrency/i)
		})
	})
})

describe('parseSize', () => {
	it('parses "200kb" as 204800 bytes', () => {
		expect(parseSize('200kb')).toBe(204800)
	})

	it('parses "1mb" as 1048576 bytes', () => {
		expect(parseSize('1mb')).toBe(1048576)
	})

	it('parses "500b" as 500 bytes', () => {
		expect(parseSize('500b')).toBe(500)
	})

	it('parses "200KB" case-insensitively as 204800 bytes', () => {
		expect(parseSize('200KB')).toBe(204800)
	})

	it('parses "1MB" case-insensitively as 1048576 bytes', () => {
		expect(parseSize('1MB')).toBe(1048576)
	})

	it('throws a descriptive error for invalid format', () => {
		expect(() => parseSize('invalid')).toThrow()
	})

	it('throws a descriptive error for unsupported unit "gb"', () => {
		expect(() => parseSize('1gb')).toThrow()
	})
})
