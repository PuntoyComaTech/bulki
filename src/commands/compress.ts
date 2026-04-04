import fs from 'node:fs/promises'
import path from 'node:path'
import { Command } from 'commander'
import { processPool } from '../concurrency/pool.js'
import { createProgressBar } from '../output/progress.js'
import { formatFileResult, formatSummary } from '../output/results.js'
import { discoverFiles } from '../pipeline/discover.js'
import { detectFormat } from '../pipeline/filter.js'
import { optimizeImage } from '../pipeline/optimize.js'
import type { CompressOptions, FileResult } from '../types/index.js'
import { type RawOptions, validateOptions } from '../validation/options.js'

export const compressCommand = new Command('compress')
	.description('Compress images in a file or directory')
	.argument('<path>', 'File or directory to process')
	.option('-q, --quality <n>', 'Output quality (1-100)', (v) => parseInt(v, 10), 70)
	.option('-f, --format <fmt>', 'Output format (jpeg, png, webp, gif, avif)')
	.option('-r, --resize <width>', 'Resize to width (px)', (v) => parseInt(v, 10))
	.option('-d, --destination <path>', 'Destination directory', '.')
	.option('-o, --output-folder <name>', 'Output subfolder name', 'bulki-output')
	.option('--concurrency <n>', 'Number of parallel operations', (v) => parseInt(v, 10))
	.option('--exclude <patterns...>', 'Directory names to exclude')
	.option('--dry-run', 'Show what would be processed without writing files')
	.option('--verbose', 'Show per-file output')
	.action(async (inputPath: string, opts: Partial<RawOptions>) => {
		let options: CompressOptions
		try {
			options = validateOptions(opts)
		} catch (err) {
			console.error((err as Error).message)
			process.exit(1)
		}

		const resolvedPath = path.resolve(inputPath)
		let stats: Awaited<ReturnType<typeof fs.stat>>
		try {
			stats = await fs.stat(resolvedPath)
		} catch {
			console.error(`Path not found: ${resolvedPath}`)
			process.exit(1)
		}

		const filePaths: { path: string; format: string }[] = []
		if (stats.isDirectory()) {
			for await (const file of discoverFiles(resolvedPath, options.exclude)) {
				const format = await detectFormat(file)
				if (format) {
					filePaths.push({ path: file, format })
				}
			}
		} else {
			const format = await detectFormat(resolvedPath)
			if (format) {
				filePaths.push({ path: resolvedPath, format })
			}
		}

		if (filePaths.length === 0) {
			console.log('No images found to process.')
			return
		}

		if (options.dryRun) {
			console.log(`Would process ${filePaths.length} image(s)`)
			for (const f of filePaths) console.log(`  ${path.basename(f.path)}`)
			return
		}

		const sourcePath = stats.isDirectory() ? resolvedPath : path.dirname(resolvedPath)
		const startTime = performance.now()

		const progress = !options.verbose ? createProgressBar(filePaths.length) : null

		const errors: Error[] = []

		const processedResults = await processPool(
			filePaths,
			async (file) => {
				try {
					const result = await optimizeImage(file.path, {
						...options,
						sourcePath,
						detectedFormat: file.format,
					})
					if (options.verbose) {
						console.log(formatFileResult(result))
					}
					progress?.tick()
					return result
				} catch (err) {
					errors.push(err as Error)
					progress?.tick()
					return null
				}
			},
			options.concurrency,
		)

		const validResults = processedResults.filter((r): r is FileResult => r !== null)
		const totalDuration = performance.now() - startTime

		console.log(formatSummary(validResults, errors, totalDuration))

		if (validResults.length === 0 && errors.length > 0) {
			process.exit(1)
		}
	})
