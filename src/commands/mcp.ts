import fs from 'node:fs/promises'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Command } from 'commander'
import { z } from 'zod'
import { discoverFiles } from '../pipeline/discover.js'
import { detectFormat } from '../pipeline/filter.js'
import { optimizeImage } from '../pipeline/optimize.js'
import type { FileResult } from '../types/index.js'
import { parseSize } from '../validation/options.js'

export const mcpCommand = new Command('mcp')
	.description('Start MCP server for AI editor integration (Claude Code, Cursor, etc.)')
	.action(async () => {
		const server = new McpServer({
			name: 'bulki',
			version: '3.0.0',
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

				let stats: Awaited<ReturnType<typeof fs.stat>>
				try {
					stats = await fs.stat(resolvedPath)
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

				const filePaths: { path: string; format: string }[] = []
				if (stats.isDirectory()) {
					for await (const file of discoverFiles(resolvedPath, [])) {
						const fmt = await detectFormat(file)
						if (fmt) filePaths.push({ path: file, format: fmt })
					}
				} else {
					const fmt = await detectFormat(resolvedPath)
					if (fmt) filePaths.push({ path: resolvedPath, format: fmt })
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

				const sourcePath = stats.isDirectory() ? resolvedPath : path.dirname(resolvedPath)
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
				const totalOriginalSize = results.reduce((sum, r) => sum + r.originalSize, 0)
				const totalNewSize = results.reduce((sum, r) => sum + r.newSize, 0)
				const totalReduction =
					totalOriginalSize > 0 ? Math.round((1 - totalNewSize / totalOriginalSize) * 100) : 0

				const output = {
					files: results.map((r) => ({
						input: r.inputPath,
						output: r.outputPath,
						originalSize: r.originalSize,
						newSize: r.newSize,
						reduction: Math.round((1 - r.newSize / r.originalSize) * 100),
						format: r.format,
						exceeded: maxSizeBytes !== undefined ? r.newSize > maxSizeBytes : undefined,
					})),
					summary: {
						totalFiles: results.length,
						totalOriginalSize,
						totalNewSize,
						totalReduction,
						duration: Math.round(totalDuration),
						errors: errors.length,
					},
					errors,
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
