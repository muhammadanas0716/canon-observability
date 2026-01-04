# Express Integration

Complete guide to integrating Canon with Express, including middleware ordering and lifecycle management.

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
  },
});

app.use(canonExpress({
  service: 'my-service',
  version: '1.0.0',
  schema,
}));

// Your routes
app.get('/user/:id', (req, res) => {
  req.canon.enrich({ user: { id: req.params.id } });
  res.json({ success: true });
});

// Error middleware AFTER all routes
app.use(canonExpressError());
```

## Middleware Ordering

**Critical:** `canonExpressError()` must be registered **after all routes**:

```typescript
app.use(canonExpress({ /* config */ }));

// Routes
app.get('/users', handler);
app.post('/checkout', handler);

// Error middleware LAST
app.use(canonExpressError());

// Optional: Your error handler
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});
```

This ensures `canonExpressError()` can capture errors thrown in route handlers.

## Request Lifecycle

### 1. Request Arrives

Canon middleware attaches `req.canon` context:

```typescript
app.use(canonExpress({ /* config */ }));
```

At this point:
- `request_id` and `trace_id` are extracted from headers (or generated)
- Response headers are set (`x-request-id`, `x-trace-id`)
- Base event fields are initialized (method, path, ip, user_agent, etc.)
- `req.canon` context is attached

### 2. Handlers Enrich

Your route handlers enrich the event:

```typescript
app.get('/user/:id', (req, res) => {
  req.canon.enrich({
    user: {
      id: req.params.id,
      subscription: 'premium',
    },
  });
  
  req.canon.set('action', 'user_lookup');
  
  res.json({ success: true });
});
```

### 3. Response Completes

Canon listens to two events:

#### `res.finish` - Normal Completion

```typescript
res.on('finish', () => {
  const hasError = context.get().error !== undefined;
  const outcome: RequestOutcome = hasError ? 'error' : 'success';
  finalizeOnce(outcome);
});
```

- `outcome = 'success'` if no error, else `'error'`
- `status_code = res.statusCode`

#### `res.close` - Client Abort

```typescript
res.on('close', () => {
  if (finalized) return;
  if (res.writableEnded) return; // Already finished
  
  finalizeOnce('aborted', 499);
});
```

- Only fires if response hasn't finished
- `outcome = 'aborted'`
- `status_code = 499` (forced)

### 4. Event Finalization

The emit-once guard ensures only one event is emitted:

```typescript
let finalized = false;

const finalizeOnce = (outcome: RequestOutcome, overrideStatusCode?: number) => {
  if (finalized) return;
  finalized = true;
  // ... emit logic
};
```

## Event Emission Flow

```
Request completes (finish or close)
    ↓
Finalize
  - Calculate duration_ms
  - Set status_code
  - Set outcome (success/error/aborted)
    ↓
Snapshot
  - Create immutable copy of event
    ↓
Redact (copy)
  - Apply PII redaction to copy
  - Original context remains unredacted
    ↓
Validate (redacted)
  - Check schema against redacted event
  - Log warnings/errors to stderr
    ↓
Sample
  - Decide if event should be emitted
  - Uses redacted event for decision
    ↓
Emit
  - Write JSON line to stdout (or custom emit function)
```

## Error Handling

### Automatic Error Capture

`canonExpressError()` automatically captures errors:

```typescript
app.use(canonExpressError());

// This error is automatically captured
app.get('/error', () => {
  throw new Error('Something went wrong!');
});
```

The error is normalized into the standard error structure:

```json
{
  "error": {
    "type": "Error",
    "message": "Something went wrong!",
    "stack": "Error: Something went wrong!\n    at ..."
  }
}
```

### Manual Error Capture

You can also capture errors manually:

```typescript
try {
  await processPayment();
} catch (err) {
  req.canon.markError(err);
  throw err;
}
```

### Error Properties

Canon extracts these error properties:

- `type` - Error name (e.g., `'Error'`, `'TypeError'`)
- `message` - Error message
- `code` - Error code if present (e.g., `'GATEWAY_TIMEOUT'`)
- `retriable` - Boolean if present
- `stack` - Stack trace (if available)

## Response Headers

Canon sets response headers for request and trace IDs:

```typescript
res.setHeader(requestIdHeader, requestId);
res.setHeader(traceIdHeader, traceId);
```

Default headers:
- `x-request-id` - Request ID
- `x-trace-id` - Trace ID

Customize via config:

```typescript
app.use(canonExpress({
  requestIdHeader: 'x-request-id',
  traceIdHeader: 'x-trace-id',
}));
```

## ID Extraction

Canon extracts IDs from request headers:

```typescript
const { requestId, traceId } = extractIds(req.headers, config);
```

### Trust Incoming IDs

By default, Canon trusts incoming IDs (`trustIncomingIds: true`). If an ID is present and valid, it's used. Otherwise, a new ID is generated.

To always generate new IDs:

```typescript
app.use(canonExpress({
  trustIncomingIds: false,
}));
```

### ID Validation

Canon validates incoming IDs:
- Request IDs must match pattern: `/^[a-zA-Z0-9_-]+$/`
- Trace IDs must match pattern: `/^[a-zA-Z0-9_-]+$/`

Invalid IDs are ignored and new ones are generated.

## Route Detection

Canon automatically captures Express route patterns:

```typescript
if (req.route?.path && !context.get().route) {
  context.set('route', req.route.path);
}
```

This sets the `route` field (e.g., `/users/:id`) in addition to `path` (e.g., `/users/123`).

## IP Address Extraction

Canon extracts and normalizes client IP addresses:

1. Prefers `req.socket?.remoteAddress`
2. Falls back to `x-forwarded-for` header (first IP)
3. Falls back to `x-real-ip` header
4. Normalizes IPv6-mapped IPv4 addresses (strips `::ffff:` prefix)

## TypeScript Support

Canon augments Express `Request` types:

```typescript
declare global {
  namespace Express {
    interface Request {
      canon: CanonContext;
    }
  }
}
```

This means `req.canon` is fully typed in TypeScript.

## Complete Example

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
    'cart.total_cents': { type: 'number' },
  },
});

app.use(canonExpress({
  service: 'checkout-service',
  version: '1.0.0',
  schema,
  redact: {
    enabled: true,
    strategy: 'mask',
    fields: ['user.email'],
  },
  sample: {
    sampleRateSuccess: 0.05,
    slowThresholdMs: 2000,
  },
}));

app.use((req, res, next) => {
  const userId = req.headers['x-user-id'] as string;
  if (userId) {
    req.canon.enrich({
      user: {
        id: userId,
        email: `user-${userId}@example.com`,
      },
    });
  }
  next();
});

app.post('/checkout', async (req, res) => {
  req.canon.enrich({
    cart: {
      total_cents: req.body.total_cents,
    },
  });
  
  try {
    await processPayment();
    res.json({ success: true });
  } catch (err) {
    req.canon.markError(err);
    throw err;
  }
});

app.use(canonExpressError());

app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.status(500).json({ error: err.message });
});

app.listen(3000);
```

## Next Steps

- Learn about [schema validation](./schema.md)
- Set up [redaction](./redaction.md) for PII protection
- Configure [tail sampling](./sampling.md) for cost control
- Check [troubleshooting](./troubleshooting.md) for common issues

