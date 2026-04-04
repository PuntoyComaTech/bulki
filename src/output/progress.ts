export function createProgressBar(total: number) {
	let current = 0

	return {
		tick() {
			current++
			const percent = Math.round((current / total) * 100)
			const barWidth = Math.max(0, Math.min(process.stdout.columns || 40, 40) - 20)
			const filled = Math.round((current / total) * barWidth)
			const empty = barWidth - filled
			const bar = `[${'='.repeat(filled)}${' '.repeat(empty)}] ${percent}% ${current}/${total}`
			process.stdout.write(`\r${bar}`)
			if (current === total) process.stdout.write('\n')
		},
	}
}
