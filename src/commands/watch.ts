import fs from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'
import { formatFileResult } from '../output/results.js'
import { detectFormat } from '../pipeline/filter.js'
import { optimizeImage } from '../pipeline/optimize.js'

export interface WatchOptions {
	quality?: number
	format?: string
	resize?: number
	destination?: string
	outputFolder?: string
}

export async function startWatch(dirPath: string, opts: WatchOptions = {}): Promise<void> {
	const resolvedPath = path.resolve(dirPath)

	// Verify path exists and is a directory
	try {
		const stats = await fs.promises.stat(resolvedPath)
		if (!stats.isDirectory()) {
			console.error('Watch path must be a directory')
			process.exit(1)
		}
	} catch {
		console.error(`Path not found: ${resolvedPath}`)
		process.exit(1)
	}

	const quality = opts.quality ?? 70
	const format = opts.format === 'jpg' ? 'jpeg' : opts.format
	const resize = opts.resize
	const destination = opts.destination ?? '.'
	const outputFolder = opts.outputFolder ?? 'bulki-output'

	console.log(`Watching ${resolvedPath} for new images...`)
	console.log('Press Ctrl+C to stop.\n')

	// Track processed files to avoid duplicates (fs.watch can fire multiple events)
	const processing = new Set<string>()

	// Use fs.watch with recursive option
	const watcher = fs.watch(resolvedPath, { recursive: true }, async (_eventType, filename) => {
		if (!filename) return

		const fullPath = path.resolve(resolvedPath, filename)

		// Skip if already processing this file
		if (processing.has(fullPath)) return
		processing.add(fullPath)

		// Skip files in the output folder to avoid infinite loops
		const resolvedDest = destination === '.' ? resolvedPath : path.resolve(destination)
		const outputDir = path.join(resolvedDest, outputFolder)
		if (fullPath.startsWith(outputDir)) {
			processing.delete(fullPath)
			return
		}

		// Small delay to let file writes complete
		await new Promise((r) => setTimeout(r, 100))

		// Check if file exists (could be a delete event)
		try {
			await fs.promises.stat(fullPath)
		} catch {
			return
		}

		// Check if it's an image
		const detectedFormat = await detectFormat(fullPath)
		if (!detectedFormat) {
			processing.delete(fullPath)
			return
		}

		try {
			const result = await optimizeImage(fullPath, {
				quality,
				format,
				resize,
				destination,
				outputFolder,
				concurrency: 1,
				exclude: [],
				dryRun: false,
				verbose: false,
				json: false,
				sourcePath: resolvedPath,
				detectedFormat,
			})
			console.log(formatFileResult(result))
		} catch (err) {
			console.error(`Error processing ${filename}: ${(err as Error).message}`)
		} finally {
			// Remove from processing after a delay to debounce
			setTimeout(() => processing.delete(fullPath), 1000)
		}
	})

	// Keep process alive and handle Ctrl+C
	process.on('SIGINT', () => {
		watcher.close()
		console.log('\nWatch stopped.')
		process.exit(0)
	})
}

export const watchCommand = new Command('watch')
	.description('Watch a directory and auto-optimize new images')
	.argument('<path>', 'Directory to watch')
	.option('-q, --quality <n>', 'Output quality (1-100)', (v) => parseInt(v, 10), 70)
	.option('-f, --format <fmt>', 'Output format (jpeg, png, webp, gif, avif)')
	.option('-r, --resize <width>', 'Resize to width (px)', (v) => parseInt(v, 10))
	.option('-d, --destination <path>', 'Destination directory', '.')
	.option('-o, --output-folder <name>', 'Output subfolder name', 'bulki-output')
	.action(async (dirPath: string, opts) => {
		await startWatch(dirPath, opts)
	})
