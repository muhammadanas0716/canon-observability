/**
 * Redaction Engine
 * 
 * Provides PII protection through three strategies:
 * - mask: j***@e***.com (keep first/last chars)
 * - hash: SHA-256 hex (deterministic, can correlate)
 * - drop: Replace with "[REDACTED]"
 * 
 * Precedence: Schema-level field redaction strategies override global config.
 * 
 * Critical: Always operates on a COPY of the event, never the original
 */

import { createHash } from 'node:crypto';
import type { CanonSchema, RedactionConfig, RedactionStrategy, WideEvent } from '../types.js';
import { getPath, setPath, snapshot } from '../utils/merge.js';

/**
 * Default fields that should be redacted if present
 * Note: 'ip' is not included by default because masking IPs doesn't produce
 * useful results. Use 'hash' or 'drop' strategy for IP if needed.
 */
const DEFAULT_SENSITIVE_FIELDS = [
  'user.email',
  'user.phone',
  'headers.authorization',
  'headers.cookie',
  'headers.x-api-key',
];

/**
 * Mask a string value, keeping first and last characters visible
 * Example: "john@example.com" -> "j***@e***.com"
 */
function maskValue(value: string): string {
  if (value.length <= 2) {
    return '*'.repeat(value.length);
  }
  
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    const maskedLocal = local.length > 1 
      ? local[0] + '*'.repeat(Math.max(1, local.length - 1))
      : '*';
    const domainParts = domain.split('.');
    const maskedDomain = domainParts.map((part, i) => {
      if (i === domainParts.length - 1) return part;
      return part.length > 1 ? part[0] + '*'.repeat(part.length - 1) : '*';
    }).join('.');
    return `${maskedLocal}@${maskedDomain}`;
  }
  
  const first = value[0];
  const last = value[value.length - 1];
  const middleLength = Math.max(1, value.length - 2);
  return first + '*'.repeat(middleLength) + last;
}

/**
 * Hash a value using SHA-256
 * Returns a deterministic hex string that can be used for correlation
 */
function hashValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Apply a redaction strategy to a value
 */
function redactValue(
  value: unknown,
  strategy: RedactionStrategy
): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  
  const stringValue = String(value);
  
  switch (strategy) {
    case 'mask':
      return maskValue(stringValue);
    case 'hash':
      return hashValue(stringValue);
    case 'drop':
      return '[REDACTED]';
    default:
      return maskValue(stringValue);
  }
}

/**
 * Apply redaction to an event
 * 
 * CRITICAL: This function operates on a COPY of the event
 * The original event remains unmodified
 * 
 * Precedence: Schema-level field redaction strategies override global config strategy.
 * 
 * @param event - Event to redact (will be cloned)
 * @param config - Redaction configuration
 * @param schema - Optional schema for per-field redaction strategies
 * @returns New event with redacted fields
 */
export function applyRedaction(
  event: Partial<WideEvent>,
  config: RedactionConfig | undefined,
  schema?: CanonSchema
): Partial<WideEvent> {
  const redacted = snapshot(event);
  
  if (!config || !config.enabled) {
    return redacted;
  }
  
  const globalStrategy = config.strategy ?? 'mask';
  const fieldsToRedact = config.fields.length > 0 
    ? config.fields 
    : DEFAULT_SENSITIVE_FIELDS;
  
  let result = redacted as Record<string, unknown>;
  
  for (const path of fieldsToRedact) {
    const value = getPath(result, path);
    if (value !== undefined) {
      const fieldStrategy = schema?.fields[path]?.redaction ?? globalStrategy;
      const redactedValue = redactValue(value, fieldStrategy);
      result = setPath(result, path, redactedValue);
    }
  }
  
  return result as Partial<WideEvent>;
}

/**
 * Create a redaction configuration with defaults
 */
export function createRedactionConfig(
  config?: Partial<RedactionConfig>
): RedactionConfig {
  return {
    enabled: config?.enabled ?? false,
    strategy: config?.strategy ?? 'mask',
    fields: config?.fields ?? DEFAULT_SENSITIVE_FIELDS,
  };
}

/**
 * Check if a field path should be redacted
 */
export function shouldRedactField(
  path: string,
  config: RedactionConfig
): boolean {
  if (!config.enabled) return false;
  return config.fields.includes(path);
}

/**
 * Merge additional fields into redaction config
 * Useful for adding schema-defined PII fields
 */
export function mergeRedactionFields(
  config: RedactionConfig,
  additionalFields: string[]
): RedactionConfig {
  const mergedFields = [...new Set([...config.fields, ...additionalFields])];
  return {
    ...config,
    fields: mergedFields,
  };
}

