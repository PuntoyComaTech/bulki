import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { optimizeImage, runBatch } from '../../src/pipeline/optimize.js'
import { planJobs } from '../../src/pipeline/plan.js'
import type { EncodeSettings } from '../../src/types/index.js'

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures')

let tempDirs: string[] = []

afterEach(async () => {
	for (const dir of tempDirs) await fs.rm(dir, { recursive: true, force: true })
	tempDirs = []
})

async function makeTempDir(prefix = 'bulki-optimize-'): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
	tempDirs.push(dir)
	return dir
}

const exists = (p: string) =>
	fs
		.stat(p)
		.then(() => true)
		.catch(() => false)

function job(file: string, detectedFormat: string, outDir: string, ext = path.extname(file)) {
	return {
		input: path.join(FIXTURES, file),
		detectedFormat,
		output: path.join(outDir, `${path.parse(file).name}${ext}`),
	}
}

const Q80: EncodeSettings = { quality: 80 }

describe('optimizeImage', () => {
	it.each([
		['sample.jpg', 'jpeg'],
		['sample.png', 'png'],
		['sample.webp', 'webp'],
		['sample.gif', 'gif'],
		['sample.avif', 'avif'],
	])('optimizes %s and writes the output file', async (file, fmt) => {
		const out = await makeTempDir()
		const result = await optimizeImage(job(file, fmt, out), Q80)
		expect(result.inputPath).toBe(path.join(FIXTURES, file))
		expect(result.originalSize).toBe((await fs.stat(path.join(FIXTURES, file))).size)
		expect(result.newSize).toBe((await fs.stat(result.outputPath)).size)
		expect(result.duration).toBeGreaterThan(0)
	})

	it('converts JPEG to WebP', async () => {
		const out = await makeTempDir()
		const result = await optimizeImage(job('sample.jpg', 'jpeg', out, '.webp'), {
			quality: 80,
			format: 'webp',
		})
		expect(result.outputPath.endsWith('.webp')).toBe(true)
		expect((await sharp(result.outputPath).metadata()).format).toBe('webp')
	})

	it('resizes to the given max width', async () => {
		const out = await makeTempDir()
		const result = await optimizeImage(job('sample.jpg', 'jpeg', out), { quality: 80, resize: 50 })
		expect((await sharp(result.outputPath).metadata()).width).toBe(50)
	})

	it('never enlarges images smaller than the resize width', async () => {
		const out = await makeTempDir()
		const original = (await sharp(path.join(FIXTURES, 'sample.jpg')).metadata()).width as number
		const result = await optimizeImage(job('sample.jpg', 'jpeg', out), {
			quality: 80,
			resize: original * 10,
		})
		expect((await sharp(result.outputPath).metadata()).width).toBe(original)
	})

	it('quality 10 produces a smaller file than quality 95 when converting', async () => {
		// The fixtures are a few pixels; use an image with real detail
		const src = await makeTempDir()
		const out = await makeTempDir()
		const input = path.join(src, 'noise.png')
		const noise = Buffer.alloc(128 * 128 * 3)
		for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 251
		await sharp(noise, { raw: { width: 128, height: 128, channels: 3 } })
			.png()
			.toFile(input)
		const encode = (quality: number) =>
			optimizeImage(
				{ input, detectedFormat: 'png', output: path.join(out, `q${quality}.webp`) },
				{ quality, format: 'webp' },
			)
		const [low, high] = await Promise.all([encode(10), encode(95)])
		expect(low.newSize).toBeLessThan(high.newSize)
	})

	it('never produces a bigger file when keeping the format', async () => {
		const out = await makeTempDir()
		const result = await optimizeImage(job('sample.jpg', 'jpeg', out), { quality: 100 })
		expect(result.newSize).toBeLessThanOrEqual(result.originalSize)
		expect(result.newSize).toBe((await fs.stat(result.outputPath)).size)
	})

	it('applies EXIF orientation so phone photos are not sideways', async () => {
		const src = await makeTempDir()
		const out = await makeTempDir()
		const input = path.join(src, 'rotated.jpg')
		await sharp({ create: { width: 200, height: 100, channels: 3, background: 'red' } })
			.jpeg()
			.withMetadata({ orientation: 6 })
			.toFile(input)
		const result = await optimizeImage(
			{ input, detectedFormat: 'jpeg', output: path.join(out, 'r.webp') },
			{ quality: 80, format: 'webp' },
		)
		const meta = await sharp(result.outputPath).metadata()
		expect([meta.width, meta.height]).toEqual([100, 200])
	})

	it('flattens transparency onto white (not black) when converting to JPEG', async () => {
		const src = await makeTempDir()
		const out = await makeTempDir()
		const input = path.join(src, 'logo.png')
		await sharp({
			create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
		})
			.png()
			.toFile(input)
		const result = await optimizeImage(
			{ input, detectedFormat: 'png', output: path.join(out, 'logo.jpg') },
			{ quality: 80, format: 'jpeg' },
		)
		const { data } = await sharp(result.outputPath).raw().toBuffer({ resolveWithObject: true })
		expect(data[0]).toBeGreaterThan(240)
	})

	it('rejects with a meaningful error when the input is not an image', async () => {
		const out = await makeTempDir()
		await expect(optimizeImage(job('not-an-image.txt', 'jpeg', out, '.jpg'), Q80)).rejects.toThrow(
			/unsupported|invalid|format|image|Input/i,
		)
	})
})

