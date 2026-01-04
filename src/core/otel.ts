/**
 * OpenTelemetry Integration (Optional)
 * 
 * Provides optional span enrichment when OpenTelemetry is available.
 * This is a soft dependency - no-op if OTel is not installed.
 */

/**
 * OpenTelemetry span interface (minimal subset)
 * We don't import OTel types to keep it as a soft dependency
 */
interface OTelSpan {
  setAttribute(key: string, value: unknown): void;
  setAttributes(attributes: Record<string, unknown>): void;
}

/**
 * OpenTelemetry trace API interface (minimal subset)
 */
interface OTelTraceApi {
  getActiveSpan(): OTelSpan | undefined;
}

/**
 * Try to get the OpenTelemetry trace API
 * Returns undefined if OTel is not installed
 */
function tryGetTraceApi(): OTelTraceApi | undefined {
  try {
    const otel = require('@opentelemetry/api');
    return otel.trace as OTelTraceApi;
  } catch {
    return undefined;
  }
}

/**
 * Get the active OpenTelemetry span, if available
 */
export function getActiveSpan(): OTelSpan | undefined {
  const traceApi = tryGetTraceApi();
  return traceApi?.getActiveSpan();
}

/**
 * Add attributes to the active span
 * No-op if OTel is not available or no active span
 * 
 * @param attrs - Attributes to add to the span
 */
export function addSpanAttributes(attrs: Record<string, unknown>): void {
  const span = getActiveSpan();
  if (!span) return;
  
  const flatAttrs = flattenAttributes(attrs);
  span.setAttributes(flatAttrs);
}

/**
 * Add a single attribute to the active span
 * No-op if OTel is not available or no active span
 * 
 * @param key - Attribute key
 * @param value - Attribute value
 */
export function addSpanAttribute(key: string, value: unknown): void {
  const span = getActiveSpan();
  if (!span) return;
  
  span.setAttribute(key, normalizeValue(value));
}

/**
 * Flatten nested attributes into dot-notation keys
 * OTel spans prefer flat attribute structures
 * 
 * @param obj - Object to flatten
 * @param prefix - Key prefix for recursion
 * @returns Flattened object with dot-notation keys
 */
function flattenAttributes(
  obj: Record<string, unknown>,
  prefix: string = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenAttributes(value as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = normalizeValue(value);
    }
  }
  
  return result;
}

/**
 * Normalize a value for OTel attributes
 * OTel only accepts string, number, boolean, and arrays of those
 */
function normalizeValue(value: unknown): string | number | boolean | string[] | number[] | boolean[] {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  
  if (Array.isArray(value)) {
    return value.map(v => String(v));
  }
  
  return String(value);
}

/**
 * Create a span attribute setter function
 * Returns a bound function that can be passed to CanonContext
 */
export function createSpanAttributeSetter(): ((attrs: Record<string, unknown>) => void) | undefined {
  if (!tryGetTraceApi()) {
    return undefined;
  }
  
  return addSpanAttributes;
}

/**
 * Check if OpenTelemetry is available
 */
export function isOTelAvailable(): boolean {
  return tryGetTraceApi() !== undefined;
}

