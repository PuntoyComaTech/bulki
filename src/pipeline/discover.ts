import fs from 'node:fs/promises'
import path from 'node:path'

export async function* discoverFiles(
	dirPath: string,
	exclude?: string[],
): AsyncGenerator<string> {
	const entries = await fs.readdir(dirPath, { withFileTypes: true })
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue
		const fullPath = path.resolve(dirPath, entry.name)
		if (entry.isDirectory()) {
			if (exclude && exclude.includes(entry.name)) continue
			yield* discoverFiles(fullPath, exclude)
		} else if (entry.isFile()) {
			yield fullPath
		}
	}
}
