import { describe, it, expect, afterEach } from 'vitest'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'
import sharp from 'sharp'
import { optimizeImage } from '../../src/pipeline/optimize.js'

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures')

let tempDirs: string[] = []

afterEach(async () => {
	for (const dir of tempDirs) {
		await fs.rm(dir, { recursive: true, force: true })
	}
	tempDirs = []
})

async function makeTempDir(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-optimize-'))
	tempDirs.push(dir)
	return dir
}

function baseOptions(destination: string, detectedFormat = 'jpeg') {
	return {
		quality: 80,
		destination,
		outputFolder: 'out',
		concurrency: 1,
		exclude: [],
		dryRun: false,
		verbose: false,
		sourcePath: FIXTURES,
		detectedFormat,
	}
}

describe('optimizeImage', () => {
	it('optimizes a JPEG and returns a valid FileResult with an existing output file', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.jpg')

		const result = await optimizeImage(filePath, baseOptions(destination))

		expect(result.inputPath).toBe(filePath)
		expect(result.outputPath).toBeTruthy()
		expect(result.originalSize).toBeGreaterThan(0)
		expect(result.newSize).toBeGreaterThan(0)
		expect(result.format).toBeTruthy()
		expect(result.duration).toBeGreaterThan(0)

		const exists = await fs.stat(result.outputPath).then(() => true).catch(() => false)
		expect(exists).toBe(true)
	})

	it('optimizes a PNG and the output file exists', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.png')

		const result = await optimizeImage(filePath, baseOptions(destination, 'png'))

		const exists = await fs.stat(result.outputPath).then(() => true).catch(() => false)
		expect(exists).toBe(true)
	})

	it('optimizes a WebP and the output file exists', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.webp')

		const result = await optimizeImage(filePath, baseOptions(destination, 'webp'))

		const exists = await fs.stat(result.outputPath).then(() => true).catch(() => false)
		expect(exists).toBe(true)
	})

	it('optimizes a GIF and the output file exists', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.gif')

		const result = await optimizeImage(filePath, baseOptions(destination, 'gif'))

		const exists = await fs.stat(result.outputPath).then(() => true).catch(() => false)
		expect(exists).toBe(true)
	})

	it('optimizes an AVIF and the output file exists', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.avif')

		const result = await optimizeImage(filePath, baseOptions(destination, 'avif'))

		const exists = await fs.stat(result.outputPath).then(() => true).catch(() => false)
		expect(exists).toBe(true)
	})

	it('converts JPEG to WebP when format is specified and output has .webp extension', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.jpg')

		const result = await optimizeImage(filePath, {
			...baseOptions(destination),
			format: 'webp',
		})

		expect(result.outputPath.endsWith('.webp')).toBe(true)
		const exists = await fs.stat(result.outputPath).then(() => true).catch(() => false)
		expect(exists).toBe(true)
	})

	it('resizes the image to the specified dimension', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.jpg')

		const result = await optimizeImage(filePath, {
			...baseOptions(destination),
			resize: 50,
		})

		const metadata = await sharp(result.outputPath).metadata()
		expect(metadata.width).toBe(50)
	})

	it('quality 10 produces a smaller file than quality 95 for JPEG', async () => {
		const destLow = await makeTempDir()
		const destHigh = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.jpg')

		const lowQuality = await optimizeImage(filePath, {
			...baseOptions(destLow),
			quality: 10,
		})
		const highQuality = await optimizeImage(filePath, {
			...baseOptions(destHigh),
			quality: 95,
		})

		expect(lowQuality.newSize).toBeLessThan(highQuality.newSize)
	})

	it('returns duration greater than 0', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.jpg')

		const result = await optimizeImage(filePath, baseOptions(destination))

		expect(result.duration).toBeGreaterThan(0)
	})

	it('originalSize matches the actual size of the input file', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.jpg')

		const result = await optimizeImage(filePath, baseOptions(destination))
		const stat = await fs.stat(filePath)

		expect(result.originalSize).toBe(stat.size)
	})

	it('newSize matches the actual size of the output file', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.jpg')

		const result = await optimizeImage(filePath, baseOptions(destination))
		const stat = await fs.stat(result.outputPath)

		expect(result.newSize).toBe(stat.size)
	})

	it('rejects with a meaningful error (not the stub placeholder) when input is not an image', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'not-an-image.txt')

		await expect(optimizeImage(filePath, baseOptions(destination))).rejects.toThrow(
			/unsupported|invalid|format|image|Input file/i,
		)
	})
})
