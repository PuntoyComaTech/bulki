import { Command } from 'commander'
import { createProgressBar } from '../output/progress.js'
import { buildJsonOutput, formatFileResult, formatSummary } from '../output/results.js'
import { runBatch } from '../pipeline/optimize.js'
import { displayPath, resolveUserPath } from '../pipeline/paths.js'
import { PlanError, planJobs } from '../pipeline/plan.js'
import type { CompressOptions } from '../types/index.js'
import { DEFAULTS, parseInteger, type RawOptions, validateOptions } from '../validation/options.js'

export const compressCommand = new Command('compress')
	.description(
		'Compress images. Originals are never modified; optimized copies go to the output folder.',
	)
	.argument('<paths...>', 'Images and/or folders to optimize (quote paths with spaces)')
	.option('-o, --output <dir>', 'Folder where optimized images are written', DEFAULTS.output)
	.option('-q, --quality <n>', 'Output quality (1-100)', parseInteger, DEFAULTS.quality)
	.option('-f, --format <fmt>', 'Convert to jpeg, png, webp, gif or avif (default: keep format)')
	.option(
		'-r, --resize <width>',
		'Max width in px (smaller images are never enlarged)',
		parseInteger,
	)
	.option('--concurrency <n>', 'Images processed in parallel (1-32)', parseInteger)
	.option('--exclude <names...>', 'Folder names to skip')
	.option('--dry-run', 'Show what would be processed without writing files')
	.option('--verbose', 'Show one line per file')
	.option('--json', 'Output results as JSON')
	.option('--max-size <size>', 'Fail if any output is bigger than this (e.g. 200kb, 1mb)')
	// Legacy flags — kept so existing scripts and the GitHub Action keep working
	.option('-d, --destination <dir>', 'Deprecated: base folder; output goes to <dir>/bulki-output')
	.option('--output-folder <name>', 'Deprecated: subfolder name inside --destination')
	.addHelpText(
		'after',
		`
Examples:
  bulki compress ./photos                       → ./bulki-output
  bulki compress ./photos -o ./optimized -f webp
  bulki compress "My Photos" -o "Web Ready" -r 1920
  bulki compress *.png -f avif`,
	)
	.action(async (inputPaths: string[], opts: Partial<RawOptions>, cmd: Command) => {
		// `-o` used to be the subfolder name; keep `-d x -o name` meaning `x/name`
		const outputFromCli = cmd.getOptionValueSource('output') === 'cli'
		let options: CompressOptions
		try {
			options = validateOptions({ ...opts, output: outputFromCli ? opts.output : undefined })
		} catch (err) {
			fail((err as Error).message)
		}

		const inputs = inputPaths.map((p) => resolveUserPath(p))
		let plan: Awaited<ReturnType<typeof planJobs>>
		try {
			plan = await planJobs({
				inputs,
				output: options.output,
				format: options.format,
				exclude: options.exclude,
			})
		} catch (err) {
			if (err instanceof PlanError) fail(err.message)
			throw err
		}

		const log = options.json ? () => {} : console.log
		for (const s of plan.skipped) console.error(`Skipped ${s.file}: ${s.reason}`)

		if (plan.jobs.length === 0) {
			if (options.json) console.log(JSON.stringify(buildJsonOutput([], [], 0, options.output)))
			else log('No images found to process.')
			return
		}

		if (options.dryRun) {
			log(`Would optimize ${plan.jobs.length} image(s) into ${displayPath(options.output)}`)
			for (const job of plan.jobs) log(`  ${displayPath(job.input)} → ${displayPath(job.output)}`)
			return
		}

		const showBar = !options.verbose && !options.json && process.stdout.isTTY
		const progress = showBar ? createProgressBar(plan.jobs.length) : null

		const batch = await runBatch(plan.jobs, options, options.concurrency, (job, result, error) => {
			progress?.tick()
			if (!options.verbose || options.json) return
			if (result) console.log(formatFileResult(result))
			else console.error(`✗ ${displayPath(job.input)}: ${error?.message}`)
		})

		const maxSize = options.maxSize
		const exceeded = maxSize ? batch.results.filter((r) => r.newSize > maxSize) : []

		if (options.json) {
			const output = buildJsonOutput(batch.results, batch.errors, batch.duration, options.output)
			if (maxSize) for (const f of output.files) if (f.newSize > maxSize) f.exceeded = true
			console.log(JSON.stringify(output))
		} else {
			console.log(formatSummary(batch.results, batch.errors, batch.duration))
			if (!options.verbose) {
				for (const e of batch.errors) console.error(`✗ ${displayPath(e.file)}: ${e.message}`)
			}
			if (batch.results.length > 0) console.log(`Saved to ${displayPath(options.output)}`)
			for (const r of exceeded) console.warn(`File exceeds size budget: ${r.outputPath}`)
		}

		if (batch.errors.length > 0 || exceeded.length > 0) process.exitCode = 1
	})

function fail(message: string): never {
	console.error(`error: ${message}`)
	process.exit(1)
}
