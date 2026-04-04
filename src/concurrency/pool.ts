export async function processPool<T, R>(
	items: T[],
	processor: (item: T) => Promise<R>,
	concurrency: number,
): Promise<R[]> {
	const results: R[] = new Array(items.length)
	const executing = new Set<Promise<void>>()
	let firstError: unknown
	let hasError = false

	for (let i = 0; i < items.length; i++) {
		const index = i
		const p: Promise<void> = processor(items[index])
			.then((result) => {
				results[index] = result
			})
			.catch((err) => {
				if (!hasError) {
					hasError = true
					firstError = err
				}
			})
			.finally(() => {
				executing.delete(p)
			})
		executing.add(p)

		if (executing.size >= concurrency) {
			await Promise.race(executing)
		}
	}

	await Promise.all(executing)

	if (hasError) {
		throw firstError
	}

	return results
}
