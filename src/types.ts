/**
 * Canon Types - Core type definitions for the Canon observability library
 * 
 * Canon enforces "one request = one canonical wide event" with schema validation,
 * tail sampling, and PII redaction.
 */

/**
 * Outcome of a request - determines sampling behavior
 */
export type RequestOutcome = 'success' | 'error' | 'aborted';

/**
 * Field types supported in schema validation
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

/**
 * Redaction strategy for PII fields
 * - mask: j***@e***.com (keep first/last chars)
 * - hash: SHA-256 hex (deterministic, can correlate)
 * - drop: Replace with "[REDACTED]"
 */
export type RedactionStrategy = 'mask' | 'hash' | 'drop';

/**
 * How to handle unknown fields not defined in schema
 * - allow: Accept silently
 * - warn: Accept but log warning to stderr
 * - deny: Reject in strict mode, warn in non-strict
 */
export type UnknownFieldMode = 'allow' | 'warn' | 'deny';

/**
 * Definition for a single field in the schema
 */
export interface FieldDefinition {
  type: FieldType;
  pii?: boolean;
  redaction?: RedactionStrategy;
  cardinality?: 'low' | 'high';
}

/**
 * Schema definition for Canon events
 */
export interface CanonSchema {
  required: string[];
  fields: Record<string, FieldDefinition>;
  unknownMode?: UnknownFieldMode;
}

/**
 * Normalized error structure attached to events
 */
export interface CanonError {
  type: string;
  message: string;
  code?: string;
  retriable?: boolean;
  stack?: string;
}

/**
 * The canonical wide event structure emitted per request
 */
export interface WideEvent {
  timestamp: string;
  request_id: string;
  trace_id?: string;
  
  service: string;
  version?: string;
  deployment_id?: string;
  region?: string;
  
  method: string;
  path: string;
  route?: string;
  status_code: number;
  duration_ms: number;
  
  ip?: string;
  user_agent?: string;
  
  outcome: RequestOutcome;
  error?: CanonError;
  
  [key: string]: unknown;
}

/**
 * Redaction configuration
 */
export interface RedactionConfig {
  enabled: boolean;
  strategy: RedactionStrategy;
  fields: string[];
}

/**
 * Sampling configuration with deterministic defaults
 */
export interface SamplingConfig {
  sampleRateSuccess?: number;
  slowThresholdMs?: number;
  custom?: (event: WideEvent) => boolean;
}

/**
 * Function signature for event emission
 */
export type EmitFunction = (event: WideEvent) => void;

/**
 * Main Canon configuration for middleware
 */
export interface CanonConfig {
  service: string;
  version?: string;
  deployment_id?: string;
  region?: string;
  
  schema?: CanonSchema;
  
  requestIdHeader?: string;
  traceIdHeader?: string;
  trustIncomingIds?: boolean;
  
  emit?: EmitFunction;
  
  strict?: boolean;
  
  sample?: SamplingConfig | ((event: WideEvent) => boolean);
  
  redact?: RedactionConfig;
  
  debug?: boolean;
  
  ignorePaths?: (string | RegExp)[] | ((path: string) => boolean);
}

/**
 * Per-request Canon context API
 * Attached to request objects for incremental event building
 */
export interface CanonContext {
  /**
   * Merge nested objects into the event
   * @param obj - Object to merge into event
   */
  enrich(obj: Record<string, unknown>): void;
  
  /**
   * Set a value at a dot-separated path
   * @param path - Dot-separated path (e.g., "user.id")
   * @param value - Value to set
   */
  set(path: string, value: unknown): void;
  
  /**
   * Get a readonly snapshot of the current event
   */
  get(): Readonly<Partial<WideEvent>>;
  
  /**
   * Mark the request as having an error
   * Normalizes error objects into the standard error structure
   * @param err - Error object or unknown value
   */
  markError(err: unknown): void;
  
  /**
   * Optional: Add attributes to the active OpenTelemetry span
   * No-op if OTel is not available
   * @param attrs - Attributes to add to span
   */
  addSpanAttributes?(attrs: Record<string, unknown>): void;
}

/**
 * Internal Canon context with additional methods for middleware use
 */
export interface InternalCanonContext extends CanonContext {
  /**
   * Check if the context has been finalized
   */
  isFinalized(): boolean;
  
  /**
   * Finalize the event and emit it
   * @param outcome - Request outcome
   * @param statusCode - HTTP status code
   */
  finalize(outcome: RequestOutcome, statusCode: number): void;
}

/**
 * Schema validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Default configuration values
 */
export const DEFAULTS = {
  requestIdHeader: 'x-request-id',
  traceIdHeader: 'x-trace-id',
  trustIncomingIds: true,
  strict: false,
  sampleRateSuccess: 0.05,
  slowThresholdMs: 2000,
  redactionStrategy: 'mask' as RedactionStrategy,
  unknownFieldMode: 'allow' as UnknownFieldMode,
} as const;

