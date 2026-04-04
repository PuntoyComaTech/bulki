import { Command } from 'commander'
import { createRequire } from 'node:module'
import { compressCommand } from '../commands/compress.js'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

if (process.argv.length <= 2) {
	const { runInteractive } = await import('../interactive/index.js')
	await runInteractive()
} else {
	const program = new Command()
	program
		.name('bulki')
		.description('Ultra-fast CLI image optimizer')
		.version(version)

	program.addCommand(compressCommand)
	program.parse()
}
