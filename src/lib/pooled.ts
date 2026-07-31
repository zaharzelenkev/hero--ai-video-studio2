/**
 * Runs `fn` over `items` with at most `pool` concurrent executions.
 * Preserves the input order in the returned array — each slot resolves once
 * its corresponding item finishes, regardless of completion order.
 */
export async function pooled<T, R>(
  items: T[],
  pool: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(pool, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
