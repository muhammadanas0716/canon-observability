# Wide Events

Understanding Canon's "one event per request" model and why it matters.

## What is a Wide Event?

A **wide event** is a single JSON object that contains all context for a request. Instead of multiple log lines, you get one structured event with everything:

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req_abc123",
  "service": "checkout-service",
  "method": "POST",
  "path": "/checkout",
  "status_code": 200,
  "duration_ms": 150,
  "outcome": "success",
  "user": { "id": "u_123", "subscription": "enterprise" },
  "cart": { "item_count": 3, "total_cents": 9999 },
  "payment": { "provider": "stripe", "latency_ms": 89, "success": true }
}
```

## The Problem with Traditional Logging

Traditional logging creates multiple log lines per request:

```javascript
logger.info('Request started', { path: '/checkout' });
logger.info('User authenticated', { userId: 'u123' });
logger.info('Payment processed', { amount: 9999 });
logger.info('Request completed', { duration: 150 });
```

This creates several problems:

### 1. Correlation is Hard

Multiple log lines need to be correlated by `request_id` or `trace_id`. This requires:
- Consistent ID propagation across all log statements
- Log aggregation that can group by ID
- Query complexity to reconstruct request context

### 2. Inconsistent Structure

Different log statements have different field shapes:

```javascript
logger.info('Request started', { path: '/checkout' });
logger.info('User authenticated', { userId: 'u123', plan: 'premium' });
logger.info('Payment processed', { amount: 9999, provider: 'stripe' });
```

This makes querying and analysis difficult.

### 3. No Guarantees

You might miss log emissions:
- Errors thrown before logging
- Client aborts before response completes
- Async operations that complete after response

### 4. PII Leakage

Sensitive data is scattered across multiple log lines, making redaction and compliance difficult.

### 5. High Cardinality

Multiple log lines per request multiply storage costs and make sampling decisions harder.

## Canon's Solution

Canon enforces **exactly one event per request**:

1. **Single emission** - One JSON object per request, guaranteed
2. **Incremental enrichment** - Build the event throughout the request lifecycle
3. **Guaranteed emission** - Emits on both `finish` and `close` events
4. **Structured format** - Consistent schema enforced by validation
5. **Redaction before emission** - PII protection built-in
6. **Tail sampling** - Make sampling decisions after request completion

## Event Lifecycle

```
Request arrives
    ↓
Canon attaches req.canon context
    ↓
Your handlers enrich via req.canon.enrich() / req.canon.set()
    ↓
Response completes (finish) or aborts (close)
    ↓
Canon finalizes event:
    1. Finalize (calculate duration, set outcome)
    2. Snapshot (create immutable copy)
    3. Redact (apply PII redaction to copy)
    4. Validate (check schema against redacted event)
    5. Sample (decide if event should be emitted)
    6. Emit (write JSON line to stdout)
```

## Key Guarantees

### Exactly One Event Per Request

Canon uses an emit-once guard to ensure only one event is emitted, even if both `finish` and `close` events fire:

```typescript
let emitted = false;

const emitEvent = () => {
  if (emitted) return;
  emitted = true;
  // ... emit logic
};
```

### Abort Handling

Canon listens to both `res.finish` and `res.close`:

- **`finish`**: Normal response completion
  - `outcome = 'success'` if no error, else `'error'`
  - `status_code = res.statusCode`

- **`close`**: Client disconnect/abort (only if response not ended)
  - `outcome = 'aborted'`
  - `status_code = 499` (forced)

### Error Capture

Errors are captured via `canonExpressError()` middleware, which calls `req.canon.markError(err)`. This normalizes errors into a standard structure:

```json
{
  "error": {
    "type": "Error",
    "message": "Payment gateway timeout",
    "code": "GATEWAY_TIMEOUT",
    "retriable": true
  }
}
```

## Benefits

### 1. Simple Queries

Query one event instead of correlating multiple log lines:

```sql
-- Find all failed checkouts with payment provider info
SELECT * FROM events
WHERE outcome = 'error'
  AND payment.provider IS NOT NULL
```

### 2. Consistent Structure

All events follow the same schema, making analysis predictable.

### 3. Guaranteed Coverage

Every request emits exactly one event, even on errors or aborts.

### 4. Efficient Sampling

Make sampling decisions after request completion with full context:

```typescript
sample: (event) => {
  // Always sample errors, slow requests, and enterprise users
  if (event.status_code >= 500) return true;
  if (event.duration_ms > 2000) return true;
  if (event.user?.subscription === 'enterprise') return true;
  return Math.random() < 0.05; // 5% of the rest
}
```

### 5. PII Protection

Redaction happens on a copy before emission, protecting sensitive data:

```typescript
redact: {
  enabled: true,
  strategy: 'mask',
  fields: ['user.email'],
}
```

## Where Events Go

By default, Canon writes JSON lines to **stdout**:

```json
{"timestamp":"2024-01-15T10:30:00.000Z","request_id":"req_abc123",...}
```

Your infrastructure then captures stdout:
- **Docker**: `docker logs <container>`
- **Kubernetes**: `kubectl logs <pod>`
- **Log shippers**: Fluentd, Fluent Bit, Logstash
- **Observability platforms**: Loki, ELK, Datadog, New Relic

Canon doesn't ship logs directly - it just writes to stdout. Your infrastructure handles shipping to your observability backend.

## Next Steps

- Learn about [schema validation](./schema.md) to enforce structure
- Set up [redaction](./redaction.md) for PII protection
- Configure [tail sampling](./sampling.md) for cost control
- Read about [Express integration](./express-integration.md) for lifecycle details

