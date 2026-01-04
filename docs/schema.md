# Schema Validation

Define and validate your event structure with Canon schemas.

## Defining a Schema

Use `defineCanonSchema()` to create a schema:

```typescript
import { defineCanonSchema } from 'canon';

const schema = defineCanonSchema({
  required: ['user.id', 'cart.total_cents'],
  fields: {
    'user.id': { type: 'string' },
    'user.email': { type: 'string', pii: true },
    'cart.total_cents': { type: 'number' },
  },
  unknownMode: 'warn',
});
```

## Schema Structure

### Required Fields

List fields that must be present in every event:

```typescript
required: ['user.id', 'cart.total_cents']
```

**Note:** Canon automatically requires these built-in fields:
- `timestamp`, `request_id`, `service`, `method`, `path`, `status_code`, `duration_ms`, `outcome`

You only need to list your **business-specific** required fields.

### Field Definitions

Define field types and metadata:

```typescript
fields: {
  'user.id': { type: 'string' },
  'user.email': { type: 'string', pii: true, redaction: 'hash' },
  'cart.total_cents': { type: 'number' },
  'feature_flags': { type: 'object' },
}
```

#### Field Types

- `'string'` - String values
- `'number'` - Numeric values (validated, NaN rejected)
- `'boolean'` - Boolean values
- `'object'` - Plain objects (arrays rejected)
- `'array'` - Array values

#### Field Properties

- `type` (required) - Field type for validation
- `pii` (optional) - Mark field as containing PII (metadata only)
- `redaction` (optional) - Per-field redaction strategy (`'mask' | 'hash' | 'drop'`)
- `cardinality` (optional) - Field cardinality hint (`'low' | 'high'`)

### Unknown Mode

Controls how unknown **top-level** fields are handled:

```typescript
unknownMode: 'allow' | 'warn' | 'deny'
```

- `'allow'` (default) - Accept unknown fields silently
- `'warn'` - Accept but log warning to stderr
- `'deny'` - Reject in strict mode, warn in non-strict

**Important:** `unknownMode` only applies to **top-level keys** in v0. Nested unknown fields are always allowed.

## Built-in Base Fields

Canon automatically includes definitions for its canonical event fields. These are recognized as known fields and won't trigger unknown field warnings:

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string | ISO 8601 timestamp |
| `request_id` | string | Unique request identifier |
| `trace_id` | string | Trace ID for distributed tracing |
| `service` | string | Service name |
| `version` | string | Service version |
| `deployment_id` | string | Deployment identifier |
| `region` | string | Deployment region |
| `method` | string | HTTP method |
| `path` | string | Request path |
| `route` | string | Route pattern (e.g., `/users/:id`) |
| `status_code` | number | HTTP status code |
| `duration_ms` | number | Request duration in ms |
| `outcome` | string | `'success'` \| `'error'` \| `'aborted'` |
| `ip` | string | Client IP (marked as PII) |
| `user_agent` | string | Client user agent |
| `error` | object | Error details if present |

This means you only need to define your **business-specific fields** - Canon's base fields are already recognized.

## Validation Process

Validation happens **after redaction** and **before sampling**:

```
Finalize → Snapshot → Redact(copy) → Validate(redacted) → Sample → Emit
```

This ensures:
1. PII is never exposed in validation errors
2. Validation runs on the final event structure
3. Invalid events can be filtered before sampling

### Validation Errors

Validation errors are logged to stderr:

```
[canon] validation error (req_abc123): Missing required field: user.id
[canon] validation error (req_abc123): Field "cart.total_cents" has invalid type: expected number, got string
```

In `strict: true` mode, validation errors prevent emission. In non-strict mode, errors are logged but events still emit.

### Validation Warnings

Validation warnings are logged to stderr:

```
[canon] validation warning (req_abc123): Unknown top-level field: custom_field
[canon] validation warning (req_abc123): Field "user.email" has invalid type: expected string, got number
```

Warnings don't prevent emission, but indicate schema mismatches.

## Avoiding Unknown Field Warnings

If you see warnings with `unknownMode: 'warn'`, you have three options:

### Option 1: Set `unknownMode: 'allow'` (Recommended for v0)

```typescript
const schema = defineCanonSchema({
  fields: { /* your fields */ },
  unknownMode: 'allow', // No warnings
});
```

### Option 2: Define All Top-Level Fields

```typescript
const schema = defineCanonSchema({
  fields: {
    'user.id': { type: 'string' },
    'custom_field': { type: 'string' }, // Define it
  },
  unknownMode: 'warn',
});
```

### Option 3: Wait for Base Schema Merging

Base schema merging is planned for a future release, which will automatically merge Canon base fields into user schemas.

## Dot-Path Fields

Fields can use dot-notation for nested paths:

```typescript
fields: {
  'user.id': { type: 'string' },
  'user.email': { type: 'string' },
  'cart.item_count': { type: 'number' },
  'payment.provider': { type: 'string' },
}
```

This allows you to validate nested structures without defining full object schemas.

## Example Schema

```typescript
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
  },
  unknownMode: 'allow',
});
```

## Next Steps

- Learn about [redaction](./redaction.md) for PII protection
- Configure [tail sampling](./sampling.md) for cost control
- Read about [Express integration](./express-integration.md) for lifecycle details

