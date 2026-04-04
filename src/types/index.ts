export interface FileResult {
	inputPath: string
	outputPath: string
	originalSize: number
	newSize: number
	format: string
	duration: number
}

export interface CompressOptions {
	quality: number
	format?: string
	resize?: number
	destination: string
	outputFolder: string
	concurrency: number
	exclude: string[]
	dryRun: boolean
	verbose: boolean
	json: boolean
	maxSize?: number
}

export interface JsonFileResult {
	input: string
	output: string
	originalSize: number
	newSize: number
	reduction: number
	format: string
	duration: number
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
	files: JsonFileResult[]
	summary: JsonSummary
	errors: JsonError[]
}

export interface OptimizeParams {
	quality: number
	format?: string
	resize?: number
	destination: string
	outputFolder: string
	sourcePath: string
	detectedFormat: string
}
