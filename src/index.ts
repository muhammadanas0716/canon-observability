/**
 * Canon - One request = one canonical wide event
 * 
 * Production observability library that enforces structured event emission
 * with schema validation, tail sampling, and PII redaction.
 * 
 * @example
 * ```typescript
 * import { canonExpress, canonExpressError, defineCanonSchema } from 'canon';
 * 
 * const schema = defineCanonSchema({
 *   required: ['user.id'],
 *   fields: {
 *     'user.id': { type: 'string' },
 *     'user.email': { type: 'string', pii: true }
 *   }
 * });
 * 
 * app.use(canonExpress({
 *   service: 'my-service',
 *   version: '1.0.0',
 *   schema,
 *   redact: { enabled: true, strategy: 'mask', fields: ['user.email'] }
 * }));
 * 
 * // ... routes ...
 * 
 * app.use(canonExpressError());
 * ```
 */

export type {
  CanonConfig,
  CanonContext,
  CanonError,
  CanonSchema,
  EmitFunction,
  FieldDefinition,
  FieldType,
  InternalCanonContext,
  RedactionConfig,
  RedactionStrategy,
  RequestOutcome,
  SamplingConfig,
  UnknownFieldMode,
  ValidationResult,
  WideEvent,
} from './types.js';

export { DEFAULTS } from './types.js';

export { canonExpress, canonExpressError } from './middleware/express.js';

export { defineCanonSchema, validateSchema, CANON_BASE_FIELDS } from './core/schema.js';

export { applyRedaction, createRedactionConfig } from './core/redact.js';

export {
  shouldSample,
  createSamplingConfig,
  createSampler,
  alwaysSample,
  neverSample,
  fixedRateSample,
} from './core/sampling.js';

export { createCanonContext, extractIds } from './core/canon.js';

export { normalizeError } from './core/event.js';

export {
  generateRequestId,
  generateTraceId,
  isValidRequestId,
  isValidTraceId,
} from './utils/ids.js';

export { createConsoleEmitter } from './utils/emit.js';

export { isOTelAvailable, addSpanAttributes } from './core/otel.js';

