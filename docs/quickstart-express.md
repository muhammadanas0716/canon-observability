# Quickstart: Express

Get Canon running in your Express application in 5 minutes.

## Installation

```bash
pnpm add canon
```

## Basic Setup

```typescript
import express from 'express';
import { canonExpress, canonExpressError, defineCanonSchema } from 'canon';

const app = express();
app.use(express.json());

const schema = defineCanonSchema({
  required: ['user.id'],
  fields: {
    'user.id': { type: 'string' },
    'user.email': { type: 'string', pii: true },
  },
});

app.use(canonExpress({
  service: 'my-service',
  version: '1.0.0',
  schema,
  redact: {
    enabled: true,
    strategy: 'mask',
    fields: ['user.email'],
  },
}));

app.get('/user/:id', (req, res) => {
  req.canon.enrich({
    user: {
      id: req.params.id,
      email: 'user@example.com',
    },
  });
  res.json({ success: true });
});

app.use(canonExpressError());

app.listen(3000);
```

## What Happens

1. **Request arrives** - Canon attaches `req.canon` context
2. **Your handlers enrich** - Use `req.canon.enrich()` or `req.canon.set()`
3. **Response completes** - Canon emits one JSON event to stdout
4. **Errors captured** - `canonExpressError()` captures thrown errors

## Enriching Events

### Merge nested objects

```typescript
req.canon.enrich({
  user: {
    id: 'u_123',
    subscription: 'enterprise',
  },
  cart: {
    item_count: 3,
    total_cents: 9999,
  },
});
```

### Set dot-path values

```typescript
req.canon.set('payment.provider', 'stripe');
req.canon.set('payment.latency_ms', 150);
```

### Capture errors

Errors are automatically captured by `canonExpressError()`, or manually:

```typescript
try {
  await processPayment();
} catch (err) {
  req.canon.markError(err);
  throw err;
}
```

## Viewing Events

By default, events are written as JSON lines to stdout:

```bash
node server.js | jq
```

Or use a custom emit function:

```typescript
emit: (event) => {
  console.log(JSON.stringify(event, null, 2));
}
```

## Example Output

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req_abc123",
  "service": "my-service",
  "version": "1.0.0",
  "method": "GET",
  "path": "/user/123",
  "status_code": 200,
  "duration_ms": 45,
  "outcome": "success",
  "user": {
    "id": "123",
    "email": "u***@e***.com"
  }
}
```

## Next Steps

- Learn about [wide events](./concepts-wide-events.md)
- Configure [schema validation](./schema.md)
- Set up [redaction](./redaction.md) for PII protection
- Configure [tail sampling](./sampling.md) for cost control

