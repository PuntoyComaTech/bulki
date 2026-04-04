import fs from 'node:fs/promises'
import path from 'node:path'
import { Command } from 'commander'

const HOOK_MARKER = '# bulki-pre-commit-hook'

const HOOK_SCRIPT = `#!/bin/sh
${HOOK_MARKER}
# Auto-optimize staged images before commit
# Installed by: bulki hook install
# Remove with: bulki hook uninstall

STAGED_IMAGES=$(git diff --cached --name-only --diff-filter=ACM | grep -iE '\\.(jpe?g|png|webp|gif|avif)$')

if [ -z "$STAGED_IMAGES" ]; then
  exit 0
fi

echo "bulki: optimizing staged images..."

for img in $STAGED_IMAGES; do
  if [ -f "$img" ]; then
    npx @puntoycoma/bulki compress "$img" -d "$(dirname "$img")" -o "." -q 80
    # Replace original with optimized version
    git add "$img"
  fi
done

echo "bulki: done"
`

export async function installHook(): Promise<void> {
	const gitDir = await findGitDir(process.cwd())
	if (!gitDir) {
		console.error('Not a git repository. Run this from inside a git project.')
		process.exit(1)
	}

	const hooksDir = path.join(gitDir, 'hooks')
	const hookPath = path.join(hooksDir, 'pre-commit')

	await fs.mkdir(hooksDir, { recursive: true })

	try {
		const existing = await fs.readFile(hookPath, 'utf-8')
		if (existing.includes(HOOK_MARKER)) {
			console.log('bulki hook is already installed.')
			return
		}
		await fs.appendFile(hookPath, `\n${HOOK_SCRIPT}`)
		console.log('bulki hook appended to existing pre-commit hook.')
	} catch {
		await fs.writeFile(hookPath, HOOK_SCRIPT, { mode: 0o755 })
		console.log('bulki pre-commit hook installed.')
	}

	console.log('Staged images will be auto-optimized before each commit.')
}

export async function uninstallHook(): Promise<void> {
	const gitDir = await findGitDir(process.cwd())
	if (!gitDir) {
		console.error('Not a git repository.')
		process.exit(1)
	}

	const hookPath = path.join(gitDir, 'hooks', 'pre-commit')

	try {
		const content = await fs.readFile(hookPath, 'utf-8')
		if (!content.includes(HOOK_MARKER)) {
			console.log('No bulki hook found in pre-commit.')
			return
		}

		const lines = content.split('\n')
		const markerIndex = lines.findIndex((l) => l.includes(HOOK_MARKER))
		if (markerIndex === -1) {
			console.log('No bulki hook found.')
			return
		}

		const before = lines.slice(0, markerIndex).join('\n').trim()

		if (before === '' || before === '#!/bin/sh') {
			await fs.unlink(hookPath)
			console.log('bulki pre-commit hook removed.')
		} else {
			await fs.writeFile(hookPath, `${before}\n`, { mode: 0o755 })
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
	.action(async () => {
		await installHook()
	})

hookCommand
	.command('uninstall')
	.description('Remove the bulki pre-commit hook')
	.action(async () => {
		await uninstallHook()
	})

async function findGitDir(startPath: string): Promise<string | null> {
	let current = path.resolve(startPath)
	while (true) {
		const gitPath = path.join(current, '.git')
		try {
			await fs.stat(gitPath)
			return gitPath
		} catch {
			const parent = path.dirname(current)
			if (parent === current) return null
			current = parent
		}
	}
}
