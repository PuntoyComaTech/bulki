import path from 'node:path'
import { Command } from 'commander'
import { processPool } from '../concurrency/pool.js'
import { createProgressBar } from '../output/progress.js'
import { buildJsonOutput, formatFileResult, formatSummary } from '../output/results.js'
import { collectImageFiles } from '../pipeline/discover.js'
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
	.option('--json', 'Output results as JSON')
	.option('--max-size <size>', 'Maximum file size budget (e.g., 200kb, 1mb)')
	.action(async (inputPath: string, opts: Partial<RawOptions>) => {
		let options: CompressOptions
		try {
			options = validateOptions(opts)
		} catch (err) {
			console.error((err as Error).message)
			process.exit(1)
		}

		const resolvedPath = path.resolve(inputPath)
		let filePaths: { path: string; format: string }[]
		let isDirectory: boolean
		try {
			const collected = await collectImageFiles(resolvedPath, options.exclude)
			filePaths = collected.files
			isDirectory = collected.isDirectory
		} catch {
			console.error(`Path not found: ${resolvedPath}`)
			process.exit(1)
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

		const sourcePath = isDirectory ? resolvedPath : path.dirname(resolvedPath)
		const startTime = performance.now()

		const progress = !options.verbose && !options.json ? createProgressBar(filePaths.length) : null

		const errors: Error[] = []
		const jsonErrors: { file: string; message: string }[] = []

		const processedResults = await processPool(
			filePaths,
			async (file) => {
				try {
					const result = await optimizeImage(file.path, {
						...options,
						sourcePath,
						detectedFormat: file.format,
					})
					if (options.verbose && !options.json) {
						console.log(formatFileResult(result))
					}
					progress?.tick()
					return result
				} catch (err) {
					errors.push(err as Error)
					jsonErrors.push({ file: file.path, message: (err as Error).message })
					progress?.tick()
					return null
				}
			},
			options.concurrency,
		)

		const validResults = processedResults.filter((r): r is FileResult => r !== null)
		const totalDuration = performance.now() - startTime

		if (options.json) {
			const output = buildJsonOutput(validResults, jsonErrors, totalDuration)
			if (options.maxSize) {
				for (const file of output.files) {
					if (file.newSize > options.maxSize) {
						file.exceeded = true
					}
				}
			}
			console.log(JSON.stringify(output))
		} else {
			console.log(formatSummary(validResults, errors, totalDuration))
		}

		if (validResults.length === 0 && errors.length > 0) {
			process.exit(1)
		}

		const maxSize = options.maxSize
		if (maxSize) {
			const exceeded = validResults.filter((r) => r.newSize > maxSize)
			if (exceeded.length > 0) {
				if (!options.json) {
					for (const r of exceeded) {
						console.warn(`File exceeds size budget: ${r.outputPath}`)
					}
				}
				process.exit(1)
			}
		}
	})
