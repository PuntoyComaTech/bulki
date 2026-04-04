import { describe, expect, it } from 'vitest'
import { processPool } from '../../src/concurrency/pool.js'

describe('processPool', () => {
	describe('basic functionality', () => {
		it('processes all items and returns results in order', async () => {
			const results = await processPool([1, 2, 3], async (n) => n * 2, 2)
			expect(results).toEqual([2, 4, 6])
		})

		it('returns empty array for empty input', async () => {
			const results = await processPool([], async (n: number) => n * 2, 2)
			expect(results).toEqual([])
		})

		it('works with concurrency of 1 (sequential)', async () => {
			const order: number[] = []
			const results = await processPool(
				[1, 2, 3],
				async (n) => {
					order.push(n)
					return n * 10
				},
				1,
			)
			expect(results).toEqual([10, 20, 30])
			expect(order).toEqual([1, 2, 3])
		})
	})

	describe('concurrency control', () => {
		it('respects concurrency limit and never exceeds it', async () => {
			let active = 0
			let maxActive = 0

			const results = await processPool(
				Array.from({ length: 10 }, (_, i) => i),
				async (n) => {
					active++
					maxActive = Math.max(maxActive, active)
					await new Promise<void>((r) => setTimeout(r, 10))
					active--
					return n
				},
				3,
			)

			expect(maxActive).toBeLessThanOrEqual(3)
			expect(results).toHaveLength(10)
		})

		it('processes all items even when concurrency equals item count', async () => {
			const results = await processPool([1, 2, 3, 4, 5], async (n) => n + 1, 5)
			expect(results).toHaveLength(5)
			expect(results).toEqual([2, 3, 4, 5, 6])
		})

		it('processes all items when concurrency exceeds item count', async () => {
			const results = await processPool([1, 2], async (n) => n * 3, 10)
			expect(results).toEqual([3, 6])
		})
	})

	describe('error handling', () => {
		it('propagates error when one item throws', async () => {
			await expect(
				processPool(
					[1, 2, 3],
					async (n) => {
						if (n === 2) throw new Error('fail')
						return n
					},
					2,
				),
			).rejects.toThrow('fail')
		})

		it('propagates the original error message', async () => {
			await expect(
				processPool(
					[1],
					async () => {
						throw new Error('something went wrong')
					},
					1,
				),
			).rejects.toThrow('something went wrong')
		})
	})
})
