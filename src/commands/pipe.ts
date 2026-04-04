import { Command } from 'commander'
import sharp from 'sharp'
import { getFormatOptions } from '../pipeline/optimize.js'

export const pipeCommand = new Command('pipe')
	.description('Read image from stdin, write optimized image to stdout')
	.requiredOption('-f, --format <fmt>', 'Output format (jpeg, png, webp, gif, avif)')
	.option('-q, --quality <n>', 'Quality (1-100)', (v) => parseInt(v, 10), 70)
	.option('-r, --resize <width>', 'Resize to width (px)', (v) => parseInt(v, 10))
	.action(async (opts) => {
		const chunks: Buffer[] = []
		for await (const chunk of process.stdin) {
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

		const validFormats = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'avif']
		if (!validFormats.includes(format)) {
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
				outputFormat as Parameters<typeof sharp.prototype.toFormat>[0],
				formatOptions[outputFormat] ?? {},
			)

			const outputBuffer = await pipeline.toBuffer()
			process.stdout.write(outputBuffer)
		} catch (err) {
			process.stderr.write(`Error: ${(err as Error).message}\n`)
			process.exit(1)
		}
	})
