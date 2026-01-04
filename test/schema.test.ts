/**
 * Schema Validation Tests
 */

import { describe, it, expect } from 'vitest';
import { defineCanonSchema, validateSchema, getPiiFields, CANON_BASE_FIELDS } from '../src/core/schema.js';
import type { WideEvent } from '../src/types.js';

describe('Schema', () => {
  describe('defineCanonSchema', () => {
    it('creates schema with base fields included', () => {
      const schema = defineCanonSchema({});
      
      expect(schema.required).toEqual([]);
      expect(schema.fields).toEqual(CANON_BASE_FIELDS);
      expect(schema.unknownMode).toBe('allow');
    });

    it('merges user fields over base fields', () => {
      const schema = defineCanonSchema({
        required: ['user.id'],
        fields: {
          'user.id': { type: 'string' },
          'ip': { type: 'string', pii: false },
        },
        unknownMode: 'warn',
      });

      expect(schema.required).toEqual(['user.id']);
      expect(schema.fields['user.id']).toEqual({ type: 'string' });
      expect(schema.fields['ip']).toEqual({ type: 'string', pii: false });
      expect(schema.fields['timestamp']).toEqual({ type: 'string' });
      expect(schema.unknownMode).toBe('warn');
    });
  });

  describe('validateSchema', () => {
    const completeEvent: Partial<WideEvent> = {
      timestamp: '2024-01-15T10:30:00.000Z',
      request_id: 'req_test123',
      service: 'test-service',
      method: 'GET',
      path: '/test',
      status_code: 200,
      duration_ms: 50,
      outcome: 'success',
    };

    it('validates complete event with built-in required fields', () => {
      const result = validateSchema(completeEvent, undefined, false);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails on missing built-in required fields', () => {
      const incompleteEvent = {
        timestamp: '2024-01-15T10:30:00.000Z',
        request_id: 'req_test123',
      };

      const result = validateSchema(incompleteEvent, undefined, false);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('service'))).toBe(true);
    });

    it('validates custom required fields with dot paths', () => {
      const schema = defineCanonSchema({
        required: ['user.id', 'cart.total'],
      });

      const event = {
        ...completeEvent,
        user: { id: 'u123' },
        cart: { total: 100 },
      };

      const result = validateSchema(event, schema, false);
      expect(result.valid).toBe(true);
    });

    it('fails on missing custom required fields', () => {
      const schema = defineCanonSchema({
        required: ['user.id'],
      });

      const result = validateSchema(completeEvent, schema, false);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('user.id'))).toBe(true);
    });

    it('validates field types when present', () => {
      const schema = defineCanonSchema({
        fields: {
          'user.id': { type: 'string' },
          'cart.total': { type: 'number' },
        },
      });

      const event = {
        ...completeEvent,
        user: { id: 123 }, // wrong type
        cart: { total: 100 },
      };

      const result = validateSchema(event, schema, false);

      expect(result.valid).toBe(true); // warnings don't fail in non-strict
      expect(result.warnings.some(w => w.includes('user.id'))).toBe(true);
    });

    it('treats type errors as errors in strict mode', () => {
      const schema = defineCanonSchema({
        fields: {
          'user.id': { type: 'string' },
        },
      });

      const event = {
        ...completeEvent,
        user: { id: 123 },
      };

      const result = validateSchema(event, schema, true);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('user.id'))).toBe(true);
    });

    it('warns on unknown top-level keys when mode is warn', () => {
      const schema = defineCanonSchema({
        unknownMode: 'warn',
      });

      const event = {
        ...completeEvent,
        custom_field: 'value',
        another_unknown: 123,
      };

      const result = validateSchema(event, schema, false);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('custom_field'))).toBe(true);
    });

    it('rejects unknown top-level keys in strict mode with deny', () => {
      const schema = defineCanonSchema({
        unknownMode: 'deny',
      });

      const event = {
        ...completeEvent,
        unknown_field: 'value',
      };

      const result = validateSchema(event, schema, true);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('unknown_field'))).toBe(true);
    });

    it('allows unknown keys when mode is allow', () => {
      const schema = defineCanonSchema({
        unknownMode: 'allow',
      });

      const event = {
        ...completeEvent,
        anything: { goes: 'here' },
      };

      const result = validateSchema(event, schema, false);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('getPiiFields', () => {
    it('returns fields marked as PII including base fields', () => {
      const schema = defineCanonSchema({
        fields: {
          'user.id': { type: 'string', pii: false },
          'user.email': { type: 'string', pii: true },
          'user.phone': { type: 'string', pii: true },
          'cart.total': { type: 'number' },
        },
      });

      const piiFields = getPiiFields(schema);

      expect(piiFields).toContain('user.email');
      expect(piiFields).toContain('user.phone');
      expect(piiFields).toContain('ip');
      expect(piiFields).not.toContain('user.id');
      expect(piiFields).not.toContain('cart.total');
    });
  });
});

