/**
 * Time Utilities
 * High-resolution timing and ISO timestamp generation
 */

/**
 * Get current high-resolution timestamp in milliseconds
 * Uses process.hrtime.bigint() for nanosecond precision
 */
export function hrTimeMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

/**
 * Calculate duration in milliseconds between two hrtime values
 * @param startMs - Start time from hrTimeMs()
 * @returns Duration in milliseconds with microsecond precision
 */
export function durationMs(startMs: number): number {
  return Math.round((hrTimeMs() - startMs) * 100) / 100;
}

/**
 * Get current ISO 8601 timestamp
 * Format: 2024-01-15T10:30:00.000Z
 */
export function isoTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Get monotonic start time for duration calculation
 * Returns a number that can be passed to durationMs()
 */
export function startTimer(): number {
  return hrTimeMs();
}

