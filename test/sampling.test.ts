/**
 * Sampling Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  shouldSample,
  createSamplingConfig,
  createSampler,
  alwaysSample,
  neverSample,
  fixedRateSample,
} from '../src/core/sampling.js';
import type { WideEvent } from '../src/types.js';

describe('Sampling', () => {
  const baseEvent: Partial<WideEvent> = {
    timestamp: '2024-01-15T10:30:00.000Z',
    request_id: 'req_test123',
    service: 'test-service',
    method: 'GET',
    path: '/test',
    status_code: 200,
    duration_ms: 50,
    outcome: 'success',
  };

  describe('default sampling behavior', () => {
    it('always samples 5xx errors', () => {
      const event = { ...baseEvent, status_code: 500, outcome: 'error' as const };
      expect(shouldSample(event, undefined)).toBe(true);

      const event503 = { ...baseEvent, status_code: 503, outcome: 'error' as const };
      expect(shouldSample(event503, undefined)).toBe(true);
    });

    it('always samples 429 (too many requests)', () => {
      const event = { ...baseEvent, status_code: 429 };
      expect(shouldSample(event, undefined)).toBe(true);
    });

    it('always samples 408 (request timeout)', () => {
      const event = { ...baseEvent, status_code: 408 };
      expect(shouldSample(event, undefined)).toBe(true);
    });

    it('always samples aborted requests', () => {
      const event = { ...baseEvent, outcome: 'aborted' as const, status_code: 499 };
      expect(shouldSample(event, undefined)).toBe(true);
    });

    it('always samples requests with error outcome', () => {
      const event = { ...baseEvent, outcome: 'error' as const };
      expect(shouldSample(event, undefined)).toBe(true);
    });

    it('always samples slow requests above threshold', () => {
      const event = { ...baseEvent, duration_ms: 2500 };
      expect(shouldSample(event, undefined)).toBe(true);
    });

    it('uses configured slow threshold', () => {
      const config = createSamplingConfig({ slowThresholdMs: 100 });
      const event = { ...baseEvent, duration_ms: 150 };
      expect(shouldSample(event, config)).toBe(true);
    });
  });

  describe('rate-based sampling', () => {
    beforeEach(() => {
      vi.spyOn(Math, 'random');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('samples success requests at configured rate', () => {
      vi.mocked(Math.random).mockReturnValue(0.01);
      
      const config = createSamplingConfig({ sampleRateSuccess: 0.05 });
      const event = { ...baseEvent };

      expect(shouldSample(event, config)).toBe(true);
    });

    it('drops success requests above rate threshold', () => {
      vi.mocked(Math.random).mockReturnValue(0.5);
      
      const config = createSamplingConfig({ sampleRateSuccess: 0.05 });
      const event = { ...baseEvent };

      expect(shouldSample(event, config)).toBe(false);
    });
  });

  describe('custom sampling function', () => {
    it('uses custom function when provided directly', () => {
      const customFn = vi.fn().mockReturnValue(true);
      const event = { ...baseEvent };

      expect(shouldSample(event, customFn)).toBe(true);
      expect(customFn).toHaveBeenCalledWith(event);
    });

    it('uses custom function from config', () => {
      const customFn = vi.fn().mockReturnValue(false);
      const config = createSamplingConfig({ custom: customFn });
      const event = { ...baseEvent };

      expect(shouldSample(event, config)).toBe(false);
      expect(customFn).toHaveBeenCalled();
    });
  });

  describe('helper functions', () => {
    it('alwaysSample returns true', () => {
      expect(alwaysSample()).toBe(true);
    });

    it('neverSample returns false', () => {
      expect(neverSample()).toBe(false);
    });

    it('fixedRateSample respects rate', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.3);
      
      const sample50 = fixedRateSample(0.5);
      expect(sample50()).toBe(true);

      const sample10 = fixedRateSample(0.1);
      expect(sample10()).toBe(false);

      vi.restoreAllMocks();
    });

    it('fixedRateSample clamps rate to [0, 1]', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      
      const sampleOver = fixedRateSample(1.5);
      expect(sampleOver()).toBe(true);

      const sampleUnder = fixedRateSample(-0.5);
      expect(sampleUnder()).toBe(false);

      vi.restoreAllMocks();
    });
  });

  describe('createSampler', () => {
    it('creates sampler that applies default rules first', () => {
      const sampler = createSampler();
      
      const errorEvent = { ...baseEvent, status_code: 500, outcome: 'error' as const };
      expect(sampler(errorEvent as WideEvent)).toBe(true);
    });

    it('applies custom check after default rules', () => {
      const customCheck = vi.fn().mockReturnValue(true);
      const sampler = createSampler(customCheck);

      vi.spyOn(Math, 'random').mockReturnValue(0.99);
      
      const successEvent = { ...baseEvent } as WideEvent;
      const result = sampler(successEvent);

      expect(customCheck).toHaveBeenCalled();
      expect(result).toBe(true);

      vi.restoreAllMocks();
    });
  });
});

