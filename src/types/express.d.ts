/**
 * Express type augmentation for Canon
 * Adds req.canon property to Express Request objects
 */

import type { CanonContext } from '../types.js';

declare global {
  namespace Express {
    interface Request {
      canon: CanonContext;
    }
  }
}

export {};

