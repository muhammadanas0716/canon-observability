# Troubleshooting

Common issues and solutions when using Canon.

## Why am I seeing "unknown top-level field" warnings?

This happens when `unknownMode: 'warn'` is set and you add fields not defined in your schema.

**Example warning:**
```
[canon] validation warning (req_abc123): Unknown top-level field: custom_field
```

### Solutions

1. **Set `unknownMode: 'allow'`** (Recommended for v0)
   ```typescript
   const schema = defineCanonSchema({
     fields: { /* your fields */ },
     unknownMode: 'allow', // No warnings
   });
   ```

2. **Define all top-level fields** you use in your schema
   ```typescript
   const schema = defineCanonSchema({
     fields: {
       'user.id': { type: 'string' },
       'custom_field': { type: 'string' }, // Define it
     },
     unknownMode: 'warn',
   });
   ```

3. **Wait for base schema merging** (Planned feature)
   Base schema merging is planned for a future release, which will automatically merge Canon base fields into user schemas.

**Note:** `unknownMode` only applies to **top-level keys** in v0. Nested unknown fields are always allowed.

## Why is `outcome` set to `'aborted'`?

This happens when the client disconnects before the response completes. Canon detects this via the `res.close` event.

**Common causes:**
- Client closes connection before response completes
- Network timeout
- Browser navigation away from page
- Request cancellation

**Solution:** This is expected behavior. Canon captures aborted requests to help you understand client disconnects.

## Why is `status_code` 499?

Status code 499 (Client Closed Request) is set when `outcome === 'aborted'`. This is a non-standard status code used by Canon to indicate client disconnects.

**Note:** 499 is not an HTTP standard status code, but it's commonly used by proxies and load balancers to indicate client disconnects.

## Why isn't my event being emitted?

Check these in order:

### 1. Is the request completing?

Canon emits events on `res.finish` or `res.close`. If neither fires, no event is emitted.

**Check:**
- Is the response being sent? (`res.json()`, `res.send()`, etc.)
- Is there an error handler that might be preventing completion?

### 2. Is sampling filtering it out?

Check your `sample` configuration:

```typescript
sample: {
  sampleRateSuccess: 0.05, // Only 5% of successes
}
```

**Solution:** Temporarily set `sample: () => true` to always emit:

```typescript
sample: () => true, // Always emit for debugging
```

### 3. Is validation failing in strict mode?

Check stderr for validation errors:

```
[canon] validation error (req_abc123): Missing required field: user.id
```

**Solution:** Fix validation errors or set `strict: false`:

```typescript
strict: false, // Don't block on validation errors
```

### 4. Is `canonExpressError()` registered after all routes?

`canonExpressError()` must be registered **after all routes**:

```typescript
app.use(canonExpress({ /* config */ }));

// Routes
app.get('/users', handler);

// Error middleware LAST
app.use(canonExpressError());
```

## How do I see events during development?

Use a custom emit function:

```typescript
app.use(canonExpress({
  service: 'my-service',
  emit: (event) => {
    console.log(JSON.stringify(event, null, 2));
  },
}));
```

Or pipe stdout through `jq`:

```bash
node server.js | jq
```

## Why are my events not being redacted?

Check these:

### 1. Is redaction enabled?

```typescript
redact: {
  enabled: true, // Must be true
  strategy: 'mask',
  fields: ['user.email'],
}
```

### 2. Are fields listed in `redact.fields`?

Fields must be explicitly listed:

```typescript
redact: {
  enabled: true,
  fields: ['user.email'], // Must list fields
}
```

**Note:** `pii: true` in schema is metadata only. To actually redact, add the field to `redact.fields`.

### 3. Are fields present in the event?

Redaction only applies to fields that exist in the event. Check that fields are being set:

```typescript
req.canon.enrich({
  user: {
    email: 'user@example.com', // Must be set
  },
});
```

## Why is my custom emit function not being called?

Check:

1. **Is the event being sampled?** Sampling happens before emission. If sampling returns `false`, emit is not called.

2. **Is validation failing in strict mode?** In strict mode, validation errors prevent emission.

3. **Is the request completing?** Events only emit on `res.finish` or `res.close`.

**Solution:** Add logging to your emit function:

```typescript
emit: (event) => {
  console.log('Emitting event:', event.request_id);
  process.stdout.write(JSON.stringify(event) + '\n');
}
```

## Why are validation errors not showing?

Validation errors are logged to **stderr**, not stdout:

```typescript
process.stderr.write(
  `[canon] validation error (${requestId}): ${error}\n`
);
```

**Solution:** Check stderr:

```bash
node server.js 2>&1 | grep canon
```

## Why is `duration_ms` 0 or very small?

`duration_ms` is calculated from when the Canon context is created (middleware registration) to when the response completes.

**Common causes:**
- Very fast requests (< 1ms)
- Timing precision limits

**Solution:** This is expected for fast requests. Canon uses high-resolution timers (`process.hrtime.bigint()`), but very fast requests may show 0ms.

## Why is `route` not set?

`route` is only set if Express has matched a route pattern:

```typescript
if (req.route?.path && !context.get().route) {
  context.set('route', req.route.path);
}
```

**Common causes:**
- Route not matched (404)
- Middleware before route matching

**Solution:** This is expected. `route` is only set when Express matches a route pattern.

## Why are request/trace IDs not in response headers?

Canon sets response headers by default:

```typescript
res.setHeader(requestIdHeader, requestId);
res.setHeader(traceIdHeader, traceId);
```

**Check:**
- Are headers being set? (Check response headers in browser/devtools)
- Are you using custom header names? (Check `requestIdHeader` / `traceIdHeader` config)

**Solution:** Verify headers are set:

```typescript
app.use(canonExpress({
  requestIdHeader: 'x-request-id',
  traceIdHeader: 'x-trace-id',
}));
```

## Getting Help

If you're still stuck:

1. Check the [Express integration guide](./express-integration.md) for lifecycle details
2. Review the [schema documentation](./schema.md) for validation issues
3. Check the [examples](../examples/) for working code
4. Open an issue on GitHub with:
   - Canon version
   - Express version
   - Minimal reproduction code
   - Error messages from stderr

