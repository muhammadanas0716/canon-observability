/**
 * Canon Express Basic Example
 * 
 * Demonstrates the minimal setup for Canon with Express.
 * Run with: pnpm tsx examples/express-basic.ts
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
 * Define a schema with your business-specific fields.
 * Canon automatically includes base fields (timestamp, request_id, ip, etc.)
 */
const schema = defineCanonSchema({
  required: [],
  fields: {
    'user.id': { type: 'string' },
    'action': { type: 'string' },
  },
  unknownMode: 'allow',
});

/**
 * Register Canon middleware
 * - Attaches req.canon to every request
 * - Emits one event per request on response finish/close
 */
app.use(canonExpress({
  service: 'basic-example',
  version: '1.0.0',
  schema,
  emit: (event) => {
    console.log(JSON.stringify(event, null, 2));
  },
}));

app.get('/hello', (req, res) => {
  req.canon.enrich({ action: 'greeting' });
  res.json({ message: 'Hello, World!' });
});

app.get('/user/:id', (req, res) => {
  req.canon.enrich({
    user: {
      id: req.params.id,
    },
  });
  
  req.canon.set('action', 'user_lookup');
  
  res.json({ userId: req.params.id, name: 'Example User' });
});

app.get('/error', () => {
  throw new Error('Something went wrong!');
});

/**
 * Register Canon error middleware AFTER all routes
 * This captures errors and attaches them to the Canon event
 */
app.use(canonExpressError());

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Basic example running on http://localhost:${PORT}`);
  console.log('Try:');
  console.log(`  curl http://localhost:${PORT}/hello`);
  console.log(`  curl http://localhost:${PORT}/user/123`);
  console.log(`  curl http://localhost:${PORT}/error`);
});
