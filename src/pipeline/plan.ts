import fs from 'node:fs/promises'
import path from 'node:path'
import { processPool } from '../concurrency/pool.js'
import type { ImageJob, OutputFormat } from '../types/index.js'
import { discoverFiles } from './discover.js'
import { defaultOutputFormat, extensionFor } from './encode.js'
import { detectFormat, UNSUPPORTED } from './filter.js'
import { commonDir, isInside, samePath } from './paths.js'

export class PlanError extends Error {}

export interface Scan {
	inputs: string[]
	/** Folder whose structure is mirrored inside the output folder */
	sourceRoot: string
	images: { file: string; detectedFormat: string }[]
}

export interface Plan {
	sourceRoot: string
	output: string
	jobs: ImageJob[]
	/** Images that were found but won't be processed, with the reason */
	skipped: { file: string; reason: string }[]
}

/** Find every image under the given files/folders (absolute paths). Nothing is written. */
export async function scanInputs(inputs: string[], exclude: string[] = []): Promise<Scan> {
	if (inputs.length === 0) throw new PlanError('No input path given')

	const candidates: string[] = []
	const dirs: string[] = []
	for (const input of inputs) {
		const stat = await fs.stat(input).catch(() => null)
		if (!stat) throw new PlanError(`Path not found: ${input}`)
		if (stat.isDirectory()) {
			dirs.push(input)
			for await (const file of discoverFiles(input, exclude)) candidates.push(file)
		} else {
			dirs.push(path.dirname(input))
			candidates.push(input)
		}
	}

	const unique = [...new Set(candidates)]
	const formats = await processPool(unique, detectFormat, 32)
	const images = unique
		.map((file, i) => ({ file, detectedFormat: formats[i] as string }))
		.filter((img) => img.detectedFormat !== null)
		.sort((a, b) => a.file.localeCompare(b.file))

	return { inputs, sourceRoot: commonDir(dirs), images }
}

/** Decide where each optimized copy goes. Throws PlanError if the output would overwrite originals. */
export function assignOutputs(scan: Scan, output: string, format?: OutputFormat): Plan {
	if (samePath(output, scan.sourceRoot) || scan.inputs.some((i) => samePath(i, output))) {
		throw new PlanError(
			'The output folder is the same as the source folder — that would overwrite your originals. Choose a different output folder.',
		)
	}

	const jobs: ImageJob[] = []
	const skipped: Plan['skipped'] = []
	const taken = new Set<string>()

	for (const { file, detectedFormat } of scan.images) {
		// Never re-process our own output when it lives inside the source folder
		if (isInside(file, output)) continue

		const target = format ?? defaultOutputFormat(detectedFormat)
		const parsed = path.parse(path.relative(scan.sourceRoot, file))
		const keepExt = format === undefined && detectedFormat !== UNSUPPORTED
		const ext = keepExt ? parsed.ext : extensionFor(target)

		let out = path.join(output, parsed.dir, `${parsed.name}${ext}`)
		// photo.png + photo.jpg → both photo.webp: give the second one a distinct name
		if (taken.has(out.toLowerCase())) {
			out = path.join(
				output,
				parsed.dir,
				`${parsed.name}-${parsed.ext.slice(1).toLowerCase()}${ext}`,
			)
		}
		if (taken.has(out.toLowerCase())) {
			skipped.push({ file, reason: 'another image already produces the same output name' })
			continue
		}
		taken.add(out.toLowerCase())
		jobs.push({ input: file, detectedFormat, output: out })
	}

	return { sourceRoot: scan.sourceRoot, output, jobs, skipped }
}

export interface PlanInput {
	inputs: string[]
	output: string
	format?: OutputFormat
	exclude?: string[]
}

export async function planJobs({ inputs, output, format, exclude = [] }: PlanInput): Promise<Plan> {
	return assignOutputs(await scanInputs(inputs, exclude), output, format)
}