describe('planJobs', () => {
	it('mirrors the folder structure inside the output folder', async () => {
		const out = await makeTempDir()
		const plan = await planJobs({ inputs: [FIXTURES], output: out })
		const nested = plan.jobs.find((j) => j.input.endsWith('nested.jpg'))
		expect(nested?.output).toBe(path.join(out, 'nested', 'nested.jpg'))
	})

	it('changes the extension when converting', async () => {
		const out = await makeTempDir()
		const plan = await planJobs({
			inputs: [path.join(FIXTURES, 'sample.png')],
			output: out,
			format: 'webp',
		})
		expect(plan.jobs[0].output).toBe(path.join(out, 'sample.webp'))
	})

	it('refuses to write into the source folder (would overwrite originals)', async () => {
		await expect(planJobs({ inputs: [FIXTURES], output: FIXTURES })).rejects.toThrow(
			/same as the source/,
		)
	})

	it('does not re-process its own output folder on a second run', async () => {
		const src = await makeTempDir()
		await fs.copyFile(path.join(FIXTURES, 'sample.jpg'), path.join(src, 'a.jpg'))
		const output = path.join(src, 'bulki-output')
		const first = await planJobs({ inputs: [src], output })
		await runBatch(first.jobs, Q80, 2)
		const second = await planJobs({ inputs: [src], output })
		expect(second.jobs.map((j) => path.basename(j.input))).toEqual(['a.jpg'])
	})

	it('gives distinct names when two sources convert to the same file', async () => {
		const src = await makeTempDir()
		await fs.copyFile(path.join(FIXTURES, 'sample.jpg'), path.join(src, 'photo.jpg'))
		await fs.copyFile(path.join(FIXTURES, 'sample.png'), path.join(src, 'photo.png'))
		const out = await makeTempDir()
		const plan = await planJobs({ inputs: [src], output: out, format: 'webp' })
		const outputs = plan.jobs.map((j) => path.basename(j.output))
		expect(new Set(outputs).size).toBe(2)
	})

	it('handles source and output paths with spaces', async () => {
		const src = await makeTempDir('bulki with spaces ')
		await fs.mkdir(path.join(src, 'My Photos'))
		await fs.copyFile(
			path.join(FIXTURES, 'sample.jpg'),
			path.join(src, 'My Photos', 'beach day.jpg'),
		)
		const output = path.join(src, 'Web Ready')
		const plan = await planJobs({ inputs: [path.join(src, 'My Photos')], output })
		const batch = await runBatch(plan.jobs, Q80, 2)
		expect(batch.errors).toEqual([])
		expect(await exists(path.join(output, 'beach day.jpg'))).toBe(true)
	})

	it('accepts several individual files from different folders', async () => {
		const out = await makeTempDir()
		const plan = await planJobs({
			inputs: [path.join(FIXTURES, 'sample.jpg'), path.join(FIXTURES, 'nested', 'nested.jpg')],
			output: out,
		})
		expect(plan.jobs.map((j) => path.relative(out, j.output)).sort()).toEqual([
			path.join('nested', 'nested.jpg'),
			'sample.jpg',
		])
	})
})

describe('runBatch', () => {
	it('keeps going when one file fails and reports it', async () => {
		const src = await makeTempDir()
		await fs.copyFile(path.join(FIXTURES, 'sample.jpg'), path.join(src, 'good.jpg'))
		await fs.writeFile(path.join(src, 'broken.jpg'), Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]))
		const out = await makeTempDir()
		const plan = await planJobs({ inputs: [src], output: out })
		const batch = await runBatch(plan.jobs, Q80, 2)
		expect(batch.results).toHaveLength(1)
		expect(batch.errors).toHaveLength(1)
		expect(batch.errors[0].file).toMatch(/broken\.jpg$/)
		// no half-written temp files are left behind
		expect((await fs.readdir(out)).filter((f) => f.endsWith('.tmp'))).toEqual([])
	})

	it('stops starting new files after abort', async () => {
		const out = await makeTempDir()
		const plan = await planJobs({ inputs: [FIXTURES], output: out })
		const controller = new AbortController()
		controller.abort()
		const batch = await runBatch(plan.jobs, Q80, 1, undefined, controller.signal)
		expect(batch.results).toHaveLength(0)
	})
})
