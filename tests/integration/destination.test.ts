import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDestinationPath } from '../../src/pipeline/destination.js'

const FIXTURES = path.resolve(import.meta.dirname, '../fixtures')

let tempDirs: string[] = []

afterEach(async () => {
	for (const dir of tempDirs) {
		await fs.rm(dir, { recursive: true, force: true })
	}
	tempDirs = []
})

async function makeTempDir(): Promise<string> {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-dest-'))
	tempDirs.push(dir)
	return dir
}

describe('createDestinationPath', () => {
	it('places output under {destination}/{outputFolder}/', async () => {
		const destination = await makeTempDir()
		const outputFolder = 'optimized'
		const filePath = path.join(FIXTURES, 'sample.jpg')

		const result = await createDestinationPath(filePath, {
			destination,
			outputFolder,
			sourcePath: FIXTURES,
		})

		expect(result.startsWith(path.join(destination, outputFolder))).toBe(true)
	})

	it('preserves the relative path from sourcePath for nested files', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'nested', 'nested.jpg')

		const result = await createDestinationPath(filePath, {
			destination,
			outputFolder: 'out',
			sourcePath: FIXTURES,
		})

		expect(result).toContain(path.join('nested', 'nested'))
	})

	it('changes the extension to toFormat when specified', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.jpg')

		const result = await createDestinationPath(filePath, {
			destination,
			outputFolder: 'out',
			sourcePath: FIXTURES,
			toFormat: 'webp',
		})

		expect(result.endsWith('.webp')).toBe(true)
	})

	it('keeps the original extension when toFormat is not specified', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.jpg')

		const result = await createDestinationPath(filePath, {
			destination,
			outputFolder: 'out',
			sourcePath: FIXTURES,
		})

		expect(result.endsWith('.jpg')).toBe(true)
	})

	it('creates the destination directory so it exists on disk', async () => {
		const destination = await makeTempDir()
		const filePath = path.join(FIXTURES, 'sample.jpg')

		await createDestinationPath(filePath, {
			destination,
			outputFolder: 'deeply/nested/output',
			sourcePath: FIXTURES,
		})

		const dirExists = await fs
			.stat(path.join(destination, 'deeply', 'nested', 'output'))
			.then(() => true)
			.catch(() => false)

		expect(dirExists).toBe(true)
	})
})
