import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import type { EncodeSettings, OutputFormat } from '../types/index.js'
import { UNSUPPORTED } from './filter.js'

// Every file in a batch is different — libvips' operation cache only costs memory here.
sharp.cache(false)

const execFileAsync = promisify(execFile)

/** Formats sharp can write with more than one frame. */
const ANIMATED_OUTPUTS = new Set<string>(['gif', 'webp'])
const ANIMATED_INPUTS = new Set<string>(['gif', 'webp'])

export function getFormatOptions(quality: number): Record<OutputFormat, object> {
	return {
		jpeg: { quality, mozjpeg: true },
		// `quality` only has an effect together with `palette` (lossy quantisation, like TinyPNG)
		png: { quality, palette: quality < 100, compressionLevel: 9, adaptiveFiltering: true },
		webp: { quality },
		avif: { quality },
		gif: {},
	}
}

/** Format written when the user didn't ask for a conversion. */
export function defaultOutputFormat(detectedFormat: string): OutputFormat {
	return detectedFormat === UNSUPPORTED ? 'jpeg' : (detectedFormat as OutputFormat)
}

export function extensionFor(format: OutputFormat): string {
	return format === 'jpeg' ? '.jpg' : `.${format}`
}

export interface EncodeResult {
	data: Buffer
	format: OutputFormat
	/** true when the re-encoded image was larger, so the original bytes are returned unchanged */
	keptOriginal: boolean
}

/**
 * Re-encode one image in memory.
 * - honours EXIF orientation (phone photos don't end up sideways)
 * - never upscales (`resize` is a maximum width)
 * - flattens transparency onto white for JPEG (instead of black)
 * - keeps animation when the output format supports it
 * - returns the original bytes if re-encoding to the same format made it bigger
 */
export async function encodeImage(
	input: Buffer,
	detectedFormat: string,
	settings: EncodeSettings,
	sourcePath?: string,
): Promise<EncodeResult> {
	const outputFormat = settings.format ?? defaultOutputFormat(detectedFormat)

	let source = input
	let sourceFormat = detectedFormat
	if (detectedFormat === UNSUPPORTED) {
		source = await decodeHeic(input, sourcePath)
		sourceFormat = 'jpeg'
	}

	const animated = ANIMATED_INPUTS.has(sourceFormat) && ANIMATED_OUTPUTS.has(outputFormat)
	let pipeline = sharp(source, { animated, failOn: 'error' })
	if (!animated) pipeline = pipeline.autoOrient()
	if (settings.resize !== undefined) {
		pipeline = pipeline.resize({ width: settings.resize, withoutEnlargement: true })
	}
	if (outputFormat === 'jpeg') pipeline = pipeline.flatten({ background: '#ffffff' })

	const data = await pipeline
		.toFormat(outputFormat, getFormatOptions(settings.quality)[outputFormat])
		.toBuffer()

	if (
		outputFormat === sourceFormat &&
		detectedFormat !== UNSUPPORTED &&
		data.length >= input.length
	) {
		// Only safe to fall back when the original already satisfies the requested size
		const fitsWidth =
			settings.resize === undefined ||
			((await sharp(input).metadata()).width ?? Number.POSITIVE_INFINITY) <= settings.resize
		if (fitsWidth) return { data: input, format: outputFormat, keptOriginal: true }
	}

	return { data, format: outputFormat, keptOriginal: false }
}

/**
 * The libvips build bundled with sharp can't decode HEVC (HEIC photos from iPhones).
 * On macOS the built-in `sips` tool can, so we convert through it.
 */
async function decodeHeic(input: Buffer, sourcePath?: string): Promise<Buffer> {
	if (process.platform !== 'darwin') {
		throw new Error(
			'HEIC/HEIF photos are not supported on this system. Export them as JPEG first (or run bulki on macOS).',
		)
	}
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-heic-'))
	try {
		let inPath = sourcePath
		if (!inPath) {
			inPath = path.join(tmpDir, 'input.heic')
			await fs.writeFile(inPath, input)
		}
		const outPath = path.join(tmpDir, 'converted.jpg')
		await execFileAsync('sips', [
			'-s',
			'format',
			'jpeg',
			'-s',
			'formatOptions',
			'best',
			inPath,
			'--out',
			outPath,
		])
		return await fs.readFile(outPath)
	} catch (err) {
		throw new Error(`Could not convert HEIC photo: ${(err as Error).message.split('\n')[0]}`)
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true })
	}
}
