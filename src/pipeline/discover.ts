import fs from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_OUTPUT_FOLDER } from '../validation/options.js'

/**
 * Recursively yield absolute file paths under `dirPath`.
 * Skips hidden entries, symlinks, directories whose name is in `exclude`,
 * and folders called `bulki-output` (results of previous runs).
 */
export async function* discoverFiles(
	dirPath: string,
	exclude: string[] = [],
): AsyncGenerator<string> {
	const entries = await fs.readdir(dirPath, { withFileTypes: true })
	for (const entry of entries) {
		if (entry.name.startsWith('.')) continue
		if (entry.isSymbolicLink()) continue
		const fullPath = path.resolve(dirPath, entry.name)
		if (entry.isDirectory()) {
			if (exclude.includes(entry.name) || entry.name === DEFAULT_OUTPUT_FOLDER) continue
			try {
				yield* discoverFiles(fullPath, exclude)
			} catch {
				// An unreadable subfolder (permissions, removed mid-scan) must not abort the whole scan
			}
		} else if (entry.isFile()) {
			yield fullPath
		}
	}
}
