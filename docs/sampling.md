# Tail Sampling

Make intelligent sampling decisions after request completion with full context.

## Overview

Canon uses **tail sampling** - sampling decisions are made **after** the request completes, using the finalized event. This allows you to sample based on:
- Request outcome (success, error, aborted)
- Status code
- Duration
- Business context (user subscription, feature flags, etc.)

## Default Sampling Behavior

Without custom configuration, Canon always samples:

- Status codes >= 500 (server errors)
- Status codes 429, 408 (rate limit, timeout)
- `outcome === 'aborted'` (client disconnects)
- `outcome === 'error'` (any error)
- `duration_ms > 2000` (slow requests)

And rate samples:

- 5% of successful requests (`sampleRateSuccess: 0.05`)

## Basic Configuration

### Rate-Based Sampling

```typescript
app.use(canonExpress({
  service: 'my-service',
  sample: {
    sampleRateSuccess: 0.05,  // 5% of successful requests
    slowThresholdMs: 2000,     // Always sample slow requests (>2s)
  },
}));
```

### Custom Sampling Function

```typescript
app.use(canonExpress({
  service: 'my-service',
  sample: (event) => {
    // Always sample errors
    if (event.status_code >= 500) return true;
    if (event.outcome === 'aborted') return true;
    
    // Always sample slow requests
    if (event.duration_ms > 2000) return true;
    
    // Always sample enterprise users
    if (event.user?.subscription === 'enterprise') return true;
    
    // Sample feature flag experiments
    if (event.feature_flags?.new_checkout_flow === true) return true;
    
    // 5% of the rest
    return Math.random() < 0.05;
  },
}));
```

## Sampling Configuration

### SamplingConfig

```typescript
interface SamplingConfig {
  sampleRateSuccess?: number;    // Default: 0.05 (5%)
  slowThresholdMs?: number;      // Default: 2000ms
  custom?: (event: WideEvent) => boolean;   // Custom sampling function
}
```

### Function-Based Sampling

You can also pass a function directly:

```typescript
sample: (event: WideEvent) => boolean
```

## Sampling Process

Sampling happens **after redaction** and **before emission**:

```
Finalize → Snapshot → Redact(copy) → Validate(redacted) → Sample → Emit
```

This ensures:
1. Sampling decisions use clean, redacted events
2. Invalid events can be filtered before sampling
3. Sampling has full context (outcome, duration, business data)

## Common Patterns

### Always Sample Errors and Slow Requests

```typescript
sample: {
  sampleRateSuccess: 0.01,  // 1% base rate
  slowThresholdMs: 1000,     // Lower threshold
}
```

### Sample by User Tier

```typescript
sample: (event) => {
  if (event.status_code >= 500) return true;
  if (event.outcome === 'aborted') return true;
  
  // Always sample enterprise users
  if (event.user?.subscription === 'enterprise') return true;
  
  // 10% of premium users
  if (event.user?.subscription === 'premium') {
    return Math.random() < 0.10;
  }
  
  // 1% of free users
  return Math.random() < 0.01;
}
```

### Sample by Feature Flags

```typescript
sample: (event) => {
  if (event.status_code >= 500) return true;
  
  // Always sample A/B test variants
  if (event.feature_flags?.new_checkout_flow === true) return true;
  
  // 5% of control group
  return Math.random() < 0.05;
}
```

### Sample by Request Path

```typescript
sample: (event) => {
  if (event.status_code >= 500) return true;
  
  // Always sample checkout flow
  if (event.path === '/checkout') return true;
  
  // 1% of other paths
  return Math.random() < 0.01;
}
```

## Cost Control

For high-traffic services, adjust sampling rates:

```typescript
sample: {
  sampleRateSuccess: 0.01,  // 1% instead of 5%
  slowThresholdMs: 1000,     // Lower threshold
}
```

Always-sample conditions (errors, aborts, slow requests) ensure you don't miss important events.

## Sampling Guarantees

Canon guarantees that these events are **always sampled** (unless you override with a custom function):

- Status codes >= 500
- Status codes 429, 408
- `outcome === 'aborted'`
- `outcome === 'error'`
- `duration_ms > slowThresholdMs`

This ensures critical events are never dropped.

## Example: E-commerce Checkout

```typescript
app.use(canonExpress({
  service: 'checkout-service',
  sample: (event) => {
    // Always sample errors
    if (event.status_code >= 500) return true;
    if (event.error) return true;
    
    // Always sample slow requests
    if (event.duration_ms > 2000) return true;
    
    // Always sample enterprise users
    if (event.user?.subscription === 'enterprise') return true;
    
    // Always sample new checkout flow experiments
    if (event.feature_flags?.new_checkout_flow === true) return true;
    
    // 5% of successful standard checkouts
    return Math.random() < 0.05;
  },
}));
```

## Best Practices

### 1. Always Sample Errors

Never filter out errors - they're critical for debugging:

```typescript
if (event.status_code >= 500) return true;
if (event.outcome === 'error') return true;
```

### 2. Sample Slow Requests

Slow requests indicate performance issues:

```typescript
if (event.duration_ms > 2000) return true;
```

### 3. Sample Aborted Requests

Client disconnects can indicate problems:

```typescript
if (event.outcome === 'aborted') return true;
```

### 4. Adjust Rates by Traffic

Start with 5% and adjust based on volume:

```typescript
sampleRateSuccess: 0.05  // Start here
sampleRateSuccess: 0.01  // High traffic
sampleRateSuccess: 0.10  // Low traffic
```

### 5. Use Business Context

Sample based on business value:

```typescript
if (event.user?.subscription === 'enterprise') return true;
if (event.cart?.total_cents > 10000) return true;
```

## Next Steps

- Learn about [redaction](./redaction.md) for PII protection
- Read about [Express integration](./express-integration.md) for lifecycle details
- Check [troubleshooting](./troubleshooting.md) for common issues

