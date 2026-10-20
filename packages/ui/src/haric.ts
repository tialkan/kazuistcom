/** Copy of `obj` without the given keys (component props that must not reach the DOM). */
export function haric<T extends object, K extends keyof T>(obj: T, keys: readonly K[]): Omit<T, K> {
  const atla = new Set<PropertyKey>(keys);
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !atla.has(k))) as Omit<T, K>;
}
