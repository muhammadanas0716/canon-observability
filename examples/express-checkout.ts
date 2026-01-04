/**
 * Canon Express Checkout Example
 * 
 * Demonstrates a realistic e-commerce checkout flow with:
 * - Schema validation with required fields
 * - PII redaction (schema-level strategies override global config)
 * - Tail sampling
 * - Rich business context
 * 
 * Run with: pnpm tsx examples/express-checkout.ts
 * 
 * Note: For published package usage, import from 'canon' instead of '../src/index'
 */

import express from 'express';
// In-repo development import (no .js extension for tsx)
// For published usage: import { canonExpress, canonExpressError, defineCanonSchema } from 'canon';
import { canonExpress, canonExpressError, defineCanonSchema } from '../src/index';

const app = express();
app.use(express.json());

/**
 * Define a schema for checkout events.
 * Canon automatically includes base fields (timestamp, request_id, ip, etc.)
 * so you only need to define your business-specific fields.
 * 
 * Schema-level redaction strategies (like 'hash' on user.email) take precedence
 * over the global redact.strategy in config.
 */
const schema = defineCanonSchema({
  required: ['user.id'],
  fields: {
    'user.id': { type: 'string', cardinality: 'high' },
    'user.email': { type: 'string', pii: true, redaction: 'hash' },
    'user.subscription': { type: 'string', cardinality: 'low' },
    'cart.id': { type: 'string', cardinality: 'high' },
    'cart.item_count': { type: 'number' },
    'cart.total_cents': { type: 'number' },
    'payment.provider': { type: 'string', cardinality: 'low' },
    'payment.latency_ms': { type: 'number' },
    'payment.success': { type: 'boolean' },
    'feature_flags': { type: 'object' },
    'error.code': { type: 'string' },
    'action': { type: 'string' },
  },
  unknownMode: 'warn',
});

/**
 * Configure Canon with production-like settings
 */
app.use(canonExpress({
  service: 'checkout-service',
  version: '0.1.0',
  deployment_id: process.env.DEPLOYMENT_ID || 'local',
  region: process.env.REGION || 'local',
  schema,
  
  emit: (event) => {
    process.stdout.write(JSON.stringify(event, null, 2) + '\n');
  },
  
  strict: false,
  
  sample: (event) => {
    if (event.status_code >= 500) return true;
    if (event.error) return true;
    if ((event.duration_ms ?? 0) > 2000) return true;
    if ((event as any).user?.subscription === 'enterprise') return true;
    if ((event as any).feature_flags?.new_checkout_flow === true) return true;
    return Math.random() < 0.05;
  },
  
  /**
   * Redaction config. Note:
   * - 'user.email' uses 'hash' strategy from schema (overrides global 'mask')
   * - 'headers.authorization' uses global 'mask' strategy
   * - IP is not redacted here; it's shown as-is (::1 or 127.0.0.1 for localhost)
   */
  redact: {
    enabled: true,
    strategy: 'mask',
    fields: ['user.email', 'headers.authorization'],
  },
}));

const users: Record<string, { id: string; email: string; plan: string }> = {
  'u_123': { id: 'u_123', email: 'john@example.com', plan: 'premium' },
  'u_456': { id: 'u_456', email: 'jane@enterprise.com', plan: 'enterprise' },
  'u_789': { id: 'u_789', email: 'bob@free.com', plan: 'free' },
};

const carts: Record<string, { id: string; items: number; total: number }> = {
  'cart_1': { id: 'cart_1', items: 3, total: 9999 },
  'cart_2': { id: 'cart_2', items: 1, total: 4999 },
};

app.use((req, _res, next) => {
  const userId = req.headers['x-user-id'] as string || 'u_123';
  const user = users[userId];
  
  if (user) {
    (req as any).user = user;
    req.canon.enrich({
      user: {
        id: user.id,
        subscription: user.plan,
        email: user.email,
      },
    });
  }
  
  req.canon.enrich({
    feature_flags: {
      new_checkout_flow: Math.random() > 0.5,
      dark_mode: true,
    },
  });
  
  next();
});

app.post('/checkout', async (req, res) => {
  const cartId = req.body.cart_id || 'cart_1';
  const cart = carts[cartId];
  
  if (!cart) {
    req.canon.set('error.code', 'CART_NOT_FOUND');
    res.status(404).json({ error: 'Cart not found' });
    return;
  }
  
  req.canon.enrich({
    cart: {
      id: cart.id,
      item_count: cart.items,
      total_cents: cart.total,
    },
  });
  
  const paymentStart = Date.now();
  try {
    await simulatePayment(cart.total);
    const paymentLatency = Date.now() - paymentStart;
    
    req.canon.enrich({
      payment: {
        provider: 'stripe',
        latency_ms: paymentLatency,
        success: true,
      },
    });
    
    res.json({
      success: true,
      order_id: 'ord_' + Math.random().toString(36).slice(2),
      total: cart.total,
    });
  } catch (err) {
    const paymentLatency = Date.now() - paymentStart;
    
    req.canon.enrich({
      payment: {
        provider: 'stripe',
        latency_ms: paymentLatency,
        success: false,
      },
    });
    
    throw err;
  }
});

app.get('/cart/:id', (req, res) => {
  const cart = carts[req.params.id];
  
  if (!cart) {
    req.canon.set('error.code', 'CART_NOT_FOUND');
    res.status(404).json({ error: 'Cart not found' });
    return;
  }
  
  req.canon.enrich({
    cart: {
      id: cart.id,
      item_count: cart.items,
      total_cents: cart.total,
    },
  });
  
  res.json(cart);
});

app.get('/slow', async (req, res) => {
  req.canon.set('action', 'slow_operation');
  await new Promise(resolve => setTimeout(resolve, 2500));
  res.json({ message: 'Finally done!' });
});

app.get('/fail', () => {
  const err = new Error('Payment gateway timeout') as Error & { code: string; retriable: boolean };
  err.code = 'GATEWAY_TIMEOUT';
  err.retriable = true;
  throw err;
});

async function simulatePayment(amount: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
  
  if (amount > 50000) {
    const err = new Error('Amount exceeds limit') as Error & { code: string };
    err.code = 'AMOUNT_LIMIT_EXCEEDED';
    throw err;
  }
  
  if (Math.random() < 0.1) {
    throw new Error('Payment declined');
  }
}

app.use(canonExpressError());

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const statusCode = (err as any).statusCode || 500;
  res.status(statusCode).json({
    error: err.message,
    code: (err as any).code,
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Checkout example running on http://localhost:${PORT}`);
  console.log('');
  console.log('Try these commands:');
  console.log('');
  console.log('  # Successful checkout (always sampled for enterprise users)');
  console.log(`  curl -X POST http://localhost:${PORT}/checkout -H "Content-Type: application/json" -H "x-user-id: u_456" -d '{"cart_id":"cart_1"}'`);
  console.log('');
  console.log('  # Get cart');
  console.log(`  curl http://localhost:${PORT}/cart/cart_1`);
  console.log('');
  console.log('  # Slow endpoint (always sampled due to duration)');
  console.log(`  curl http://localhost:${PORT}/slow`);
  console.log('');
  console.log('  # Error endpoint');
  console.log(`  curl http://localhost:${PORT}/fail`);
});
