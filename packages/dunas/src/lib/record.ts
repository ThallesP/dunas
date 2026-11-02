export function recordFrom<TKey extends string, TValue>(
  keys: readonly TKey[],
  value: (key: TKey) => TValue,
) {
  return Object.fromEntries(keys.map((key) => [key, value(key)])) as Record<TKey, TValue>
}
