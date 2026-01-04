/**
 * Schema Validation
 * 
 * Validates Canon events against a defined schema with:
 * - Required field enforcement (supports dot-paths)
 * - Type validation for known fields
 * - Unknown field handling (top-level only for v0)
 * - Built-in base fields for Canon canonical event structure
 */

import type {
  CanonSchema,
  FieldDefinition,
  FieldType,
  ValidationResult,
  WideEvent,
} from '../types.js';
import { getPath, hasPath } from '../utils/merge.js';

/**
 * Built-in required fields that are always expected on a valid event
 */
const BUILT_IN_REQUIRED = [
  'timestamp',
  'request_id',
  'service',
  'method',
  'path',
  'status_code',
  'duration_ms',
  'outcome',
];

/**
 * Canon's built-in base fields for canonical event structure.
 * These are automatically recognized as known fields so they don't
 * trigger unknown field warnings. Users only need to define their
 * own business-specific fields.
 */
export const CANON_BASE_FIELDS: Record<string, FieldDefinition> = {
  'timestamp': { type: 'string' },
  'request_id': { type: 'string' },
  'trace_id': { type: 'string' },
  'service': { type: 'string' },
  'version': { type: 'string' },
  'deployment_id': { type: 'string' },
  'region': { type: 'string' },
  'method': { type: 'string' },
  'path': { type: 'string' },
  'route': { type: 'string' },
  'status_code': { type: 'number' },
  'duration_ms': { type: 'number' },
  'outcome': { type: 'string' },
  'ip': { type: 'string', pii: true },
  'user_agent': { type: 'string' },
  'error': { type: 'object' },
};

/**
 * Create a Canon schema definition
 * Merges user-provided fields over the built-in base fields.
 * Users only need to define their business-specific fields.
 */
export function defineCanonSchema(schema: Partial<CanonSchema>): CanonSchema {
  return {
    required: schema.required ?? [],
    fields: { ...CANON_BASE_FIELDS, ...(schema.fields ?? {}) },
    unknownMode: schema.unknownMode ?? 'allow',
  };
}

/**
 * Check if a value matches the expected field type
 */
function matchesType(value: unknown, expectedType: FieldType): boolean {
  if (value === null || value === undefined) return true;
  
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    default:
      return true;
  }
}

/**
 * Get all top-level keys from an object
 */
function getTopLevelKeys(obj: Record<string, unknown>): string[] {
  return Object.keys(obj);
}

/**
 * Get all known top-level keys from schema fields
 * Extracts the first segment of each dot-path
 */
function getKnownTopLevelKeys(schema: CanonSchema): Set<string> {
  const known = new Set<string>();
  
  for (const path of schema.required) {
    known.add(path.split('.')[0]);
  }
  
  for (const path of Object.keys(schema.fields)) {
    known.add(path.split('.')[0]);
  }
  
  BUILT_IN_REQUIRED.forEach(field => known.add(field));
  
  return known;
}

/**
 * Validate an event against a schema
 * 
 * @param event - The event to validate
 * @param schema - The schema to validate against
 * @param strict - If true, treat warnings as errors
 * @returns Validation result with errors and warnings
 */
export function validateSchema(
  event: Partial<WideEvent>,
  schema: CanonSchema | undefined,
  strict: boolean = false
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (const field of BUILT_IN_REQUIRED) {
    if (!hasPath(event as Record<string, unknown>, field)) {
      errors.push(`Missing required built-in field: ${field}`);
    }
  }
  
  if (!schema) {
    return { valid: errors.length === 0, errors, warnings };
  }
  
  for (const path of schema.required) {
    if (!hasPath(event as Record<string, unknown>, path)) {
      errors.push(`Missing required field: ${path}`);
    }
  }
  
  for (const [path, definition] of Object.entries(schema.fields)) {
    if (hasPath(event as Record<string, unknown>, path)) {
      const value = getPath(event as Record<string, unknown>, path);
      if (!matchesType(value, definition.type)) {
        const msg = `Field "${path}" has invalid type: expected ${definition.type}, got ${typeof value}`;
        if (strict) {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }
    }
  }
  
  const unknownMode = schema.unknownMode ?? 'allow';
  if (unknownMode !== 'allow') {
    const knownKeys = getKnownTopLevelKeys(schema);
    const actualKeys = getTopLevelKeys(event as Record<string, unknown>);
    
    for (const key of actualKeys) {
      if (!knownKeys.has(key)) {
        const msg = `Unknown top-level field: ${key}`;
        if (unknownMode === 'deny' && strict) {
          errors.push(msg);
        } else {
          warnings.push(msg);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Log validation warnings to stderr
 */
export function logValidationWarnings(
  warnings: string[],
  requestId: string
): void {
  for (const warning of warnings) {
    process.stderr.write(
      `[canon] validation warning (${requestId}): ${warning}\n`
    );
  }
}

/**
 * Log validation errors to stderr
 */
export function logValidationErrors(
  errors: string[],
  requestId: string
): void {
  for (const error of errors) {
    process.stderr.write(
      `[canon] validation error (${requestId}): ${error}\n`
    );
  }
}

/**
 * Get fields marked as PII in the schema
 */
export function getPiiFields(schema: CanonSchema): string[] {
  return Object.entries(schema.fields)
    .filter(([_, def]) => def.pii === true)
    .map(([path, _]) => path);
}

/**
 * Get the redaction strategy for a field, if defined
 */
export function getFieldRedactionStrategy(
  schema: CanonSchema,
  path: string
): FieldDefinition['redaction'] | undefined {
  return schema.fields[path]?.redaction;
}

