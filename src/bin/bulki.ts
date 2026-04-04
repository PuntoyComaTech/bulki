import { createRequire } from 'node:module'
import { Command } from 'commander'
import { compressCommand } from '../commands/compress.js'
import { hookCommand } from '../commands/hook.js'
import { mcpCommand } from '../commands/mcp.js'
import { pipeCommand } from '../commands/pipe.js'
import { watchCommand } from '../commands/watch.js'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

if (process.argv.length <= 2) {
	const { runInteractive } = await import('../interactive/index.js')
	await runInteractive()
} else {
	const program = new Command()
	program.name('bulki').description('Ultra-fast CLI image optimizer').version(version)

	program.addCommand(compressCommand)
	program.addCommand(hookCommand)
	program.addCommand(mcpCommand)
	program.addCommand(pipeCommand)
	program.addCommand(watchCommand)
	program.parse()
}
