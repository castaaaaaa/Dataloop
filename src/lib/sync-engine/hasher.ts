/**
 * Stable Value Hasher
 * Computes deterministic hashes for records to detect changes and prevent infinite sync loops.
 */

export function normalizeValue(val: unknown): unknown {
  if (val === null || val === undefined) {
    return null;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (Array.isArray(val)) {
    return val.map(normalizeValue);
  }
  if (typeof val === 'object') {
    const sortedObj: Record<string, unknown> = {};
    const keys = Object.keys(val as Record<string, unknown>).sort();
    for (const key of keys) {
      const v = (val as Record<string, unknown>)[key];
      if (v !== undefined) {
        sortedObj[key] = normalizeValue(v);
      }
    }
    return sortedObj;
  }
  if (typeof val === 'string') {
    return val.trim();
  }
  if (typeof val === 'number') {
    // Round to avoid floating point jitter
    return Number.isFinite(val) ? Number(val.toFixed(6)) : val;
  }
  return val;
}

/**
 * Fast deterministic string hash (djb2 + FNV-1a hybrid returning hex string)
 * Works in both browser and Node without external crypto dependencies.
 */
export function computeStableHash(obj: unknown): string {
  const normalized = normalizeValue(obj);
  const jsonStr = JSON.stringify(normalized);

  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c64e6d ^ 0;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hash32 = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash32.toString(16).padStart(12, '0');
}
