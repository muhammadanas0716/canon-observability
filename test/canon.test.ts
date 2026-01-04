/**
 * Canon Core Tests
 * 
 * Tests for the Canon context manager and event lifecycle
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCanonContext, extractIds } from '../src/core/canon.js';
import type { CanonConfig } from '../src/types.js';

describe('Canon Context', () => {
  const baseConfig: CanonConfig = {
    service: 'test-service',
    version: '1.0.0',
    sample: () => true,
  };

  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createCanonContext', () => {
    it('creates context with initial data', () => {
      const { context } = createCanonContext(
        baseConfig,
        'req_test123',
        'trace_test456',
        { method: 'GET', path: '/test' }
      );

      const event = context.get();
      expect(event.request_id).toBe('req_test123');
      expect(event.trace_id).toBe('trace_test456');
      expect(event.service).toBe('test-service');
      expect(event.method).toBe('GET');
      expect(event.path).toBe('/test');
    });

    it('enriches event with nested objects', () => {
      const { context } = createCanonContext(
        baseConfig,
        'req_test',
        undefined,
        { method: 'POST', path: '/checkout' }
      );

      context.enrich({ user: { id: 'u123', plan: 'premium' } });
      context.enrich({ cart: { items: 3, total: 9999 } });

      const event = context.get();
      expect(event.user).toEqual({ id: 'u123', plan: 'premium' });
      expect(event.cart).toEqual({ items: 3, total: 9999 });
    });

    it('sets values at dot paths', () => {
      const { context } = createCanonContext(
        baseConfig,
        'req_test',
        undefined,
        { method: 'GET', path: '/api' }
      );

      context.set('payment.provider', 'stripe');
      context.set('payment.latency_ms', 150);
      context.set('deeply.nested.value', true);

      const event = context.get();
      expect((event as any).payment.provider).toBe('stripe');
      expect((event as any).payment.latency_ms).toBe(150);
      expect((event as any).deeply.nested.value).toBe(true);
    });

    it('marks error correctly', () => {
      const { context } = createCanonContext(
        baseConfig,
        'req_test',
        undefined,
        { method: 'GET', path: '/error' }
      );

      context.markError(new Error('Test error'));

      const event = context.get();
      expect(event.error).toBeDefined();
      expect(event.error?.type).toBe('Error');
      expect(event.error?.message).toBe('Test error');
      expect(event.outcome).toBe('error');
    });

    it('handles error objects with code and retriable', () => {
      const { context } = createCanonContext(
        baseConfig,
        'req_test',
        undefined,
        { method: 'GET', path: '/error' }
      );

      const err = new Error('Custom error') as Error & { code: string; retriable: boolean };
      err.code = 'ERR_TIMEOUT';
      err.retriable = true;

      context.markError(err);

      const event = context.get();
      expect(event.error?.code).toBe('ERR_TIMEOUT');
      expect(event.error?.retriable).toBe(true);
    });
  });

  describe('emit behavior', () => {
    it('emits event to stdout by default', () => {
      const { emit } = createCanonContext(
        baseConfig,
        'req_test',
        undefined,
        { method: 'GET', path: '/test' }
      );

      emit('success', 200);

      expect(process.stdout.write).toHaveBeenCalledTimes(1);
      const output = (process.stdout.write as any).mock.calls[0][0];
      const event = JSON.parse(output.trim());
      expect(event.status_code).toBe(200);
      expect(event.outcome).toBe('success');
    });

    it('emits exactly once even when called multiple times', () => {
      const { emit } = createCanonContext(
        baseConfig,
        'req_test',
        undefined,
        { method: 'GET', path: '/test' }
      );

      emit('success', 200);
      emit('success', 200);
      emit('error', 500);

      expect(process.stdout.write).toHaveBeenCalledTimes(1);
    });

    it('uses custom emit function when provided', () => {
      const customEmit = vi.fn();
      const config: CanonConfig = {
        ...baseConfig,
        emit: customEmit,
      };

      const { emit } = createCanonContext(
        config,
        'req_test',
        undefined,
        { method: 'GET', path: '/test' }
      );

      emit('success', 200);

      expect(customEmit).toHaveBeenCalledTimes(1);
      expect(process.stdout.write).not.toHaveBeenCalled();
    });

    it('includes duration_ms in emitted event', () => {
      const customEmit = vi.fn();
      const config: CanonConfig = {
        ...baseConfig,
        emit: customEmit,
      };

      const { emit } = createCanonContext(
        config,
        'req_test',
        undefined,
        { method: 'GET', path: '/test' }
      );

      emit('success', 200);

      const event = customEmit.mock.calls[0][0];
      expect(event.duration_ms).toBeDefined();
      expect(typeof event.duration_ms).toBe('number');
      expect(event.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('sets outcome to aborted when finalized as aborted', () => {
      const customEmit = vi.fn();
      const config: CanonConfig = {
        ...baseConfig,
        emit: customEmit,
      };

      const { emit } = createCanonContext(
        config,
        'req_test',
        undefined,
        { method: 'GET', path: '/test' }
      );

      emit('aborted', 499);

      const event = customEmit.mock.calls[0][0];
      expect(event.outcome).toBe('aborted');
      expect(event.status_code).toBe(499);
    });
  });

  describe('extractIds', () => {
    it('extracts IDs from headers when trustIncomingIds is true', () => {
      const headers = {
        'x-request-id': 'incoming-req-id',
        'x-trace-id': 'incoming-trace-id',
      };

      const { requestId, traceId } = extractIds(headers, baseConfig);

      expect(requestId).toBe('incoming-req-id');
      expect(traceId).toBe('incoming-trace-id');
    });

    it('generates new IDs when headers are missing', () => {
      const { requestId, traceId } = extractIds({}, baseConfig);

      expect(requestId).toMatch(/^req_[a-z2-7]+$/);
      expect(traceId).toMatch(/^trace_[a-z2-7]+$/);
    });

    it('uses custom header names from config', () => {
      const config: CanonConfig = {
        ...baseConfig,
        requestIdHeader: 'x-custom-request',
        traceIdHeader: 'x-custom-trace',
      };

      const headers = {
        'x-custom-request': 'custom-req',
        'x-custom-trace': 'custom-trace',
      };

      const { requestId, traceId } = extractIds(headers, config);

      expect(requestId).toBe('custom-req');
      expect(traceId).toBe('custom-trace');
    });
  });

  describe('finalization blocking', () => {
    it('warns and ignores enrich after finalization', () => {
      const customEmit = vi.fn();
      const config: CanonConfig = {
        ...baseConfig,
        emit: customEmit,
      };

      const { context, emit } = createCanonContext(
        config,
        'req_test',
        undefined,
        { method: 'GET', path: '/test' }
      );

      emit('success', 200);
      context.enrich({ late: 'data' });

      expect(process.stderr.write).toHaveBeenCalled();
      const warning = (process.stderr.write as any).mock.calls[0][0];
      expect(warning).toContain('enrich() called after finalization');
    });

    it('warns and ignores set after finalization', () => {
      const customEmit = vi.fn();
      const config: CanonConfig = {
        ...baseConfig,
        emit: customEmit,
      };

      const { context, emit } = createCanonContext(
        config,
        'req_test',
        undefined,
        { method: 'GET', path: '/test' }
      );

      emit('success', 200);
      context.set('late.data', 'value');

      expect(process.stderr.write).toHaveBeenCalled();
    });
  });
});

