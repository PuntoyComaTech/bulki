import { createRequire } from 'node:module'
import { Command } from 'commander'
import { compressCommand } from '../commands/compress.js'
import { hookCommand } from '../commands/hook.js'
import { mcpCommand } from '../commands/mcp.js'
import { pipeCommand } from '../commands/pipe.js'
import { watchCommand } from '../commands/watch.js'
import { parsePathInput } from '../pipeline/paths.js'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

const args = process.argv.slice(2)
const COMMANDS = new Set(['compress', 'hook', 'mcp', 'pipe', 'watch', 'help'])

// `bulki` alone, or `bulki <folder/images>` (e.g. dragged onto the terminal) → guided mode
const droppedPaths =
	args.length > 0 && !args[0].startsWith('-') && !COMMANDS.has(args[0])
		? parsePathInput(args.join(' '))
		: null

if (args.length === 0 || droppedPaths?.ok) {
	const { runInteractive } = await import('../interactive/index.js')
	await runInteractive(droppedPaths?.ok ? droppedPaths.paths : undefined)
} else {
	const program = new Command()
	program
		.name('bulki')
		.description('Fast image optimizer. Run `bulki` with no arguments for the guided mode.')
		.version(version)
		.showSuggestionAfterError()

	program.addCommand(compressCommand)
	program.addCommand(hookCommand)
	program.addCommand(mcpCommand)
	program.addCommand(pipeCommand)
	program.addCommand(watchCommand)
	await program.parseAsync()
}
