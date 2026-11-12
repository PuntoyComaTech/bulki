import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const isPosix = path.sep === '/'

/**
 * Normalize ONE path the way a human typed, pasted or drag-and-dropped it.
 *
 * Terminals hand us the same folder in many shapes:
 *   '/Users/me/My Photos'      (macOS Terminal / iTerm drag & drop: single quotes)
 *   /Users/me/My\ Photos       (shell-escaped spaces)
 *   "C:\Users\me\My Photos"    (Windows "Copy as path")
 *   file:///Users/me/My%20Photos
 * usually with a trailing space. All of them must resolve to the same folder.
 */
export function cleanPathInput(raw: string): string {
	let value = raw.trim()

	while (
		value.length >= 2 &&
		((value.startsWith("'") && value.endsWith("'")) ||
			(value.startsWith('"') && value.endsWith('"')))
	) {
		value = value.slice(1, -1).trim()
	}

	if (value.startsWith('file://')) {
		try {
			value = fileURLToPath(value)
		} catch {
			// not a valid file URL — keep as typed
		}
	}

	// Shell escapes (`My\ Photos`) — only on POSIX, where `\` is never a separator
	if (isPosix) value = value.replace(/\\(.)/g, '$1')

	return expandHome(value)
}

function expandHome(value: string): string {
	if (value === '~') return os.homedir()
	if (value.startsWith('~/') || value.startsWith('~\\'))
		return path.join(os.homedir(), value.slice(2))
	return value
}

/**
 * Split shell-like input into words, honoring quotes and backslash escapes.
 * Dragging several files into a terminal produces `'/a/one.jpg' '/a/two.jpg' `.
 */
export function splitShellWords(raw: string): string[] {
	const words: string[] = []
	let current = ''
	let quote: "'" | '"' | null = null
	let hasWord = false
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i]
		if (quote) {
			if (ch === quote) quote = null
			else if (ch === '\\' && quote === '"' && isPosix && i + 1 < raw.length) current += raw[++i]
			else current += ch
		} else if (ch === "'" || ch === '"') {
			quote = ch
			hasWord = true
		} else if (ch === '\\' && isPosix && i + 1 < raw.length) {
			current += raw[++i]
			hasWord = true
		} else if (/\s/.test(ch)) {
			if (hasWord) words.push(current)
			current = ''
			hasWord = false
		} else {
			current += ch
			hasWord = true
		}
	}
	if (hasWord) words.push(current)
	return words.map(expandHome)
}

/** cleanPathInput + make absolute. */
export function resolveUserPath(raw: string, cwd: string = process.cwd()): string {
	return path.resolve(cwd, cleanPathInput(raw))
}

export type ParsedPaths = { ok: true; paths: string[] } | { ok: false; error: string }

/**
 * Turn free-form user input (typed, pasted or dropped) into one or more existing
 * absolute paths. Never throws — returns a human readable error instead.
 */
export function parsePathInput(raw: string | undefined, cwd: string = process.cwd()): ParsedPaths {
	if (!raw || raw.trim() === '') return { ok: false, error: 'Please enter a path' }

	// 1. The whole thing is a single path (most common, handles spaces without quotes)
	const single = resolveUserPath(raw, cwd)
	if (fs.existsSync(single)) return { ok: true, paths: [single] }

	// 2. Several dropped files / quoted paths
	const words = splitShellWords(raw.trim())
	if (words.length > 1) {
		const resolved = words.map((w) => path.resolve(cwd, w))
		const missing = resolved.filter((p) => !fs.existsSync(p))
		if (missing.length === 0) return { ok: true, paths: resolved }
	}

	return {
		ok: false,
		error: `Can't find "${single}". Check the spelling, or drag the folder into this window.`,
	}
}

/** True when `child` is `parent` or lives inside it. Both must be absolute. */
export function isInside(child: string, parent: string): boolean {
	const rel = path.relative(parent, child)
	return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function samePath(a: string, b: string): boolean {
	const ra = path.resolve(a)
	const rb = path.resolve(b)
	// macOS and Windows file systems are case-insensitive by default
	return process.platform === 'linux' ? ra === rb : ra.toLowerCase() === rb.toLowerCase()
}

/** Deepest directory that contains every given absolute directory. */
export function commonDir(dirs: string[]): string {
	if (dirs.length === 0) return process.cwd()
	let common = path.resolve(dirs[0])
	for (const d of dirs.slice(1)) {
		while (!isInside(path.resolve(d), common)) {
			const parent = path.dirname(common)
			if (parent === common) return common
			common = parent
		}
	}
	return common
}

/** Absolute path shown to humans, with the home dir shortened to `~`. */
export function displayPath(absPath: string): string {
	const home = os.homedir()
	if (absPath === home) return '~'
	if (absPath.startsWith(home + path.sep)) return `~${absPath.slice(home.length)}`
	return absPath
}
