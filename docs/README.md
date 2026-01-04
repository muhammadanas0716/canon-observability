# Canon Documentation

Welcome to the Canon documentation. Canon is an opinionated observability library that guarantees exactly **one structured wide event per HTTP request** in Express.

## Quick Overview

Canon enforces a simple rule: **one request = one canonical wide event**. Instead of scattered log lines, Canon builds a single structured JSON event that captures all request context, business metrics, and outcomes. The event is enriched incrementally via `req.canon` and emitted once when the request completes or is aborted.

## Documentation Index

### Getting Started

- **[Quickstart: Express](./quickstart-express.md)** - Get up and running with Canon in Express in 5 minutes

### Core Concepts

- **[Wide Events](./concepts-wide-events.md)** - Understanding the "one event per request" model and why it matters
- **[Schema Validation](./schema.md)** - Define and validate your event structure
- **[Redaction](./redaction.md)** - Protect PII with mask, hash, or drop strategies
- **[Tail Sampling](./sampling.md)** - Make intelligent sampling decisions after request completion

### Integration

- **[Express Integration](./express-integration.md)** - Complete guide to Express middleware, error handling, and lifecycle

### Reference

- **[Troubleshooting](./troubleshooting.md)** - Common issues and solutions
- **[Roadmap](./roadmap.md)** - Planned features and future directions

## Key Features

- ✅ **Exactly one event per request** - Guaranteed via emit-once guard
- ✅ **Incremental enrichment** - Build events throughout request lifecycle
- ✅ **Schema validation** - Enforce structure and catch issues early
- ✅ **PII redaction** - Protect sensitive data before emission
- ✅ **Tail sampling** - Sample intelligently based on outcome and context
- ✅ **Abort handling** - Capture client disconnects with `outcome: 'aborted'`

## Example Event

```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "request_id": "req_abc123",
  "trace_id": "trace_xyz789",
  "service": "checkout-service",
  "method": "POST",
  "path": "/checkout",
  "status_code": 200,
  "duration_ms": 150,
  "outcome": "success",
  "user": {
    "id": "u_123",
    "email": "j***@e***.com"
  },
  "cart": {
    "item_count": 3,
    "total_cents": 9999
  }
}
```

## Installation

```bash
pnpm add canon
```

## Next Steps

Start with the [Express Quickstart](./quickstart-express.md) to get Canon running in your application.

