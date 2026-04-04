import fs from 'node:fs/promises'
import path from 'node:path'

export async function createDestinationPath(
	filePath: string,
	options: {
		destination: string
		outputFolder: string
		sourcePath: string
		toFormat?: string
	},
): Promise<string> {
	const relativePath = path.relative(options.sourcePath, filePath)

	// Prevent path traversal — relative path must not escape the source
	if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
		throw new Error(`Path traversal detected: ${filePath}`)
	}

	let outputPath = path.join(path.resolve(options.destination), options.outputFolder, relativePath)

	if (options.toFormat) {
		const ext = path.extname(outputPath)
		outputPath = `${outputPath.slice(0, outputPath.length - ext.length)}.${options.toFormat}`
	}

	await fs.mkdir(path.dirname(outputPath), { recursive: true })
	return outputPath
}
