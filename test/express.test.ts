/**
 * Express Middleware Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import { canonExpress, canonExpressError } from '../src/middleware/express.js';
import type { CanonConfig, WideEvent } from '../src/types.js';

describe('Express Middleware', () => {
  let app: Express;
  let emittedEvents: WideEvent[];
  let config: CanonConfig;

  beforeEach(() => {
    emittedEvents = [];
    config = {
      service: 'test-service',
      version: '1.0.0',
      emit: (event) => emittedEvents.push(event),
      sample: () => true,
    };
    app = express();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('basic functionality', () => {
    it('emits exactly once on successful request', async () => {
      app.use(canonExpress(config));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      await request(app).get('/test').expect(200);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].status_code).toBe(200);
      expect(emittedEvents[0].outcome).toBe('success');
    });

    it('includes required fields in emitted event', async () => {
      app.use(canonExpress(config));
      app.get('/api/test', (_req, res) => res.json({ ok: true }));

      await request(app).get('/api/test').expect(200);

      const event = emittedEvents[0];
      expect(event.timestamp).toBeDefined();
      expect(event.request_id).toBeDefined();
      expect(event.service).toBe('test-service');
      expect(event.version).toBe('1.0.0');
      expect(event.method).toBe('GET');
      expect(event.path).toBe('/api/test');
      expect(event.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('generates request_id when not provided', async () => {
      app.use(canonExpress(config));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      await request(app).get('/test').expect(200);

      expect(emittedEvents[0].request_id).toMatch(/^req_[a-z2-7]+$/);
    });

    it('uses provided request_id from header', async () => {
      app.use(canonExpress(config));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      await request(app)
        .get('/test')
        .set('x-request-id', 'custom-request-id')
        .expect(200);

      expect(emittedEvents[0].request_id).toBe('custom-request-id');
    });

    it('propagates request_id and trace_id in response headers', async () => {
      app.use(canonExpress(config));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test').expect(200);

      expect(response.headers['x-request-id']).toBeDefined();
      expect(response.headers['x-trace-id']).toBeDefined();
    });
  });

  describe('enrichment', () => {
    it('allows handlers to enrich events', async () => {
      app.use(canonExpress(config));
      app.get('/test', (req, res) => {
        req.canon.enrich({ user: { id: 'u123', plan: 'premium' } });
        res.json({ ok: true });
      });

      await request(app).get('/test').expect(200);

      const event = emittedEvents[0];
      expect((event as any).user).toEqual({ id: 'u123', plan: 'premium' });
    });

    it('allows dot-path setting', async () => {
      app.use(canonExpress(config));
      app.get('/test', (req, res) => {
        req.canon.set('payment.provider', 'stripe');
        req.canon.set('payment.amount_cents', 1000);
        res.json({ ok: true });
      });

      await request(app).get('/test').expect(200);

      const event = emittedEvents[0];
      expect((event as any).payment.provider).toBe('stripe');
      expect((event as any).payment.amount_cents).toBe(1000);
    });

    it('merges nested objects correctly', async () => {
      app.use(canonExpress(config));
      app.get('/test', (req, res) => {
        req.canon.enrich({ user: { id: 'u123' } });
        req.canon.enrich({ user: { email: 'test@test.com' } });
        res.json({ ok: true });
      });

      await request(app).get('/test').expect(200);

      const event = emittedEvents[0];
      expect((event as any).user.id).toBe('u123');
      expect((event as any).user.email).toBe('test@test.com');
    });
  });

  describe('error handling', () => {
    it('captures errors via error middleware', async () => {
      app.use(canonExpress(config));
      app.get('/error', () => {
        throw new Error('Test error');
      });
      app.use(canonExpressError());
      app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({ error: err.message });
      });

      await request(app).get('/error').expect(500);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].outcome).toBe('error');
      expect(emittedEvents[0].error?.type).toBe('Error');
      expect(emittedEvents[0].error?.message).toBe('Test error');
    });

    it('captures errors passed to next()', async () => {
      app.use(canonExpress(config));
      app.get('/error', (_req, _res, next) => {
        next(new Error('Next error'));
      });
      app.use(canonExpressError());
      app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(500).json({ error: err.message });
      });

      await request(app).get('/error').expect(500);

      expect(emittedEvents[0].error?.message).toBe('Next error');
    });

    it('sets outcome to error for 5xx status codes', async () => {
      app.use(canonExpress(config));
      app.get('/error', (_req, res) => {
        res.status(503).json({ error: 'Service unavailable' });
      });

      await request(app).get('/error').expect(503);

      expect(emittedEvents[0].outcome).toBe('error');
      expect(emittedEvents[0].status_code).toBe(503);
    });
  });

  describe('abort handling', () => {
    it('emits aborted event with status 499 when close fires before finish', async () => {
      app.use(canonExpress(config));
      app.get('/abort', (_req, res) => {
        res.statusCode = 200;
        setTimeout(() => {
          if (!res.writableEnded) {
            res.destroy();
          }
        }, 10);
      });

      const server = app.listen(0);
      const port = (server.address() as any).port;
      
      const http = await import('http');
      const req = http.request({
        hostname: 'localhost',
        port,
        path: '/abort',
        method: 'GET',
      });
      
      req.on('error', () => {});
      req.end();
      
      await new Promise(resolve => setTimeout(resolve, 100));
      server.close();

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].outcome).toBe('aborted');
      expect(emittedEvents[0].status_code).toBe(499);
    });

    it('does not emit aborted if response already finished', async () => {
      app.use(canonExpress(config));
      app.get('/test', (_req, res) => {
        res.json({ ok: true });
      });

      await request(app).get('/test').expect(200);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].outcome).toBe('success');
      expect(emittedEvents[0].status_code).toBe(200);
    });

    it('does not emit aborted if writableEnded is true', async () => {
      app.use(canonExpress(config));
      app.get('/test', (_req, res) => {
        res.json({ ok: true });
        res.emit('close');
      });

      await request(app).get('/test').expect(200);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].outcome).toBe('success');
      expect(emittedEvents[0].status_code).toBe(200);
    });
  });

  describe('double emission prevention', () => {
    it('does not emit twice when response ends multiple times', async () => {
      app.use(canonExpress(config));
      app.get('/test', (_req, res) => {
        res.json({ ok: true });
      });

      await request(app).get('/test').expect(200);

      expect(emittedEvents).toHaveLength(1);
    });
  });

  describe('duration tracking', () => {
    it('captures positive duration_ms', async () => {
      app.use(canonExpress(config));
      app.get('/slow', async (_req, res) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        res.json({ ok: true });
      });

      await request(app).get('/slow').expect(200);

      expect(emittedEvents[0].duration_ms).toBeGreaterThan(0);
    });
  });

  describe('redaction', () => {
    it('redacts configured fields', async () => {
      const redactConfig: CanonConfig = {
        ...config,
        sample: () => true,
        redact: {
          enabled: true,
          strategy: 'mask',
          fields: ['user.email'],
        },
      };

      app.use(canonExpress(redactConfig));
      app.get('/test', (req, res) => {
        req.canon.enrich({ user: { email: 'secret@example.com' } });
        res.json({ ok: true });
      });

      await request(app).get('/test').expect(200);

      const event = emittedEvents[0];
      expect((event as any).user.email).not.toBe('secret@example.com');
      expect((event as any).user.email).toContain('*');
    });
  });

  describe('sampling', () => {
    it('respects custom sampling function', async () => {
      const sampledConfig: CanonConfig = {
        ...config,
        sample: () => false,
      };

      app.use(canonExpress(sampledConfig));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      await request(app).get('/test').expect(200);

      expect(emittedEvents).toHaveLength(0);
    });

    it('always samples errors regardless of sampling config', async () => {
      const sampledConfig: CanonConfig = {
        ...config,
        sample: { sampleRateSuccess: 0, slowThresholdMs: 999999 },
      };

      app.use(canonExpress(sampledConfig));
      app.get('/error', (_req, res) => {
        res.status(500).json({ error: 'Server error' });
      });

      await request(app).get('/error').expect(500);

      expect(emittedEvents).toHaveLength(1);
    });
  });

  describe('schema validation', () => {
    it('validates required fields and warns on missing', async () => {
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const schemaConfig: CanonConfig = {
        ...config,
        schema: {
          required: ['user.id'],
          fields: {},
        },
      };

      app.use(canonExpress(schemaConfig));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      await request(app).get('/test').expect(200);

      expect(stderrSpy).toHaveBeenCalled();
      const output = stderrSpy.mock.calls.flat().join('');
      expect(output).toContain('user.id');
    });
  });

  describe('ignorePaths', () => {
    it('prevents emission for ignored paths', async () => {
      const ignoreConfig: CanonConfig = {
        ...config,
        ignorePaths: ['/sw.js', '/favicon.ico'],
      };

      app.use(canonExpress(ignoreConfig));
      app.get('/sw.js', (_req, res) => res.json({ ok: true }));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      await request(app).get('/sw.js').expect(200);
      await request(app).get('/test').expect(200);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].path).toBe('/test');
    });

    it('supports regex patterns in ignorePaths', async () => {
      const ignoreConfig: CanonConfig = {
        ...config,
        ignorePaths: [/^\/static\//, '/api/health'],
      };

      app.use(canonExpress(ignoreConfig));
      app.get('/static/logo.png', (_req, res) => res.json({ ok: true }));
      app.get('/api/health', (_req, res) => res.json({ ok: true }));
      app.get('/api/users', (_req, res) => res.json({ ok: true }));

      await request(app).get('/static/logo.png').expect(200);
      await request(app).get('/api/health').expect(200);
      await request(app).get('/api/users').expect(200);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].path).toBe('/api/users');
    });

    it('supports function-based ignorePaths', async () => {
      const ignoreConfig: CanonConfig = {
        ...config,
        ignorePaths: (path) => path.startsWith('/internal'),
      };

      app.use(canonExpress(ignoreConfig));
      app.get('/internal/metrics', (_req, res) => res.json({ ok: true }));
      app.get('/public/api', (_req, res) => res.json({ ok: true }));

      await request(app).get('/internal/metrics').expect(200);
      await request(app).get('/public/api').expect(200);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].path).toBe('/public/api');
    });

    it('defaults ignorePaths when debug is true', async () => {
      const debugConfig: CanonConfig = {
        ...config,
        debug: true,
      };

      app.use(canonExpress(debugConfig));
      app.get('/sw.js', (_req, res) => res.json({ ok: true }));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      await request(app).get('/sw.js').expect(200);
      await request(app).get('/test').expect(200);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].path).toBe('/test');
    });
  });

  describe('debug mode', () => {
    it('bypasses sampling when debug is true', async () => {
      const debugConfig: CanonConfig = {
        ...config,
        debug: true,
        sample: () => false,
      };

      app.use(canonExpress(debugConfig));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      await request(app).get('/test').expect(200);

      expect(emittedEvents).toHaveLength(1);
      expect(emittedEvents[0].outcome).toBe('success');
    });

    it('bypasses sampling even with low sampleRateSuccess when debug is true', async () => {
      const debugConfig: CanonConfig = {
        ...config,
        debug: true,
        sample: { sampleRateSuccess: 0 },
      };

      app.use(canonExpress(debugConfig));
      app.get('/test', (_req, res) => res.json({ ok: true }));

      await request(app).get('/test').expect(200);

      expect(emittedEvents).toHaveLength(1);
    });

    it('defaults debug based on NODE_ENV when undefined', async () => {
      const originalEnv = process.env.NODE_ENV;
      
      process.env.NODE_ENV = 'production';
      const prodConfig: CanonConfig = {
        ...config,
        sample: () => false,
      };
      app.use(canonExpress(prodConfig));
      app.get('/test', (_req, res) => res.json({ ok: true }));
      await request(app).get('/test').expect(200);
      expect(emittedEvents).toHaveLength(0);
      
      app = express();
      emittedEvents = [];
      
      process.env.NODE_ENV = 'development';
      const devConfig: CanonConfig = {
        ...config,
        sample: () => false,
      };
      app.use(canonExpress(devConfig));
      app.get('/test', (_req, res) => res.json({ ok: true }));
      await request(app).get('/test').expect(200);
      expect(emittedEvents).toHaveLength(1);
      
      process.env.NODE_ENV = originalEnv;
    });
  });
});

