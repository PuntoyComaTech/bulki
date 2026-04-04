import * as p from '@clack/prompts'
import { isCancel } from '@clack/prompts'
import fs from 'node:fs/promises'
import path from 'node:path'
import { discoverFiles } from '../pipeline/discover.js'
import { detectFormat } from '../pipeline/filter.js'
import { optimizeImage } from '../pipeline/optimize.js'
import { processPool } from '../concurrency/pool.js'
import { formatSummary } from '../output/results.js'
import { formatBytes } from '../output/format-bytes.js'
import type { CompressOptions, FileResult } from '../types/index.js'
import { availableParallelism } from 'node:os'

const PRESETS = {
	web: {
		label: 'Web optimized',
		hint: 'WebP, quality 80, max 1920px',
		options: { format: 'webp', quality: 80, resize: 1920 },
	},
	social: {
		label: 'Social media',
		hint: 'PNG, quality 85, max 1080px — lossless colors',
		options: { format: 'png', quality: 85, resize: 1080 },
	},
	custom: {
		label: 'Custom settings',
		hint: 'Choose each option manually',
		options: null,
	},
}

export async function runInteractive(): Promise<void> {
	p.intro('Punto y Coma — bulki')

	// Select mode: preset or custom
	const presetKey = await p.select({
		message: 'Choose a preset or configure manually',
		options: [
			{ value: 'web', label: PRESETS.web.label, hint: PRESETS.web.hint },
			{ value: 'social', label: PRESETS.social.label, hint: PRESETS.social.hint },
			{ value: 'custom', label: PRESETS.custom.label, hint: PRESETS.custom.hint },
		],
	})

	if (isCancel(presetKey)) {
		p.cancel('Operation cancelled.')
		process.exit(0)
	}

	let format: string | undefined
	let quality: number
	let resize: number | undefined

	if (presetKey !== 'custom') {
		const preset = PRESETS[presetKey as keyof typeof PRESETS]
		const opts = preset.options as { format: string; quality: number; resize: number }
		format = opts.format
		quality = opts.quality
		resize = opts.resize
	} else {
		// Custom mode
		const settings = await p.group(
			{
				format: () =>
					p.select({
						message: 'Output format',
						options: [
							{ value: 'original', label: 'Keep original', hint: 'no conversion' },
							{ value: 'webp', label: 'WebP', hint: 'best compression/quality ratio' },
							{ value: 'avif', label: 'AVIF', hint: 'smallest files, slower encoding' },
							{ value: 'jpeg', label: 'JPEG', hint: 'universal compatibility' },
							{ value: 'png', label: 'PNG', hint: 'lossless' },
						],
					}),
				quality: () =>
					p.text({
						message: 'Quality (1-100)',
						placeholder: '70',
						initialValue: '70',
						validate(value) {
							const n = parseInt(value ?? '', 10)
							if (isNaN(n) || n < 1 || n > 100) return 'Must be between 1 and 100'
						},
					}),
				resize: () =>
					p.select({
						message: 'Resize images?',
						options: [
							{ value: 'none', label: 'No resize', hint: 'keep original dimensions' },
							{ value: '1920', label: '1920px', hint: 'Full HD width' },
							{ value: '1080', label: '1080px', hint: 'HD width' },
							{ value: '800', label: '800px', hint: 'web thumbnails' },
							{ value: 'custom', label: 'Custom width...' },
						],
					}),
			},
			{
				onCancel: () => {
					p.cancel('Operation cancelled.')
					process.exit(0)
				},
			},
		)

		let resizeValue: number | undefined
		if (settings.resize === 'custom') {
			const customWidth = await p.text({
				message: 'Enter custom width (px)',
				placeholder: '1200',
				validate(value) {
					const n = parseInt(value ?? '', 10)
					if (isNaN(n) || n <= 0) return 'Must be a positive number'
				},
			})
			if (isCancel(customWidth)) {
				p.cancel('Operation cancelled.')
				process.exit(0)
			}
			resizeValue = parseInt(customWidth as string, 10)
		} else if (settings.resize !== 'none') {
			resizeValue = parseInt(settings.resize as string, 10)
		}

		format = settings.format === 'original' ? undefined : (settings.format as string)
		quality = parseInt(settings.quality as string, 10)
		resize = resizeValue
	}

	// Path input
	const inputPath = await p.text({
		message: 'Path to images (file or directory)',
		placeholder: './photos',
		validate(value) {
			if (!value || value.trim() === '') return 'Path is required'
		},
	})

	if (isCancel(inputPath)) {
		p.cancel('Operation cancelled.')
		process.exit(0)
	}

	const resolvedPath = path.resolve(inputPath as string)

	let stats
	try {
		stats = await fs.stat(resolvedPath)
	} catch {
		p.cancel(`Path not found: ${resolvedPath}`)
		process.exit(1)
	}

	// Discover files
	const filePaths: { path: string; format: string }[] = []
	if (stats.isDirectory()) {
		for await (const file of discoverFiles(resolvedPath, [])) {
			const fmt = await detectFormat(file)
			if (fmt) {
				filePaths.push({ path: file, format: fmt })
			}
		}
	} else {
		const fmt = await detectFormat(resolvedPath)
		if (fmt) {
			filePaths.push({ path: resolvedPath, format: fmt })
		}
	}

	if (filePaths.length === 0) {
		p.outro('No images found to process.')
		return
	}

	// Destination input
	const destInput = await p.text({
		message: 'Destination directory',
		placeholder: '.',
		initialValue: '.',
	})

	if (isCancel(destInput)) {
		p.cancel('Operation cancelled.')
		process.exit(0)
	}

	const destination = (destInput as string) || '.'

	// Show summary
	const resizeLabel = resize ? `${resize}px` : 'No resize'
	const formatLabel = format ?? 'Keep original'
	p.note(
		[
			`Source:    ${resolvedPath} (${filePaths.length} images found)`,
			`Format:    ${formatLabel}`,
			`Quality:   ${quality!}`,
			`Resize:    ${resizeLabel}`,
			`Output:    ${path.join(destination, 'bulki-output')}`,
		].join('\n'),
		'Summary',
	)

	const confirmed = await p.confirm({ message: 'Start processing?' })

	if (isCancel(confirmed) || !confirmed) {
		p.cancel('Operation cancelled.')
		process.exit(0)
	}

	// Process images
	const options: CompressOptions = {
		quality: quality!,
		format,
		resize,
		destination,
		outputFolder: 'bulki-output',
		concurrency: availableParallelism(),
		exclude: [],
		dryRun: false,
		verbose: false,
	}

	const sourcePath = stats.isDirectory() ? resolvedPath : path.dirname(resolvedPath)
	const startTime = performance.now()
	const errors: Error[] = []

	const bar = p.progress({ max: filePaths.length })
	bar.start('Processing images')

	const processedResults = await processPool(
		filePaths,
		async (file) => {
			try {
				const result = await optimizeImage(file.path, {
					...options,
					sourcePath,
					detectedFormat: file.format,
				})
				bar.advance(1, `Processed ${path.basename(file.path)}`)
				return result
			} catch (err) {
				errors.push(err as Error)
				bar.advance(1, `Failed ${path.basename(file.path)}`)
				return null
			}
		},
		options.concurrency,
	)

	bar.stop('All images processed')

	const validResults = processedResults.filter((r): r is FileResult => r !== null)
	const totalDuration = performance.now() - startTime

	const summary = formatSummary(validResults, errors, totalDuration)
	p.note(summary, 'Results')

	p.outro('Done! Your optimized images are ready.')
}
