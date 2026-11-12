import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discoverFiles } from '../../src/pipeline/discover.js'

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures')

async function collectAsync<T>(gen: AsyncGenerator<T>): Promise<T[]> {
	const items: T[] = []
	for await (const item of gen) items.push(item)
	return items
}

let tempDir: string | undefined

afterEach(async () => {
	if (tempDir) {
		await fs.rm(tempDir, { recursive: true, force: true })
		tempDir = undefined
	}
})

describe('discoverFiles', () => {
	it('discovers all 7 files in the fixtures directory including nested ones', async () => {
		const files = await collectAsync(discoverFiles(FIXTURES))
		expect(files).toHaveLength(7)
	})

	it('includes files from nested subdirectories', async () => {
		const files = await collectAsync(discoverFiles(FIXTURES))
		const hasNested = files.some(
			(f) => f.includes('nested/nested.jpg') || f.includes('nested\\nested.jpg'),
		)
		expect(hasNested).toBe(true)
	})

	it('yields absolute paths', async () => {
		const files = await collectAsync(discoverFiles(FIXTURES))
		for (const file of files) {
			expect(path.isAbsolute(file)).toBe(true)
		}
	})

	it('excludes files inside directories matching an exclude pattern', async () => {
		const files = await collectAsync(discoverFiles(FIXTURES, ['nested']))
		const hasNested = files.some(
			(f) => f.includes('nested/nested.jpg') || f.includes('nested\\nested.jpg'),
		)
		expect(hasNested).toBe(false)
	})

	it('still yields root-level files when a nested dir is excluded', async () => {
		const files = await collectAsync(discoverFiles(FIXTURES, ['nested']))
		expect(files.length).toBeGreaterThan(0)
	})

	it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
		'skips an unreadable subfolder instead of failing the whole scan',
		async () => {
			tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-perm-'))
			await fs.writeFile(path.join(tempDir, 'ok.jpg'), '')
			await fs.mkdir(path.join(tempDir, 'locked'))
			await fs.writeFile(path.join(tempDir, 'locked', 'hidden.jpg'), '')
			await fs.chmod(path.join(tempDir, 'locked'), 0o000)
			try {
				const files = await collectAsync(discoverFiles(tempDir))
				expect(files.map((f) => path.basename(f))).toEqual(['ok.jpg'])
			} finally {
				await fs.chmod(path.join(tempDir, 'locked'), 0o755)
			}
		},
	)

	it('yields nothing for an empty directory', async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-empty-'))
		const files = await collectAsync(discoverFiles(tempDir))
		expect(files).toHaveLength(0)
	})

	it('throws an error with a message that is NOT the stub placeholder for a non-existent directory', async () => {
		const badPath = path.join(os.tmpdir(), 'bulki-nonexistent-dir-xyz-123')
		await expect(collectAsync(discoverFiles(badPath))).rejects.toThrow(
			/ENOENT|no such file|not found/i,
		)
	})
})
