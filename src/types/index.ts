export type OutputFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'avif'

export interface FileResult {
	inputPath: string
	outputPath: string
	originalSize: number
	newSize: number
	format: string
	duration: number
	/** true when re-encoding would have made the file bigger, so the original bytes were copied */
	keptOriginal?: boolean
}

/** How every image is encoded. Shared by compress, watch, pipe, MCP and interactive mode. */
export interface EncodeSettings {
	quality: number
	format?: OutputFormat
	resize?: number
}

export interface CompressOptions extends EncodeSettings {
	/** Absolute path of the folder where optimized copies are written */
	output: string
	concurrency: number
	exclude: string[]
	dryRun: boolean
	verbose: boolean
	json: boolean
	maxSize?: number
}

/** One planned unit of work: read `input`, write `output`. */
export interface ImageJob {
	input: string
	detectedFormat: string
	output: string
}

export interface JsonFileResult {
	input: string
	output: string
	originalSize: number
	newSize: number
	reduction: number
	format: string
	duration: number
	keptOriginal?: boolean
	exceeded?: boolean
}

export interface JsonSummary {
	totalFiles: number
	totalOriginalSize: number
	totalNewSize: number
	totalReduction: number
	duration: number
	errors: number
}

export interface JsonError {
	file: string
	message: string
}

export interface JsonOutput {
	output?: string
	files: JsonFileResult[]
	summary: JsonSummary
	errors: JsonError[]
}
