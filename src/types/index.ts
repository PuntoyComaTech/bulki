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
}
