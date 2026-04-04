import { Command } from 'commander'
import type { FormatEnum } from 'sharp'
import sharp from 'sharp'
import { getFormatOptions } from '../pipeline/optimize.js'
import { VALID_FORMATS } from '../validation/options.js'

export const pipeCommand = new Command('pipe')
	.description('Read image from stdin, write optimized image to stdout')
	.requiredOption('-f, --format <fmt>', 'Output format (jpeg, png, webp, gif, avif)')
	.option('-q, --quality <n>', 'Quality (1-100)', (v) => parseInt(v, 10), 70)
	.option('-r, --resize <width>', 'Resize to width (px)', (v) => parseInt(v, 10))
	.action(async (opts) => {
		const MAX_INPUT_SIZE = 100 * 1024 * 1024 // 100 MB
		const chunks: Buffer[] = []
		let totalSize = 0
		for await (const chunk of process.stdin) {
			totalSize += chunk.length
			if (totalSize > MAX_INPUT_SIZE) {
				process.stderr.write('Error: input exceeds 100 MB limit\n')
				process.exit(1)
			}
			chunks.push(chunk)
		}
		const input = Buffer.concat(chunks)

		if (input.length === 0) {
			process.stderr.write('Error: no input received on stdin\n')
			process.exit(1)
		}

		const format = opts.format
		const quality = opts.quality
		const resize = opts.resize

		if (!VALID_FORMATS.includes(format)) {
			process.stderr.write(`Error: invalid format "${format}"\n`)
			process.exit(1)
		}

		const outputFormat = format === 'jpg' ? 'jpeg' : format

		const formatOptions = getFormatOptions(quality)

		try {
			let pipeline = sharp(input)

			if (resize) {
				pipeline = pipeline.resize(resize)
			}

			pipeline = pipeline.toFormat(
				outputFormat as keyof FormatEnum,
				formatOptions[outputFormat] ?? {},
			)

			const outputBuffer = await pipeline.toBuffer()
			process.stdout.write(outputBuffer)
		} catch (err) {
			process.stderr.write(`Error: ${(err as Error).message}\n`)
			process.exit(1)
		}
	})
