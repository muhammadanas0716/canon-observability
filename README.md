# canon-observability

[![npm version](https://img.shields.io/npm/v/canon-observability.svg)](https://www.npmjs.com/package/canon-observability)
[![license](https://img.shields.io/npm/l/canon-observability.svg)](LICENSE)

**One request = one canonical wide event.**

Canon is an observability library for Node.js that guarantees exactly one structured event per HTTP request in Express.

## Install

```bash
pnpm add canon
# or
npm install canon
# or
yarn add canon
```

## 60-Second Express Example

```typescript
import express from 'express';
import { canonExpress, canonExpressError, createConsoleEmitter } from 'canon';

const app = express();
app.use(express.json());

app.use(canonExpress({
  service: 'my-api',
  version: '1.0.0',
  debug: true,
  emit: createConsoleEmitter({ pretty: true }),
}));

app.get('/ok', (req, res) => {
  req.canon.enrich({ user: { id: 'u123' } });
  res.json({ status: 'ok' });
});

app.get('/boom', () => {
  throw new Error('Something broke');
});

app.use(canonExpressError());
app.use((err: Error, _req: express.Request, res: express.Response) => {
  res.status(500).json({ error: err.message });
});

app.listen(3000);
```

### Example Output

**Success event:**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req_abc123",
  "service": "my-api",
  "version": "1.0.0",
  "method": "GET",
  "path": "/ok",
  "status_code": 200,
  "duration_ms": 5,
  "outcome": "success",
  "user": {
    "id": "u123"
  }
}
```

**Error event:**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req_def456",
  "service": "my-api",
  "version": "1.0.0",
  "method": "GET",
  "path": "/boom",
  "status_code": 500,
  "duration_ms": 2,
  "outcome": "error",
  "error": {
    "type": "Error",
    "message": "Something broke",
    "stack": "Error: Something broke\n    at ..."
  }
}
```

## Where Do Logs Go?

By default, Canon writes JSON lines to **stdout**. In production:

- **Docker**: `docker logs <container>` captures stdout
- **Kubernetes**: `kubectl logs <pod>` captures stdout
- **Platform logs**: AWS CloudWatch, GCP Logging, Azure Monitor all capture stdout
- **Ship to vendor**: Replace `emit` with your log aggregation service (Datadog, New Relic, etc.)

```typescript
emit: (event) => {
  datadogClient.send(event);
}
```

## Common Gotchas

1. **Error middleware MUST be after routes**: `canonExpressError()` must come after all route handlers to capture errors.

2. **You might see `/sw.js` events**: Service workers and favicon requests create events. Use `ignorePaths` to filter them:
   ```typescript
   ignorePaths: ['/favicon.ico', '/robots.txt', '/sw.js']
   ```

3. **Sampling in production may drop success events**: By default, only 5% of successful requests are emitted. Use `debug: true` in development to see all events, or adjust `sample.sampleRateSuccess`.

## Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `service` | `string` | **Required.** Service name |
| `version` | `string` | Service version |
| `debug` | `boolean` | Bypass sampling and emit all events. Defaults to `process.env.NODE_ENV !== "production"` |
| `emit` | `(event) => void` | Custom emit function. Default: JSON to stdout |
| `schema` | `CanonSchema` | Event schema for validation |
| `redact` | `RedactionConfig` | PII redaction configuration |
| `sample` | `SamplingConfig \| function` | Sampling configuration |
| `ignorePaths` | `(string \| RegExp)[] \| (path: string) => boolean` | Paths to ignore (no event created) |
| `requestIdHeader` | `string` | Header name for request ID (default: `'x-request-id'`) |
| `traceIdHeader` | `string` | Header name for trace ID (default: `'x-trace-id'`) |
| `trustIncomingIds` | `boolean` | Trust incoming request/trace IDs (default: `true`) |

## Next.js

Canon works with Next.js **server-side only** (API routes and route handlers) because it runs on Node.js. It does **not** work for browser/client-side logging.

```typescript
// app/api/route.ts
import { canonExpress, canonExpressError } from 'canon';
import express from 'express';

const app = express();
app.use(canonExpress({ service: 'next-api', debug: true }));
// ... routes ...
app.use(canonExpressError());
```

## License

MIT
