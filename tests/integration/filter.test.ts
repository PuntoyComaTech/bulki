import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isImage } from '../../src/pipeline/filter.js'

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures')

describe('isImage', () => {
	it('returns true for a JPEG file', async () => {
		const result = await isImage(path.join(FIXTURES, 'sample.jpg'))
		expect(result).toBe(true)
	})

	it('returns true for a PNG file', async () => {
		const result = await isImage(path.join(FIXTURES, 'sample.png'))
		expect(result).toBe(true)
	})

	it('returns true for a WebP file', async () => {
		const result = await isImage(path.join(FIXTURES, 'sample.webp'))
		expect(result).toBe(true)
	})

	it('returns true for a GIF file', async () => {
		const result = await isImage(path.join(FIXTURES, 'sample.gif'))
		expect(result).toBe(true)
	})

	it('returns true for an AVIF file', async () => {
		const result = await isImage(path.join(FIXTURES, 'sample.avif'))
		expect(result).toBe(true)
	})

	it('returns false for a plain text file', async () => {
		const result = await isImage(path.join(FIXTURES, 'not-an-image.txt'))
		expect(result).toBe(false)
	})

	it('returns false for a non-existent file without throwing', async () => {
		const result = await isImage(path.join(FIXTURES, 'does-not-exist.jpg'))
		expect(result).toBe(false)
	})
})
