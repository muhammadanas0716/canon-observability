/**
 * Canon Context Manager
 * 
 * The central coordinator that manages the event lifecycle:
 * finalize -> snapshot -> redact(copy) -> validate(redacted) -> sample -> emit
 * 
 * Guarantees exactly ONE event emission per request.
 */

import type {
  CanonConfig,
  EmitFunction,
  InternalCanonContext,
  RequestOutcome,
  SamplingConfig,
  WideEvent,
} from '../types.js';
import { DEFAULTS } from '../types.js';
import { createEventBuilder } from './event.js';
import { applyRedaction } from './redact.js';
import { shouldSample } from './sampling.js';
import {
  logValidationErrors,
  logValidationWarnings,
  validateSchema,
} from './schema.js';
import { createSpanAttributeSetter } from './otel.js';
import { resolveRequestId, resolveTraceId } from '../utils/ids.js';
import { isoTimestamp, startTimer } from '../utils/time.js';

/**
 * Default emit function - writes JSON to stdout
 */
const defaultEmit: EmitFunction = (event) => {
  process.stdout.write(JSON.stringify(event) + '\n');
};

/**
 * Create a Canon context for a request
 * 
 * @param config - Canon configuration
 * @param requestId - Request ID (from header or generated)
 * @param traceId - Trace ID (from header or generated)
 * @param initialData - Initial event data (method, path, etc.)
 * @param debug - Debug mode flag (bypasses sampling when true)
 * @returns Canon context with emission callback
 */
export function createCanonContext(
  config: CanonConfig,
  requestId: string,
  traceId: string | undefined,
  initialData: Partial<WideEvent>,
  debug: boolean = false
): { context: InternalCanonContext; emit: (outcome: RequestOutcome, statusCode: number) => void } {
  const startTime = startTimer();
  
  const baseEvent: Partial<WideEvent> = {
    timestamp: isoTimestamp(),
    request_id: requestId,
    trace_id: traceId,
    service: config.service,
    version: config.version,
    deployment_id: config.deployment_id,
    region: config.region,
    ...initialData,
  };
  
  const builder = createEventBuilder(baseEvent, startTime);
  
  const spanAttributeSetter = createSpanAttributeSetter();
  
  let emitted = false;
  
  const context: InternalCanonContext = {
    enrich(obj: Record<string, unknown>): void {
      builder.enrich(obj);
    },
    
    set(path: string, value: unknown): void {
      builder.set(path, value);
    },
    
    get(): Readonly<Partial<WideEvent>> {
      return builder.get();
    },
    
    markError(err: unknown): void {
      builder.markError(err);
    },
    
    isFinalized(): boolean {
      return builder.isFinalized();
    },
    
    finalize(outcome: RequestOutcome, statusCode: number): void {
      emitEvent(outcome, statusCode);
    },
    
    addSpanAttributes: spanAttributeSetter,
  };
  
  const emitEvent = (outcome: RequestOutcome, statusCode: number): void => {
    if (emitted) {
      return;
    }
    emitted = true;
    
    const snapshot = builder.finalize(outcome, statusCode);
    
    const redacted = applyRedaction(snapshot, config.redact, config.schema);
    
    const validation = validateSchema(
      redacted,
      config.schema,
      config.strict ?? false
    );
    
    if (validation.warnings.length > 0) {
      logValidationWarnings(validation.warnings, requestId);
    }
    
    if (!validation.valid) {
      logValidationErrors(validation.errors, requestId);
      
      if (config.strict) {
        return;
      }
    }
    
    if (!debug) {
      const samplingConfig = normalizeSamplingConfig(config.sample);
      if (!shouldSample(redacted, samplingConfig)) {
        return;
      }
    }
    
    const emit = config.emit ?? defaultEmit;
    emit(redacted as WideEvent);
    
    builder.markEmitted();
  };
  
  return { context, emit: emitEvent };
}

/**
 * Normalize sampling configuration from various input formats
 */
function normalizeSamplingConfig(
  config: CanonConfig['sample']
): SamplingConfig | ((event: WideEvent) => boolean) | undefined {
  if (!config) {
    return undefined;
  }
  
  if (typeof config === 'function') {
    return config;
  }
  
  return config;
}

/**
 * Extract request and trace IDs from headers
 */
export function extractIds(
  headers: Record<string, string | string[] | undefined>,
  config: CanonConfig
): { requestId: string; traceId: string } {
  const requestIdHeader = config.requestIdHeader ?? DEFAULTS.requestIdHeader;
  const traceIdHeader = config.traceIdHeader ?? DEFAULTS.traceIdHeader;
  const trustIncoming = config.trustIncomingIds ?? DEFAULTS.trustIncomingIds;
  
  const rawRequestId = getHeaderValue(headers, requestIdHeader);
  const rawTraceId = getHeaderValue(headers, traceIdHeader);
  
  return {
    requestId: resolveRequestId(rawRequestId, trustIncoming),
    traceId: resolveTraceId(rawTraceId, trustIncoming),
  };
}

/**
 * Get a single header value from potentially array headers
 */
function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Create initial event data from HTTP request
 */
export function createInitialEventData(
  method: string,
  path: string,
  ip?: string,
  userAgent?: string,
  route?: string
): Partial<WideEvent> {
  const data: Partial<WideEvent> = {
    method: method.toUpperCase(),
    path,
  };
  
  if (ip) data.ip = ip;
  if (userAgent) data.user_agent = userAgent;
  if (route) data.route = route;
  
  return data;
}

