import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { Command } from 'commander'

const execFileAsync = promisify(execFile)

const HOOK_MARKER = '# bulki-pre-commit-hook'
const HOOK_END_MARKER = '# bulki-pre-commit-hook-end'

const HOOK_SCRIPT = `#!/bin/sh
${HOOK_MARKER}
# Auto-optimize staged images before commit
# Installed by: bulki hook install
# Remove with: bulki hook uninstall

STAGED=$(git diff --cached --name-only -z --diff-filter=ACM | tr '\\0' '\\n' | grep -iE '\\.(jpe?g|png|webp|gif|avif)$')

if [ -z "$STAGED" ]; then
  exit 0
fi

echo "bulki: optimizing staged images..."

# Prefer a local/global install; npx on every image is slow
if command -v bulki >/dev/null 2>&1; then
  BULKI="bulki"
elif [ -x ./node_modules/.bin/bulki ]; then
  BULKI="./node_modules/.bin/bulki"
else
  BULKI="npx --yes @puntoycoma/bulki"
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

echo "$STAGED" | while IFS= read -r img; do
  if [ -f "$img" ]; then
    ext="\${img##*.}"
    case "$(echo "$ext" | tr '[:upper:]' '[:lower:]')" in
      jpg|jpeg) fmt="jpeg" ;;
      png) fmt="png" ;;
      webp) fmt="webp" ;;
      gif) fmt="gif" ;;
      avif) fmt="avif" ;;
      *) continue ;;
    esac
    tmpfile="$tmpdir/$(basename "$img")"
    if $BULKI pipe -f "$fmt" -q 80 < "$img" > "$tmpfile" 2>/dev/null; then
      if [ -s "$tmpfile" ]; then
        mv "$tmpfile" "$img"
        git add "$img"
      fi
    fi
  fi
done

echo "bulki: done"
${HOOK_END_MARKER}
`

export class HookError extends Error {}

export async function installHook(cwd: string = process.cwd()): Promise<void> {
	const hooksDir = await findHooksDir(cwd)
	if (!hooksDir) {
		throw new HookError('Not a git repository. Run this from inside a git project.')
	}

	const hookPath = path.join(hooksDir, 'pre-commit')

	await fs.mkdir(hooksDir, { recursive: true })

	try {
		const existing = await fs.readFile(hookPath, 'utf-8')
		if (existing.includes(HOOK_MARKER)) {
			console.log('bulki hook is already installed.')
			return
		}
		await fs.appendFile(hookPath, `\n${HOOK_SCRIPT}`)
		await fs.chmod(hookPath, 0o755)
		console.log('bulki hook appended to existing pre-commit hook.')
	} catch {
		await fs.writeFile(hookPath, HOOK_SCRIPT, { mode: 0o755 })
		console.log('bulki pre-commit hook installed.')
	}

	console.log('Staged images will be auto-optimized before each commit.')
}

export async function uninstallHook(cwd: string = process.cwd()): Promise<void> {
	const hooksDir = await findHooksDir(cwd)
	if (!hooksDir) {
		throw new HookError('Not a git repository.')
	}

	const hookPath = path.join(hooksDir, 'pre-commit')

	try {
		const content = await fs.readFile(hookPath, 'utf-8')
		if (!content.includes(HOOK_MARKER)) {
			console.log('No bulki hook found in pre-commit.')
			return
		}

		const lines = content.split('\n')
		const markerIndex = lines.findIndex((l) => l.includes(HOOK_MARKER))

		let endIndex = lines.findIndex((l) => l.includes(HOOK_END_MARKER))
		if (endIndex === -1) endIndex = lines.length - 1

		const before = lines.slice(0, markerIndex).join('\n')
		const after = lines.slice(endIndex + 1).join('\n')
		const trimmed = `${before}\n${after}`.trim()

		if (trimmed === '' || trimmed === '#!/bin/sh') {
			await fs.unlink(hookPath)
			console.log('bulki pre-commit hook removed.')
		} else {
			await fs.writeFile(hookPath, `${trimmed}\n`, { mode: 0o755 })
			console.log('bulki section removed from pre-commit hook.')
		}
	} catch {
		console.log('No pre-commit hook found.')
	}
}

export const hookCommand = new Command('hook').description(
	'Manage git pre-commit hook for auto image optimization',
)

hookCommand
	.command('install')
	.description('Install pre-commit hook to optimize images on commit')
	.action(() => runOrExit(installHook))

hookCommand
	.command('uninstall')
	.description('Remove the bulki pre-commit hook')
	.action(() => runOrExit(uninstallHook))

async function runOrExit(fn: () => Promise<void>): Promise<void> {
	try {
		await fn()
	} catch (err) {
		console.error(`error: ${(err as Error).message}`)
		process.exit(1)
	}
}

/**
 * Resolve the hooks directory through git itself, so worktrees, submodules
 * (where `.git` is a file) and `core.hooksPath` all work. Falls back to walking
 * up for `.git/` when git isn't installed.
 */
async function findHooksDir(startPath: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync('git', ['rev-parse', '--git-path', 'hooks'], {
			cwd: startPath,
		})
		return path.resolve(startPath, stdout.trim())
	} catch {
		// not a repo, or git not installed
	}
	let current = path.resolve(startPath)
	while (true) {
		const gitPath = path.join(current, '.git')
		const stat = await fs.stat(gitPath).catch(() => null)
		if (stat?.isDirectory()) return path.join(gitPath, 'hooks')
		const parent = path.dirname(current)
		if (parent === current) return null
		current = parent
	}
}
