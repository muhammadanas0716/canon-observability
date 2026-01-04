/**
 * Tail Sampling
 * 
 * Sampling decision happens AFTER request completion, using the finalized event.
 * This enables intelligent sampling based on outcome, duration, and business context.
 * 
 * Default behavior:
 * - Always keep: status_code >= 500
 * - Always keep: status_code === 429 || status_code === 408
 * - Always keep: outcome === 'aborted'
 * - Always keep: duration_ms > slowThresholdMs (default: 2000ms)
 * - Otherwise: sample at sampleRateSuccess (default: 5%)
 */

import type { SamplingConfig, WideEvent } from '../types.js';
import { DEFAULTS } from '../types.js';

/**
 * Status codes that are always sampled
 */
const ALWAYS_SAMPLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
]);

/**
 * Check if an event should be sampled using default rules
 * 
 * @param event - Finalized event to evaluate
 * @param config - Sampling configuration
 * @returns true if the event should be emitted
 */
function shouldSampleDefault(
  event: Partial<WideEvent>,
  config: SamplingConfig
): boolean {
  const statusCode = event.status_code ?? 0;
  const durationMs = event.duration_ms ?? 0;
  const outcome = event.outcome;
  
  if (statusCode >= 500) {
    return true;
  }
  
  if (ALWAYS_SAMPLE_STATUS_CODES.has(statusCode)) {
    return true;
  }
  
  if (outcome === 'aborted') {
    return true;
  }
  
  if (outcome === 'error') {
    return true;
  }
  
  const slowThreshold = config.slowThresholdMs ?? DEFAULTS.slowThresholdMs;
  if (durationMs > slowThreshold) {
    return true;
  }
  
  const sampleRate = config.sampleRateSuccess ?? DEFAULTS.sampleRateSuccess;
  return Math.random() < sampleRate;
}

/**
 * Determine if an event should be sampled (emitted)
 * 
 * @param event - Finalized event to evaluate
 * @param config - Sampling configuration or custom function
 * @returns true if the event should be emitted
 */
export function shouldSample(
  event: Partial<WideEvent>,
  config: SamplingConfig | ((event: WideEvent) => boolean) | undefined
): boolean {
  if (!config) {
    return shouldSampleDefault(event, {});
  }
  
  if (typeof config === 'function') {
    return config(event as WideEvent);
  }
  
  if (config.custom) {
    return config.custom(event as WideEvent);
  }
  
  return shouldSampleDefault(event, config);
}

/**
 * Create a sampling configuration with defaults
 */
export function createSamplingConfig(
  config?: Partial<SamplingConfig>
): SamplingConfig {
  return {
    sampleRateSuccess: config?.sampleRateSuccess ?? DEFAULTS.sampleRateSuccess,
    slowThresholdMs: config?.slowThresholdMs ?? DEFAULTS.slowThresholdMs,
    custom: config?.custom,
  };
}

/**
 * Create a custom sampler that combines default rules with additional logic
 * 
 * @param customCheck - Additional check to run after default rules
 * @returns Sampling function
 */
export function createSampler(
  customCheck?: (event: WideEvent) => boolean
): (event: WideEvent) => boolean {
  return (event: WideEvent) => {
    if (shouldSampleDefault(event, {})) {
      return true;
    }
    
    if (customCheck) {
      return customCheck(event);
    }
    
    return false;
  };
}

/**
 * Always sample - useful for debugging or low-traffic services
 */
export function alwaysSample(): boolean {
  return true;
}

/**
 * Never sample - useful for testing or disabling observability
 */
export function neverSample(): boolean {
  return false;
}

/**
 * Sample at a fixed rate
 * 
 * @param rate - Probability of sampling (0.0 to 1.0)
 */
export function fixedRateSample(rate: number): () => boolean {
  const clampedRate = Math.max(0, Math.min(1, rate));
  return () => Math.random() < clampedRate;
}

