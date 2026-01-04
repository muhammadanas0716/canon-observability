/**
 * Express Middleware
 * 
 * Provides two middlewares for complete error capture:
 * - canonExpress(): Main middleware that attaches context and finalizes on finish/close
 * - canonExpressError(): Error middleware that captures errors via markError()
 * 
 * Usage:
 *   app.use(canonExpress(config));
 *   // ... routes ...
 *   app.use(canonExpressError()); // AFTER all routes
 */

import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';
import type { CanonConfig, CanonContext, RequestOutcome } from '../types.js';
import { DEFAULTS } from '../types.js';
import { createCanonContext, extractIds, createInitialEventData } from '../core/canon.js';

/**
 * Main Canon middleware for Express
 * 
 * Attaches req.canon context and handles finalization on response finish/close.
 * Listens to both 'finish' and 'close' events for complete coverage:
 * - 'finish': Normal response completion
 * - 'close': Client disconnect/abort (without finish)
 * 
 * @param config - Canon configuration
 * @returns Express middleware function
 */
export function canonExpress(config: CanonConfig): RequestHandler {
  const requestIdHeader = config.requestIdHeader ?? DEFAULTS.requestIdHeader;
  const traceIdHeader = config.traceIdHeader ?? DEFAULTS.traceIdHeader;
  const debug = config.debug ?? (process.env.NODE_ENV !== 'production');
  
  const defaultIgnorePaths = ['/favicon.ico', '/robots.txt', '/sw.js'];
  const ignorePaths = config.ignorePaths ?? (debug ? defaultIgnorePaths : undefined);
  
  const shouldIgnorePath = (path: string): boolean => {
    if (!ignorePaths) return false;
    
    if (typeof ignorePaths === 'function') {
      return ignorePaths(path);
    }
    
    return ignorePaths.some(pattern => {
      if (typeof pattern === 'string') {
        return path === pattern;
      }
      return pattern.test(path);
    });
  };
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const path = req.path || req.url;
    
    if (shouldIgnorePath(path)) {
      return next();
    }
    
    const { requestId, traceId } = extractIds(
      req.headers as Record<string, string | string[] | undefined>,
      config
    );
    
    res.setHeader(requestIdHeader, requestId);
    res.setHeader(traceIdHeader, traceId);
    
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'];
    
    const initialData = createInitialEventData(
      req.method,
      path,
      ip,
      userAgent,
      undefined
    );
    
    const { context, emit } = createCanonContext(
      config,
      requestId,
      traceId,
      initialData,
      debug
    );
    
    req.canon = context as CanonContext;
    
    let finalized = false;
    
    const finalizeOnce = (outcome: RequestOutcome, overrideStatusCode?: number): void => {
      if (finalized) return;
      finalized = true;
      
      if (req.route?.path && !context.get().route) {
        context.set('route', req.route.path);
      }
      
      const statusCode = overrideStatusCode ?? (res.statusCode || 200);
      emit(outcome, statusCode);
    };
    
    res.on('finish', () => {
      const hasError = context.get().error !== undefined;
      const outcome: RequestOutcome = hasError ? 'error' : 'success';
      finalizeOnce(outcome);
    });
    
    res.on('close', () => {
      if (finalized) return;
      if (res.writableEnded) return;
      
      finalizeOnce('aborted', 499);
    });
    
    next();
  };
}

/**
 * Canon error middleware for Express
 * 
 * Captures errors via req.canon.markError() and passes them through.
 * MUST be registered AFTER all routes to capture route errors.
 * 
 * @returns Express error middleware function
 */
export function canonExpressError(): ErrorRequestHandler {
  return (err: unknown, req: Request, _res: Response, next: NextFunction): void => {
    if (req.canon) {
      req.canon.markError(err);
    }
    
    next(err);
  };
}

/**
 * Extract and normalize client IP from request
 * - Prefers socket.remoteAddress for direct connections
 * - Falls back to proxy headers (x-forwarded-for, x-real-ip)
 * - Normalizes IPv6-mapped IPv4 addresses (strips ::ffff: prefix)
 */
function getClientIp(req: Request): string | undefined {
  let ip: string | undefined;
  
  ip = req.socket?.remoteAddress;
  
  if (!ip) {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
      const ips = Array.isArray(xForwardedFor) 
        ? xForwardedFor[0] 
        : xForwardedFor.split(',')[0];
      ip = ips?.trim();
    }
  }
  
  if (!ip) {
    const xRealIp = req.headers['x-real-ip'];
    if (xRealIp) {
      ip = Array.isArray(xRealIp) ? xRealIp[0] : xRealIp;
    }
  }
  
  return normalizeIp(ip);
}

/**
 * Normalize IP address
 * - Strips ::ffff: prefix from IPv6-mapped IPv4 addresses
 * - Preserves ::1 and other valid IPv6 addresses unchanged
 * - Returns undefined for empty/invalid values
 */
function normalizeIp(ip: string | undefined): string | undefined {
  if (!ip || ip.length === 0) {
    return undefined;
  }
  
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  
  return ip;
}

export type { CanonConfig, CanonContext };

