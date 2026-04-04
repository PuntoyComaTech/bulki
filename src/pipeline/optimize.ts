import fs from 'node:fs/promises'
import sharp from 'sharp'
import type { FormatEnum } from 'sharp'
import type { CompressOptions, FileResult } from '../types/index.js'
import { createDestinationPath } from './destination.js'

export async function optimizeImage(
	filePath: string,
	options: CompressOptions & { sourcePath: string; detectedFormat: string },
): Promise<FileResult> {
	const start = performance.now()

	const format = options.detectedFormat

	const outputFormat = options.format ?? format

	const destinationPath = await createDestinationPath(filePath, {
		destination: options.destination,
		outputFolder: options.outputFolder,
		sourcePath: options.sourcePath,
		toFormat: options.format,
	})

	const formatOptions: Partial<Record<keyof FormatEnum, Parameters<sharp.Sharp['toFormat']>[1]>> = {
		jpeg: { mozjpeg: true, quality: options.quality },
		png: { quality: options.quality },
		webp: { quality: options.quality },
		avif: { quality: options.quality },
		gif: {},
	}

	let pipeline = sharp(filePath, { animated: format === 'gif' })

	if (options.resize !== undefined) {
		pipeline = pipeline.resize(options.resize)
	}

	pipeline = pipeline.toFormat(outputFormat as keyof FormatEnum, formatOptions[outputFormat as keyof FormatEnum] ?? {})

	await pipeline.toFile(destinationPath)

	const [originalStat, newStat] = await Promise.all([
		fs.stat(filePath),
		fs.stat(destinationPath),
	])

	const duration = performance.now() - start

	return {
		inputPath: filePath,
		outputPath: destinationPath,
		originalSize: originalStat.size,
		newSize: newStat.size,
		format: outputFormat,
		duration,
	}
}
