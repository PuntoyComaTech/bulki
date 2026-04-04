import { describe, it, expect, afterEach } from 'vitest'
import { execa } from 'execa'
import path from 'node:path'
import fs from 'node:fs/promises'
import os from 'node:os'

const BIN = path.resolve(import.meta.dirname, '../../dist/bin/bulki.js')
const FIXTURES = path.resolve(import.meta.dirname, '../fixtures')

let tmpDir: string | undefined

afterEach(async () => {
	if (tmpDir) {
		await fs.rm(tmpDir, { recursive: true, force: true })
		tmpDir = undefined
	}
})

describe('bulki CLI', () => {
	describe('--help', () => {
		it('shows bulki in usage info', async () => {
			const { stdout } = await execa('node', [BIN, '--help'])
			expect(stdout).toContain('bulki')
		})

		it('shows compress command in usage info', async () => {
			const { stdout } = await execa('node', [BIN, '--help'])
			expect(stdout).toContain('compress')
		})
	})

	describe('--version', () => {
		it('outputs a semver version number', async () => {
			const { stdout } = await execa('node', [BIN, '--version'])
			expect(stdout).toMatch(/\d+\.\d+\.\d+/)
		})
	})

	describe('compress command — argument validation', () => {
		it('exits with non-zero code and prints a CLI error (not a node crash) when no path argument is provided', async () => {
			const result = await execa('node', [BIN, 'compress'], { reject: false })
			expect(result.exitCode).not.toBe(0)
			// The error must come from the CLI, not a node module-not-found crash
			expect(result.stderr).not.toContain('MODULE_NOT_FOUND')
			const combined = result.stdout + result.stderr
			expect(combined).toMatch(/error|missing|required|path/i)
		})

		it('exits with non-zero code and prints a CLI error (not a node crash) when path does not exist', async () => {
			const result = await execa('node', [BIN, 'compress', '/nonexistent/path'], { reject: false })
			expect(result.exitCode).not.toBe(0)
			// The error must come from the CLI, not a node module-not-found crash
			expect(result.stderr).not.toContain('MODULE_NOT_FOUND')
			const combined = result.stdout + result.stderr
			expect(combined).toMatch(/error|not found|does not exist|ENOENT/i)
		})

		it('exits with non-zero code and mentions quality when quality is above valid range', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const result = await execa(
				'node',
				[BIN, 'compress', FIXTURES, '-q', '200'],
				{ reject: false },
			)
			expect(result.exitCode).not.toBe(0)
			const combined = result.stdout + result.stderr
			expect(combined).toMatch(/quality/i)
		})
	})

	describe('compress command — directory processing', () => {
		it('exits with code 0 when processing a fixture directory', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const { exitCode } = await execa('node', [BIN, 'compress', FIXTURES, '-d', tmpDir])
			expect(exitCode).toBe(0)
		})

		it('creates output files inside bulki-output subdirectory of destination', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			await execa('node', [BIN, 'compress', FIXTURES, '-d', tmpDir])
			const outputDir = path.join(tmpDir, 'bulki-output')
			const stat = await fs.stat(outputDir)
			expect(stat.isDirectory()).toBe(true)
		})
	})

	describe('compress command — single file processing', () => {
		it('exits with code 0 when processing a single jpg file', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const { exitCode } = await execa('node', [
				BIN,
				'compress',
				path.join(FIXTURES, 'sample.jpg'),
				'-d',
				tmpDir,
			])
			expect(exitCode).toBe(0)
		})
	})

	describe('compress command — --dry-run', () => {
		it('exits with code 0 and does not create any output files when --dry-run is passed', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const { exitCode } = await execa('node', [BIN, 'compress', FIXTURES, '-d', tmpDir, '--dry-run'])
			expect(exitCode).toBe(0)
			const outputDir = path.join(tmpDir, 'bulki-output')
			const exists = await fs.stat(outputDir).then(() => true).catch(() => false)
			expect(exists).toBe(false)
		})
	})

	describe('compress command — --format', () => {
		it('produces a .webp output file when -f webp is passed', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			await execa('node', [
				BIN,
				'compress',
				path.join(FIXTURES, 'sample.jpg'),
				'-d',
				tmpDir,
				'-f',
				'webp',
			])
			const outputDir = path.join(tmpDir, 'bulki-output')
			const files = await fs.readdir(outputDir)
			const hasWebp = files.some((f) => f.endsWith('.webp'))
			expect(hasWebp).toBe(true)
		})
	})

	describe('compress command — --quality', () => {
		it('exits with code 0 when quality is set to 50', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const { exitCode } = await execa('node', [
				BIN,
				'compress',
				path.join(FIXTURES, 'sample.jpg'),
				'-d',
				tmpDir,
				'-q',
				'50',
			])
			expect(exitCode).toBe(0)
		})
	})

	describe('compress command — --verbose', () => {
		it('includes the filename in stdout output when --verbose is passed', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const { stdout } = await execa('node', [
				BIN,
				'compress',
				path.join(FIXTURES, 'sample.jpg'),
				'-d',
				tmpDir,
				'--verbose',
			])
			expect(stdout).toContain('sample.jpg')
		})
	})
})
