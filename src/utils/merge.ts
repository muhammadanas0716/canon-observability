/**
 * Deep Merge Utilities
 * Efficient object merging with clone-at-each-level strategy
 * 
 * Rules:
 * - Plain objects are merged recursively
 * - Arrays are overwritten (not concatenated)
 * - Primitives are overwritten
 * - Depth limit prevents pathological nested objects
 */

const MAX_MERGE_DEPTH = 5;

/**
 * Check if a value is a plain object (not array, null, or class instance)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep merge source into target, creating new objects at each level
 * Does not mutate target or source
 * 
 * @param target - Target object to merge into
 * @param source - Source object to merge from
 * @param depth - Current recursion depth (internal)
 * @returns New merged object
 */
export function mergeDeep<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
  depth: number = 0
): T {
  if (depth >= MAX_MERGE_DEPTH) {
    return { ...target, ...source } as T;
  }
  
  const result: Record<string, unknown> = { ...target };
  
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];
    
    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      result[key] = mergeDeep(targetValue, sourceValue, depth + 1);
    } else {
      result[key] = sourceValue;
    }
  }
  
  return result as T;
}

/**
 * Set a value at a dot-separated path, creating intermediate objects as needed
 * Returns a new object without mutating the original
 * 
 * @param obj - Object to set value in
 * @param path - Dot-separated path (e.g., "user.profile.name")
 * @param value - Value to set
 * @returns New object with value set at path
 */
export function setPath<T extends Record<string, unknown>>(
  obj: T,
  path: string,
  value: unknown
): T {
  const parts = path.split('.');
  if (parts.length === 0) return obj;
  
  const result: Record<string, unknown> = { ...obj };
  let current = result;
  
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const existing = current[key];
    
    if (isPlainObject(existing)) {
      current[key] = { ...existing };
    } else {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  
  current[parts[parts.length - 1]] = value;
  return result as T;
}

/**
 * Get a value at a dot-separated path
 * 
 * @param obj - Object to get value from
 * @param path - Dot-separated path (e.g., "user.profile.name")
 * @returns Value at path or undefined if not found
 */
export function getPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

/**
 * Check if a path exists in an object
 * 
 * @param obj - Object to check
 * @param path - Dot-separated path
 * @returns True if path exists (even if value is undefined)
 */
export function hasPath(obj: Record<string, unknown>, path: string): boolean {
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      return false;
    }
    if (!(part in (current as Record<string, unknown>))) {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }
  
  return true;
}

/**
 * Create a shallow clone of an object suitable for event snapshot
 * Uses structuredClone if available, falls back to JSON round-trip
 */
export function snapshot<T>(obj: T): T {
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}

