import { createRequire } from 'node:module'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Command } from 'commander'
import { z } from 'zod'
import { buildJsonOutput } from '../output/results.js'
import { detectFormat, UNSUPPORTED } from '../pipeline/filter.js'
import { runBatch } from '../pipeline/optimize.js'
import { resolveUserPath } from '../pipeline/paths.js'
import { planJobs } from '../pipeline/plan.js'
import { defaultConcurrency, parseSize, resolveOutputDir } from '../validation/options.js'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

function text(payload: unknown) {
	return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] }
}

export const mcpCommand = new Command('mcp')
	.description('Start MCP server for AI editor integration (Claude Code, Cursor, etc.)')
	.action(async () => {
		const server = new McpServer({ name: 'bulki', version })

		server.tool(
			'compress',
			'Compress and optimize images (JPEG, PNG, WebP, GIF, AVIF). Originals are never modified; optimized copies are written to `output`.',
			{
				path: z.string().describe('File or directory path to compress'),
				quality: z.number().int().min(1).max(100).default(70).describe('Output quality (1-100)'),
				format: z
					.enum(['jpeg', 'png', 'webp', 'gif', 'avif'])
					.optional()
					.describe('Output format (omit to keep original)'),
				resize: z
					.number()
					.int()
					.positive()
					.optional()
					.describe('Max width in pixels (never enlarges)'),
				output: z
					.string()
					.optional()
					.describe('Folder where optimized images are written (default: ./bulki-output)'),
				destination: z.string().optional().describe('Deprecated: base folder, use `output`'),
				outputFolder: z.string().optional().describe('Deprecated: subfolder name, use `output`'),
				maxSize: z.string().optional().describe('Max file size budget (e.g., 200kb, 1mb)'),
			},
			async (params) => {
				try {
					const maxSizeBytes = params.maxSize ? parseSize(params.maxSize) : undefined
					const output = resolveOutputDir(params)
					const plan = await planJobs({
						inputs: [resolveUserPath(params.path)],
						output,
						format: params.format,
					})
					const settings = { quality: params.quality, format: params.format, resize: params.resize }
					const batch = await runBatch(plan.jobs, settings, defaultConcurrency())
					const result = buildJsonOutput(batch.results, batch.errors, batch.duration, output)
					if (maxSizeBytes !== undefined) {
						for (const file of result.files) if (file.newSize > maxSizeBytes) file.exceeded = true
					}
					return text(result)
				} catch (err) {
					return text({ error: (err as Error).message })
				}
			},
		)

		server.tool(
			'detect',
			'Detect if a file is an image and identify its format',
			{ path: z.string().describe('Path to the file') },
			async (params) => {
				const format = await detectFormat(path.resolve(resolveUserPath(params.path)))
				if (format === UNSUPPORTED) return text({ format: 'heic', isImage: true, supported: false })
				return text(format ? { format, isImage: true } : { format: null, isImage: false })
			},
		)

		await server.connect(new StdioServerTransport())
	})
