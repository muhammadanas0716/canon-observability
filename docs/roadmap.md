# Roadmap

Planned features and future directions for Canon.

## Planned Features (Not in v0)

### Base Schema Merging

Automatically merge Canon base fields into user schemas to avoid unknown field warnings.

**Status:** Planned

**Impact:** Users won't need to manually define Canon's base fields in their schemas. `unknownMode: 'warn'` will work seamlessly without warnings for Canon fields.

### Next.js Middleware Support

Native Next.js middleware integration for Next.js applications.

**Status:** Planned

**Impact:** Canon will work seamlessly with Next.js middleware, providing the same "one event per request" guarantee.

### Node.js HTTP Support

Support for native Node.js HTTP server (without Express).

**Status:** Planned

**Impact:** Canon will work with any Node.js HTTP server, not just Express.

### OpenTelemetry Hook

Enhanced OpenTelemetry integration with automatic span attributes.

**Status:** Planned

**Impact:** Canon events will automatically enrich OpenTelemetry spans with event data, providing better observability integration.

## Current Scope (v0)

**Canon v0 is intentionally limited and boring:**

- ✅ **Express only** - No Fastify, no Next.js middleware, no other frameworks
- ✅ **Node.js only** - No browser support, no edge runtimes
- ✅ **Explicit API** - No AsyncLocalStorage, no auto-magic, no hidden context
- ✅ **One event per request** - That's it. Simple and predictable.

**What v0 includes:**
- ✅ Express middleware integration (`canonExpress`, `canonExpressError`)
- ✅ Schema validation (`defineCanonSchema`)
- ✅ PII redaction (mask, hash, drop)
- ✅ Tail sampling (default rules + custom functions)
- ✅ Error capture and normalization
- ✅ Abort handling (499 status code)

**What v0 explicitly does NOT include:**
- ❌ Fastify support
- ❌ Next.js middleware
- ❌ AsyncLocalStorage / automatic context propagation
- ❌ Auto-magic features
- ❌ Base schema merging (planned for future release)

This keeps Canon focused, reliable, and easy to reason about. Boring is good.

## Version History

### v0.1.0 (Current)

- Express middleware (`canonExpress`, `canonExpressError`)
- Schema validation with `defineCanonSchema`
- PII redaction (mask, hash, drop)
- Tail sampling with default rules
- Error normalization
- Abort detection (499 status code)
- TypeScript support

## Contributing

Contributions welcome! Please open an issue or PR for:

- Bug fixes
- Documentation improvements
- Feature requests (check roadmap first)
- Examples and use cases

## Feedback

Have ideas for Canon? Open an issue or discussion on GitHub!

