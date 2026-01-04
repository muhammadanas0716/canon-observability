# Redaction

Protect PII (Personally Identifiable Information) with Canon's redaction system.

## Overview

Canon redacts sensitive fields **before emission** using three strategies:
- **mask** - Partially obscure values (e.g., `j***@e***.com`)
- **hash** - SHA-256 hash for deterministic correlation
- **drop** - Replace with `[REDACTED]`

Redaction happens on a **copy** of the event - the original context in handlers remains unredacted.

## Basic Configuration

Enable redaction in your Canon config:

```typescript
app.use(canonExpress({
  service: 'my-service',
  redact: {
    enabled: true,
    strategy: 'mask',
    fields: ['user.email', 'headers.authorization'],
  },
}));
```

## Redaction Strategies

### Mask

Partially obscures values while keeping some characters visible:

| Input | Output |
|-------|--------|
| `john@example.com` | `j***@e***.com` |
| `+1-555-123-4567` | `+***-***-***-4567` |
| `secret123` | `s*******3` |

**Use case:** Debugging and partial identification while protecting PII.

### Hash

SHA-256 hash for deterministic correlation:

| Input | Output |
|-------|--------|
| `john@example.com` | `a1b2c3d4e5f6...` (64-char hex) |
| `secret123` | `9f86d081884c7d659a2feaa0c55ad015...` |

**Use case:** Correlation across events while protecting PII. Same input always produces same hash.

### Drop

Replace with `[REDACTED]`:

| Input | Output |
|-------|--------|
| `john@example.com` | `[REDACTED]` |
| `secret123` | `[REDACTED]` |

**Use case:** Complete removal of sensitive data.

## Schema-Level Redaction

Schema-level redaction strategies **override** the global config strategy. This allows per-field control:

```typescript
const schema = defineCanonSchema({
  fields: {
    'user.email': { type: 'string', pii: true, redaction: 'hash' },
    'user.phone': { type: 'string', pii: true },
  },
});

app.use(canonExpress({
  schema,
  redact: {
    enabled: true,
    strategy: 'mask', // default for fields without schema redaction
    fields: ['user.email', 'user.phone'],
  },
}));

// Result: user.email is hashed, user.phone is masked
```

## Default Redacted Fields

If `fields` is empty, Canon redacts these by default:

- `user.email`
- `user.phone`
- `headers.authorization`
- `headers.cookie`
- `headers.x-api-key`

To use defaults, set `fields: []`:

```typescript
redact: {
  enabled: true,
  strategy: 'mask',
  fields: [], // Use defaults
}
```

## Redaction Process

Redaction happens **after snapshot** and **before validation**:

```
Finalize → Snapshot → Redact(copy) → Validate(redacted) → Sample → Emit
```

This ensures:
1. Original context remains unredacted in handlers
2. Validation runs on redacted events (PII never exposed in errors)
3. Sampling decisions use redacted events

## IP Address Handling

Canon extracts and normalizes client IP addresses:
- IPv6-mapped IPv4 addresses have `::ffff:` prefix stripped
- Localhost shows as `::1` (IPv6) or `127.0.0.1` (IPv4)

**Note:** Masking IP addresses doesn't produce useful results. Use `hash` or `drop` strategy for IP redaction, or omit IP from redaction fields.

## Example: E-commerce Checkout

```typescript
const schema = defineCanonSchema({
  fields: {
    'user.email': { type: 'string', pii: true, redaction: 'hash' },
    'user.phone': { type: 'string', pii: true },
    'payment.card_last4': { type: 'string', pii: true },
  },
});

app.use(canonExpress({
  schema,
  redact: {
    enabled: true,
    strategy: 'mask',
    fields: ['user.email', 'user.phone', 'payment.card_last4', 'headers.authorization'],
  },
}));
```

**Result:**
- `user.email` → hashed (for correlation)
- `user.phone` → masked (default strategy)
- `payment.card_last4` → masked (default strategy)
- `headers.authorization` → masked (default strategy)

## Redaction Configuration

```typescript
interface RedactionConfig {
  enabled: boolean;               // Default: false
  strategy: 'mask' | 'hash' | 'drop';  // Default: 'mask'
  fields: string[];               // Dot-path fields to redact
}
```

## Best Practices

### 1. Use Hash for Correlation

If you need to correlate events by user email, use `hash`:

```typescript
'user.email': { type: 'string', pii: true, redaction: 'hash' }
```

### 2. Use Mask for Debugging

If you need partial visibility for debugging, use `mask`:

```typescript
'user.phone': { type: 'string', pii: true, redaction: 'mask' }
```

### 3. Use Drop for Complete Removal

If you don't need the data at all, use `drop`:

```typescript
'headers.authorization': { type: 'string', pii: true, redaction: 'drop' }
```

### 4. Mark PII in Schema

Use `pii: true` in field definitions for documentation:

```typescript
fields: {
  'user.email': { type: 'string', pii: true },
}
```

**Note:** `pii: true` is metadata only. To actually redact, add the field to `redact.fields`.

### 5. Explicit Field Lists

Always explicitly list fields to redact:

```typescript
redact: {
  enabled: true,
  strategy: 'mask',
  fields: ['user.email', 'user.phone'], // Explicit list
}
```

## Next Steps

- Learn about [tail sampling](./sampling.md) for cost control
- Read about [Express integration](./express-integration.md) for lifecycle details
- Check [troubleshooting](./troubleshooting.md) for common issues

