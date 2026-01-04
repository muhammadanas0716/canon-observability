/**
 * ID Generation Utilities
 * Generates unique request and trace IDs using cryptographically secure randomness
 */

import { randomBytes } from 'node:crypto';

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/**
 * Encode bytes to base32 string
 * Uses lowercase RFC 4648 alphabet for URL-safe, case-insensitive IDs
 */
function toBase32(bytes: Buffer): string {
  let result = '';
  let bits = 0;
  let value = 0;
  
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >> bits) & 0x1f];
    }
  }
  
  if (bits > 0) {
    result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  
  return result;
}

/**
 * Generate a unique request ID
 * Format: req_ + 16 chars base32 (80 bits of entropy)
 */
export function generateRequestId(): string {
  return 'req_' + toBase32(randomBytes(10));
}

/**
 * Generate a unique trace ID
 * Format: trace_ + 16 chars base32 (80 bits of entropy)
 */
export function generateTraceId(): string {
  return 'trace_' + toBase32(randomBytes(10));
}

/**
 * Validate a request ID format
 * Must start with "req_" and have valid base32 chars
 */
export function isValidRequestId(id: string): boolean {
  if (!id.startsWith('req_')) return false;
  const suffix = id.slice(4);
  if (suffix.length < 8 || suffix.length > 32) return false;
  return /^[a-z2-7]+$/.test(suffix);
}

/**
 * Validate a trace ID format
 * Must start with "trace_" and have valid base32 chars
 */
export function isValidTraceId(id: string): boolean {
  if (!id.startsWith('trace_')) return false;
  const suffix = id.slice(6);
  if (suffix.length < 8 || suffix.length > 32) return false;
  return /^[a-z2-7]+$/.test(suffix);
}

/**
 * Extract or generate a request ID from headers
 * @param headerValue - Value from request header
 * @param trustIncoming - Whether to trust incoming IDs
 * @returns Valid request ID (extracted or generated)
 */
export function resolveRequestId(
  headerValue: string | undefined,
  trustIncoming: boolean
): string {
  if (trustIncoming && headerValue && headerValue.length > 0) {
    return headerValue;
  }
  return generateRequestId();
}

/**
 * Extract or generate a trace ID from headers
 * @param headerValue - Value from request header
 * @param trustIncoming - Whether to trust incoming IDs
 * @returns Valid trace ID (extracted or generated)
 */
export function resolveTraceId(
  headerValue: string | undefined,
  trustIncoming: boolean
): string {
  if (trustIncoming && headerValue && headerValue.length > 0) {
    return headerValue;
  }
  return generateTraceId();
}

