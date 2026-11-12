import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'

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
			const result = await execa('node', [BIN, 'compress', FIXTURES, '-q', '200'], {
				reject: false,
			})
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
			const { exitCode } = await execa('node', [
				BIN,
				'compress',
				FIXTURES,
				'-d',
				tmpDir,
				'--dry-run',
			])
			expect(exitCode).toBe(0)
			const outputDir = path.join(tmpDir, 'bulki-output')
			const exists = await fs
				.stat(outputDir)
				.then(() => true)
				.catch(() => false)
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

	describe('compress command — --json', () => {
		it('outputs valid JSON when --json flag is passed', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const { stdout } = await execa('node', [BIN, 'compress', FIXTURES, '-d', tmpDir, '--json'])
			expect(() => JSON.parse(stdout)).not.toThrow()
		})

		it('outputs JSON with a files array when --json flag is passed', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const { stdout } = await execa('node', [BIN, 'compress', FIXTURES, '-d', tmpDir, '--json'])
			const parsed = JSON.parse(stdout)
			expect(Array.isArray(parsed.files)).toBe(true)
		})

		it('outputs JSON with summary and errors keys', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const { stdout } = await execa('node', [BIN, 'compress', FIXTURES, '-d', tmpDir, '--json'])
			const parsed = JSON.parse(stdout)
			expect(parsed).toHaveProperty('summary')
			expect(parsed).toHaveProperty('errors')
		})
	})

	describe('compress command — --max-size', () => {
		it('exits with non-zero code when --max-size 1b is passed (all files exceed 1 byte)', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const result = await execa(
				'node',
				[BIN, 'compress', FIXTURES, '-d', tmpDir, '--max-size', '1b'],
				{ reject: false },
			)
			expect(result.exitCode).not.toBe(0)
		})

		it('exits with code 0 when --max-size 1mb is passed (all fixtures are small)', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const { exitCode } = await execa('node', [
				BIN,
				'compress',
				FIXTURES,
				'-d',
				tmpDir,
				'--max-size',
				'1mb',
			])
			expect(exitCode).toBe(0)
		})
	})

	describe('compress command — output folder & paths', () => {
		it('-o is the exact output folder', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const out = path.join(tmpDir, 'optimized')
			await execa('node', [BIN, 'compress', path.join(FIXTURES, 'sample.jpg'), '-o', out])
			expect(await fs.readdir(out)).toEqual(['sample.jpg'])
		})

		it('defaults to ./bulki-output in the current directory', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const { stdout } = await execa('node', [BIN, 'compress', path.join(FIXTURES, 'sample.jpg')], {
				cwd: tmpDir,
			})
			expect(await fs.readdir(path.join(tmpDir, 'bulki-output'))).toEqual(['sample.jpg'])
			expect(stdout).toContain('bulki-output')
		})

		it('works with spaces in input and output paths', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki with spaces '))
			const src = path.join(tmpDir, 'My Photos')
			await fs.mkdir(src)
			await fs.copyFile(path.join(FIXTURES, 'sample.jpg'), path.join(src, 'beach day.jpg'))
			const out = path.join(tmpDir, 'Web Ready')
			const { exitCode } = await execa('node', [BIN, 'compress', src, '-o', out])
			expect(exitCode).toBe(0)
			expect(await fs.readdir(out)).toEqual(['beach day.jpg'])
		})

		it('accepts several paths (e.g. a shell glob)', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const { exitCode } = await execa('node', [
				BIN,
				'compress',
				path.join(FIXTURES, 'sample.jpg'),
				path.join(FIXTURES, 'sample.png'),
				'-o',
				tmpDir,
			])
			expect(exitCode).toBe(0)
			expect((await fs.readdir(tmpDir)).sort()).toEqual(['sample.jpg', 'sample.png'])
		})

		it('legacy -d <dir> -o <name> still means <dir>/<name>', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			await execa('node', [
				BIN,
				'compress',
				path.join(FIXTURES, 'sample.jpg'),
				'-d',
				tmpDir,
				'-o',
				'web',
			])
			expect(await fs.readdir(path.join(tmpDir, 'web'))).toEqual(['sample.jpg'])
		})

		it('running twice in place does not nest bulki-output/bulki-output', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			await fs.copyFile(path.join(FIXTURES, 'sample.jpg'), path.join(tmpDir, 'a.jpg'))
			await execa('node', [BIN, 'compress', '.'], { cwd: tmpDir })
			await execa('node', [BIN, 'compress', '.'], { cwd: tmpDir })
			expect(await fs.readdir(path.join(tmpDir, 'bulki-output'))).toEqual(['a.jpg'])
		})

		it('refuses to write over the originals', async () => {
			const result = await execa('node', [BIN, 'compress', FIXTURES, '-o', FIXTURES], {
				reject: false,
			})
			expect(result.exitCode).not.toBe(0)
			expect(result.stderr).toMatch(/same as the source/)
		})

		it('exits non-zero and names the file when an image fails', async () => {
			tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-'))
			const src = path.join(tmpDir, 'src')
			await fs.mkdir(src)
			await fs.copyFile(path.join(FIXTURES, 'sample.jpg'), path.join(src, 'good.jpg'))
			await fs.writeFile(path.join(src, 'broken.jpg'), Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]))
			const result = await execa('node', [BIN, 'compress', src, '-o', path.join(tmpDir, 'out')], {
				reject: false,
			})
			expect(result.exitCode).toBe(1)
			expect(result.stderr).toContain('broken.jpg')
			expect(await fs.readdir(path.join(tmpDir, 'out'))).toEqual(['good.jpg'])
		})

		it('rejects a non-numeric quality instead of truncating it', async () => {
			const result = await execa('node', [BIN, 'compress', FIXTURES, '-q', '80abc', '--dry-run'], {
				reject: false,
			})
			expect(result.exitCode).not.toBe(0)
			expect(result.stderr).toMatch(/quality/i)
		})
	})

	describe('hook command', () => {
		it('hook install creates pre-commit hook', async () => {
			const hookTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-hook-'))
			try {
				await execa('git', ['init'], { cwd: hookTmpDir })

				const { exitCode, stdout } = await execa('node', [BIN, 'hook', 'install'], {
					cwd: hookTmpDir,
				})

				expect(exitCode).toBe(0)
				expect(stdout).toContain('installed')

				const hookPath = path.join(hookTmpDir, '.git', 'hooks', 'pre-commit')
				const hookContent = await fs.readFile(hookPath, 'utf-8')
				expect(hookContent).toContain('bulki')
			} finally {
				await fs.rm(hookTmpDir, { recursive: true, force: true })
			}
		})

		it('hook uninstall removes pre-commit hook', async () => {
			const hookTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-hook-'))
			try {
				await execa('git', ['init'], { cwd: hookTmpDir })

				await execa('node', [BIN, 'hook', 'install'], { cwd: hookTmpDir })

				const { exitCode, stdout } = await execa('node', [BIN, 'hook', 'uninstall'], {
					cwd: hookTmpDir,
				})

				expect(exitCode).toBe(0)
				expect(stdout).toContain('removed')
			} finally {
				await fs.rm(hookTmpDir, { recursive: true, force: true })
			}
		})

		it('hook install outside git repo shows error', async () => {
			const hookTmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki-nogit-'))
			try {
				const result = await execa('node', [BIN, 'hook', 'install'], {
					cwd: hookTmpDir,
					reject: false,
				})

				expect(result.exitCode).not.toBe(0)
			} finally {
				await fs.rm(hookTmpDir, { recursive: true, force: true })
			}
		})
	})

	describe('pipe command', () => {
		it('reads image from stdin and writes to stdout', async () => {
			const inputPath = path.join(FIXTURES, 'sample.jpg')
			const input = await fs.readFile(inputPath)

			const { stdout } = await execa('node', [BIN, 'pipe', '-f', 'webp'], {
				input,
				encoding: 'buffer',
			})

			expect(stdout.length).toBeGreaterThan(0)

			const metadata = await sharp(Buffer.from(stdout)).metadata()
			expect(metadata.format).toBe('webp')
		})

		it('pipe with quality option works', async () => {
			const input = await fs.readFile(path.join(FIXTURES, 'sample.jpg'))

			const { stdout } = await execa('node', [BIN, 'pipe', '-f', 'jpeg', '-q', '10'], {
				input,
				encoding: 'buffer',
			})

			expect(stdout.length).toBeGreaterThan(0)
			expect(stdout.length).toBeLessThan(input.length + 500)
		})

		it('pipe with resize option works', async () => {
			const input = await fs.readFile(path.join(FIXTURES, 'sample.jpg'))

			const { stdout } = await execa('node', [BIN, 'pipe', '-f', 'jpeg', '-r', '50'], {
				input,
				encoding: 'buffer',
			})

			const metadata = await sharp(Buffer.from(stdout)).metadata()
			expect(metadata.width).toBe(50)
		})

		it('pipe with no stdin shows error', async () => {
			const result = await execa('node', [BIN, 'pipe', '-f', 'webp'], {
				input: Buffer.alloc(0),
				reject: false,
			})
			expect(result.exitCode).not.toBe(0)
		})

		it('pipe without format flag shows error', async () => {
			const input = await fs.readFile(path.join(FIXTURES, 'sample.jpg'))
			const result = await execa('node', [BIN, 'pipe'], {
				input,
				reject: false,
			})
			expect(result.exitCode).not.toBe(0)
		})
	})
})
