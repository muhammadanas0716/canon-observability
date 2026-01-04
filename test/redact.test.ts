/**
 * Redaction Tests
 */

import { describe, it, expect } from 'vitest';
import { applyRedaction, createRedactionConfig } from '../src/core/redact.js';
import type { WideEvent } from '../src/types.js';

describe('Redaction', () => {
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

  describe('mask strategy', () => {
    it('masks email addresses', () => {
      const event = {
        ...baseEvent,
        user: { email: 'john@example.com' },
      };

      const config = createRedactionConfig({
        enabled: true,
        strategy: 'mask',
        fields: ['user.email'],
      });

      const redacted = applyRedaction(event, config);

      expect((redacted as any).user.email).not.toBe('john@example.com');
      expect((redacted as any).user.email).toContain('@');
      expect((redacted as any).user.email).toContain('*');
    });

    it('masks regular strings keeping first and last char', () => {
      const event = {
        ...baseEvent,
        user: { name: 'secret' },
      };

      const config = createRedactionConfig({
        enabled: true,
        strategy: 'mask',
        fields: ['user.name'],
      });

      const redacted = applyRedaction(event, config);

      expect((redacted as any).user.name).toBe('s****t');
    });

    it('handles short strings', () => {
      const event = {
        ...baseEvent,
        user: { code: 'ab' },
      };

      const config = createRedactionConfig({
        enabled: true,
        strategy: 'mask',
        fields: ['user.code'],
      });

      const redacted = applyRedaction(event, config);

      expect((redacted as any).user.code).toBe('**');
    });
  });

  describe('hash strategy', () => {
    it('hashes values to SHA-256', () => {
      const event = {
        ...baseEvent,
        user: { email: 'john@example.com' },
      };

      const config = createRedactionConfig({
        enabled: true,
        strategy: 'hash',
        fields: ['user.email'],
      });

      const redacted = applyRedaction(event, config);

      expect((redacted as any).user.email).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces consistent hashes for same input', () => {
      const event1 = { ...baseEvent, user: { email: 'test@test.com' } };
      const event2 = { ...baseEvent, user: { email: 'test@test.com' } };

      const config = createRedactionConfig({
        enabled: true,
        strategy: 'hash',
        fields: ['user.email'],
      });

      const redacted1 = applyRedaction(event1, config);
      const redacted2 = applyRedaction(event2, config);

      expect((redacted1 as any).user.email).toBe((redacted2 as any).user.email);
    });
  });

  describe('drop strategy', () => {
    it('replaces values with [REDACTED]', () => {
      const event = {
        ...baseEvent,
        headers: { authorization: 'Bearer secret-token' },
      };

      const config = createRedactionConfig({
        enabled: true,
        strategy: 'drop',
        fields: ['headers.authorization'],
      });

      const redacted = applyRedaction(event, config);

      expect((redacted as any).headers.authorization).toBe('[REDACTED]');
    });
  });

  describe('copy behavior', () => {
    it('does not mutate the original event', () => {
      const event = {
        ...baseEvent,
        user: { email: 'original@test.com' },
      };

      const config = createRedactionConfig({
        enabled: true,
        strategy: 'drop',
        fields: ['user.email'],
      });

      const originalEmail = event.user.email;
      applyRedaction(event, config);

      expect(event.user.email).toBe(originalEmail);
    });

    it('returns a copy even when redaction is disabled', () => {
      const event = {
        ...baseEvent,
        user: { email: 'test@test.com' },
      };

      const config = createRedactionConfig({ enabled: false });

      const result = applyRedaction(event, config);

      expect(result).not.toBe(event);
      expect(result).toEqual(event);
    });
  });

  describe('field handling', () => {
    it('ignores fields that do not exist', () => {
      const event = { ...baseEvent };

      const config = createRedactionConfig({
        enabled: true,
        strategy: 'mask',
        fields: ['user.email', 'nonexistent.field'],
      });

      const redacted = applyRedaction(event, config);

      expect(redacted).toBeDefined();
      expect((redacted as any).nonexistent).toBeUndefined();
    });

    it('handles deeply nested fields', () => {
      const event = {
        ...baseEvent,
        deeply: { nested: { secret: 'value' } },
      };

      const config = createRedactionConfig({
        enabled: true,
        strategy: 'drop',
        fields: ['deeply.nested.secret'],
      });

      const redacted = applyRedaction(event, config);

      expect((redacted as any).deeply.nested.secret).toBe('[REDACTED]');
    });

    it('handles null and undefined values', () => {
      const event = {
        ...baseEvent,
        user: { email: null },
      };

      const config = createRedactionConfig({
        enabled: true,
        strategy: 'mask',
        fields: ['user.email'],
      });

      const redacted = applyRedaction(event, config);

      expect((redacted as any).user.email).toBeNull();
    });
  });
});

