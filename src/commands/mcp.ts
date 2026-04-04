import { createRequire } from 'node:module'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Command } from 'commander'
import { z } from 'zod'
import { buildJsonOutput } from '../output/results.js'
import { collectImageFiles } from '../pipeline/discover.js'
import { optimizeImage } from '../pipeline/optimize.js'
import type { FileResult } from '../types/index.js'
import { parseSize } from '../validation/options.js'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

export const mcpCommand = new Command('mcp')
	.description('Start MCP server for AI editor integration (Claude Code, Cursor, etc.)')
	.action(async () => {
		const server = new McpServer({
			name: 'bulki',
			version,
		})

		server.tool(
			'compress',
			'Compress and optimize images. Supports JPEG, PNG, WebP, GIF, AVIF.',
			{
				path: z.string().describe('File or directory path to compress'),
				quality: z.number().min(1).max(100).default(70).describe('Output quality (1-100)'),
				format: z
					.enum(['jpeg', 'png', 'webp', 'gif', 'avif'])
					.optional()
					.describe('Output format (omit to keep original)'),
				resize: z.number().positive().optional().describe('Max width in pixels'),
				destination: z.string().default('.').describe('Output directory'),
				outputFolder: z.string().default('bulki-output').describe('Output folder name'),
				maxSize: z.string().optional().describe('Max file size budget (e.g., 200kb, 1mb)'),
			},
			async (params) => {
				const resolvedPath = path.resolve(params.path)

				let filePaths: { path: string; format: string }[]
				let isDirectory: boolean
				try {
					const collected = await collectImageFiles(resolvedPath, [])
					filePaths = collected.files
					isDirectory = collected.isDirectory
				} catch {
					return {
						content: [
							{
								type: 'text' as const,
								text: JSON.stringify({ error: `Path not found: ${resolvedPath}` }),
							},
						],
					}
				}

				if (filePaths.length === 0) {
					return {
						content: [
							{
								type: 'text' as const,
								text: JSON.stringify({ files: [], summary: { totalFiles: 0 } }),
							},
						],
					}
				}

				const sourcePath = isDirectory ? resolvedPath : path.dirname(resolvedPath)
				const startTime = performance.now()
				const results: FileResult[] = []
				const errors: { file: string; message: string }[] = []

				let maxSizeBytes: number | undefined
				if (params.maxSize) {
					try {
						maxSizeBytes = parseSize(params.maxSize)
					} catch (err) {
						return {
							content: [
								{
									type: 'text' as const,
									text: JSON.stringify({ error: (err as Error).message }),
								},
							],
						}
					}
				}

				for (const file of filePaths) {
					try {
						const result = await optimizeImage(file.path, {
							quality: params.quality,
							format: params.format,
							resize: params.resize,
							destination: params.destination,
							outputFolder: params.outputFolder,
							concurrency: 1,
							exclude: [],
							dryRun: false,
							verbose: false,
							json: false,
							sourcePath,
							detectedFormat: file.format,
						})
						results.push(result)
					} catch (err) {
						errors.push({ file: file.path, message: (err as Error).message })
					}
				}

				const totalDuration = performance.now() - startTime
				const output = buildJsonOutput(results, errors, totalDuration)
				if (maxSizeBytes !== undefined) {
					for (const file of output.files) {
						if (file.newSize > maxSizeBytes) {
							file.exceeded = true
						}
					}
				}

				return { content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }] }
			},
		)

		server.tool(
			'detect',
			'Detect if a file is an image and identify its format',
			{
				path: z.string().describe('Path to the file'),
			},
			async (params) => {
				const resolvedPath = path.resolve(params.path)
				const format = await detectFormat(resolvedPath)
				const result = format ? { format, isImage: true } : { format: null, isImage: false }
				return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] }
			},
		)

		const transport = new StdioServerTransport()
		await server.connect(transport)
	})
