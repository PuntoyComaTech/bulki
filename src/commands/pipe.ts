import { Command } from 'commander'
import { encodeImage } from '../pipeline/encode.js'
import { UNSUPPORTED } from '../pipeline/filter.js'
import { DEFAULTS, parseInteger, validateEncodeSettings } from '../validation/options.js'

const MAX_INPUT_SIZE = 100 * 1024 * 1024 // 100 MB

export const pipeCommand = new Command('pipe')
	.description('Read image from stdin, write optimized image to stdout')
	.requiredOption('-f, --format <fmt>', 'Output format (jpeg, png, webp, gif, avif)')
	.option('-q, --quality <n>', 'Quality (1-100)', parseInteger, DEFAULTS.quality)
	.option('-r, --resize <width>', 'Max width in px (never enlarges)', parseInteger)
	.action(async (opts) => {
		let settings: ReturnType<typeof validateEncodeSettings>
		try {
			settings = validateEncodeSettings(opts)
		} catch (err) {
			return fail((err as Error).message)
		}

		const chunks: Buffer[] = []
		let totalSize = 0
		for await (const chunk of process.stdin) {
			totalSize += chunk.length
			if (totalSize > MAX_INPUT_SIZE) return fail('input exceeds 100 MB limit')
			chunks.push(chunk)
		}
		const input = Buffer.concat(chunks)
		if (input.length === 0) return fail('no input received on stdin')

		try {
			const detected = sniff(input)
			const { data } = await encodeImage(input, detected, settings)
			process.stdout.write(data)
		} catch (err) {
			fail((err as Error).message)
		}
	})

/** Same magic-byte rules as detectFormat, for an in-memory buffer. */
function sniff(buf: Buffer): string {
	if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg'
	if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png'
	if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP')
		return 'webp'
	if (buf.toString('latin1', 0, 3) === 'GIF') return 'gif'
	if (buf.toString('latin1', 4, 8) === 'ftyp') {
		const brand = buf.toString('latin1', 8, 12)
		return brand === 'avif' || brand === 'avis' ? 'avif' : UNSUPPORTED
	}
	return 'unknown'
}

function fail(message: string): never {
	process.stderr.write(`Error: ${message}\n`)
	process.exit(1)
}
