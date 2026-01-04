/**
 * Event Builder
 * 
 * Builds the canonical wide event incrementally through the request lifecycle.
 * Provides safe enrichment API with mutation protection after finalization.
 */

import type { CanonError, RequestOutcome, WideEvent } from '../types.js';
import { mergeDeep, setPath, snapshot } from '../utils/merge.js';
import { durationMs } from '../utils/time.js';

/**
 * Internal event builder state
 */
interface EventBuilderState {
  event: Partial<WideEvent>;
  startTime: number;
  finalized: boolean;
  emitted: boolean;
}

/**
 * Create a new event builder
 * 
 * @param initialData - Initial event data (request_id, timestamp, etc.)
 * @param startTime - High-resolution start time for duration calculation
 * @returns Event builder with enrich/set/finalize methods
 */
export function createEventBuilder(
  initialData: Partial<WideEvent>,
  startTime: number
): EventBuilder {
  return new EventBuilder(initialData, startTime);
}

/**
 * Event builder class
 * Manages incremental event building with finalization protection
 */
export class EventBuilder {
  private state: EventBuilderState;
  
  constructor(initialData: Partial<WideEvent>, startTime: number) {
    this.state = {
      event: { ...initialData },
      startTime,
      finalized: false,
      emitted: false,
    };
  }
  
  /**
   * Merge nested objects into the event
   * Uses clone-at-level strategy to prevent mutation after emit
   */
  enrich(obj: Record<string, unknown>): void {
    if (this.state.finalized) {
      process.stderr.write(
        `[canon] warning: enrich() called after finalization, ignoring\n`
      );
      return;
    }
    
    this.state.event = mergeDeep(
      this.state.event as Record<string, unknown>,
      obj
    ) as Partial<WideEvent>;
  }
  
  /**
   * Set a value at a dot-separated path
   * Creates intermediate objects as needed
   */
  set(path: string, value: unknown): void {
    if (this.state.finalized) {
      process.stderr.write(
        `[canon] warning: set() called after finalization, ignoring\n`
      );
      return;
    }
    
    this.state.event = setPath(
      this.state.event as Record<string, unknown>,
      path,
      value
    ) as Partial<WideEvent>;
  }
  
  /**
   * Get a readonly snapshot of the current event
   * Safe to call at any time, returns a copy
   */
  get(): Readonly<Partial<WideEvent>> {
    return snapshot(this.state.event);
  }
  
  /**
   * Mark the request as having an error
   * Normalizes error objects into the standard error structure
   */
  markError(err: unknown): void {
    if (this.state.finalized) {
      process.stderr.write(
        `[canon] warning: markError() called after finalization, ignoring\n`
      );
      return;
    }
    
    const canonError = normalizeError(err);
    this.state.event.error = canonError;
    
    if (this.state.event.outcome !== 'aborted') {
      this.state.event.outcome = 'error';
    }
  }
  
  /**
   * Finalize the event
   * Calculates duration and locks the builder
   * 
   * @param outcome - Request outcome (success/error/aborted)
   * @param statusCode - HTTP status code from response
   * @returns Finalized event snapshot
   */
  finalize(
    outcome: RequestOutcome,
    statusCode: number
  ): Partial<WideEvent> {
    if (this.state.finalized) {
      return snapshot(this.state.event);
    }
    
    this.state.finalized = true;
    
    this.state.event.duration_ms = durationMs(this.state.startTime);
    this.state.event.status_code = statusCode;
    
    if (!this.state.event.outcome) {
      if (outcome === 'aborted') {
        this.state.event.outcome = 'aborted';
      } else if (this.state.event.error || statusCode >= 500) {
        this.state.event.outcome = 'error';
      } else {
        this.state.event.outcome = outcome;
      }
    }
    
    return snapshot(this.state.event);
  }
  
  /**
   * Check if the builder has been finalized
   */
  isFinalized(): boolean {
    return this.state.finalized;
  }
  
  /**
   * Check if the event has been emitted
   */
  isEmitted(): boolean {
    return this.state.emitted;
  }
  
  /**
   * Mark the event as emitted
   * Prevents double emission
   */
  markEmitted(): void {
    this.state.emitted = true;
  }
  
  /**
   * Get the raw event reference (for internal use only)
   * WARNING: Do not mutate the returned object
   */
  getRaw(): Partial<WideEvent> {
    return this.state.event;
  }
}

/**
 * Normalize an error value into a standard CanonError structure
 * Handles Error objects, objects with error-like properties, and primitives
 */
export function normalizeError(err: unknown): CanonError {
  if (err instanceof Error) {
    const canonError: CanonError = {
      type: err.name || 'Error',
      message: err.message || 'Unknown error',
    };
    
    if ('code' in err && typeof err.code === 'string') {
      canonError.code = err.code;
    }
    
    if ('retriable' in err && typeof err.retriable === 'boolean') {
      canonError.retriable = err.retriable;
    }
    
    return canonError;
  }
  
  if (err !== null && typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    return {
      type: typeof obj.type === 'string' ? obj.type : 'Error',
      message: typeof obj.message === 'string' ? obj.message : String(err),
      code: typeof obj.code === 'string' ? obj.code : undefined,
      retriable: typeof obj.retriable === 'boolean' ? obj.retriable : undefined,
    };
  }
  
  return {
    type: 'Error',
    message: String(err),
  };
}

