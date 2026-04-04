import fs from 'node:fs/promises'
import type { FormatEnum } from 'sharp'
import sharp from 'sharp'
import type { CompressOptions, FileResult, OptimizeParams } from '../types/index.js'
import { createDestinationPath } from './destination.js'

export function getFormatOptions(quality: number): Record<string, object> {
	return {
		jpeg: { mozjpeg: true, quality },
		png: { quality },
		webp: { quality },
		avif: { quality },
		gif: {},
	}
}

export async function optimizeImage(
	filePath: string,
	options: OptimizeParams | (CompressOptions & { sourcePath: string; detectedFormat: string }),
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

	const formatOptions = getFormatOptions(options.quality)

	let pipeline = sharp(filePath, {
		animated: format === 'gif' || format === 'webp' || format === 'avif',
	})

	if (options.resize !== undefined) {
		pipeline = pipeline.resize(options.resize)
	}

	pipeline = pipeline.toFormat(
		outputFormat as keyof FormatEnum,
		formatOptions[outputFormat as keyof FormatEnum] ?? {},
	)

	await pipeline.toFile(destinationPath)

	const [originalStat, newStat] = await Promise.all([fs.stat(filePath), fs.stat(destinationPath)])

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
