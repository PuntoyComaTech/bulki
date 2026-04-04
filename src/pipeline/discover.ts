import fs from 'node:fs/promises'
import path from 'node:path'
import { detectFormat } from './filter.js'

export async function collectImageFiles(
	inputPath: string,
	exclude: string[] = [],
): Promise<{ files: { path: string; format: string }[]; isDirectory: boolean }> {
	const stats = await fs.stat(inputPath)
	const isDirectory = stats.isDirectory()
	const files: { path: string; format: string }[] = []

	if (isDirectory) {
		for await (const file of discoverFiles(inputPath, exclude)) {
			const fmt = await detectFormat(file)
			if (fmt) files.push({ path: file, format: fmt })
		}
	} else {
		const fmt = await detectFormat(inputPath)
		if (fmt) files.push({ path: inputPath, format: fmt })
	}

	return { files, isDirectory }
}

export async function* discoverFiles(dirPath: string, exclude?: string[]): AsyncGenerator<string> {
	const entries = await fs.readdir(dirPath, { withFileTypes: true })
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue
		if (entry.isSymbolicLink()) continue
		const fullPath = path.resolve(dirPath, entry.name)
		if (entry.isDirectory()) {
			if (exclude?.includes(entry.name)) continue
			yield* discoverFiles(fullPath, exclude)
		} else if (entry.isFile()) {
			yield fullPath
		}
	}
}
