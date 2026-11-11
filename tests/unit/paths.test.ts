import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
	cleanPathInput,
	commonDir,
	isInside,
	parsePathInput,
	splitShellWords,
} from '../../src/pipeline/paths.js'

const posix = path.sep === '/'

describe('cleanPathInput', () => {
	it('strips single quotes added by macOS drag & drop, plus the trailing space', () => {
		expect(cleanPathInput("'/Users/me/My Photos' ")).toBe('/Users/me/My Photos')
	})

	it('strips double quotes (Windows "Copy as path")', () => {
		expect(cleanPathInput('"/Users/me/My Photos"')).toBe('/Users/me/My Photos')
	})

	it.runIf(posix)('unescapes backslash-escaped spaces', () => {
		expect(cleanPathInput('/Users/me/My\\ Photos\\ 2024 ')).toBe('/Users/me/My Photos 2024')
	})

	it('converts file:// URLs', () => {
		expect(cleanPathInput('file:///tmp/My%20Photos')).toBe(path.resolve('/tmp/My Photos'))
	})

	it('expands ~', () => {
		expect(cleanPathInput('~/Pictures')).toBe(path.join(os.homedir(), 'Pictures'))
	})

	it('leaves a plain path with spaces untouched', () => {
		expect(cleanPathInput('/Users/me/My Photos')).toBe('/Users/me/My Photos')
	})
})

describe('splitShellWords', () => {
	it('splits several dropped paths', () => {
		expect(splitShellWords("'/a/one photo.jpg' '/a/two.jpg' ")).toEqual([
			'/a/one photo.jpg',
			'/a/two.jpg',
		])
	})

	it.runIf(posix)('honours backslash escapes', () => {
		expect(splitShellWords('/a/one\\ photo.jpg /a/two.jpg')).toEqual([
			'/a/one photo.jpg',
			'/a/two.jpg',
		])
	})
})

describe('parsePathInput', () => {
	let dir: string
	beforeAll(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bulki paths '))
		await fs.mkdir(path.join(dir, 'My Photos'))
		await fs.writeFile(path.join(dir, 'My Photos', 'a b.jpg'), '')
		await fs.writeFile(path.join(dir, 'My Photos', 'c.jpg'), '')
	})
	afterAll(async () => {
		await fs.rm(dir, { recursive: true, force: true })
	})

	it('accepts an unquoted path with spaces', () => {
		const r = parsePathInput(path.join(dir, 'My Photos'))
		expect(r).toEqual({ ok: true, paths: [path.join(dir, 'My Photos')] })
	})

	it('accepts a quoted drag & drop path', () => {
		const r = parsePathInput(`'${path.join(dir, 'My Photos')}' `)
		expect(r).toEqual({ ok: true, paths: [path.join(dir, 'My Photos')] })
	})

	it('accepts several dropped files', () => {
		const a = path.join(dir, 'My Photos', 'a b.jpg')
		const c = path.join(dir, 'My Photos', 'c.jpg')
		const r = parsePathInput(`'${a}' '${c}' `)
		expect(r).toEqual({ ok: true, paths: [a, c] })
	})

	it('resolves relative paths against the given cwd', () => {
		expect(parsePathInput('My Photos', dir)).toEqual({
			ok: true,
			paths: [path.join(dir, 'My Photos')],
		})
	})

	it('returns an error (never throws) for a missing path', () => {
		const r = parsePathInput(path.join(dir, 'nope'))
		expect(r.ok).toBe(false)
		if (!r.ok) expect(r.error).toMatch(/Can't find/)
	})

	it('returns an error for empty input', () => {
		expect(parsePathInput('   ').ok).toBe(false)
	})
})

describe('isInside / commonDir', () => {
	it('detects nesting', () => {
		expect(isInside(path.resolve('/a/b/c'), path.resolve('/a/b'))).toBe(true)
		expect(isInside(path.resolve('/a/b'), path.resolve('/a/b'))).toBe(true)
		expect(isInside(path.resolve('/a/bc'), path.resolve('/a/b'))).toBe(false)
	})

	it('finds the deepest common folder', () => {
		expect(commonDir([path.resolve('/a/b/c'), path.resolve('/a/b/d/e')])).toBe(path.resolve('/a/b'))
	})
})
