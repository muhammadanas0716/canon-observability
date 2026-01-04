/**
 * Console Emitter Utilities
 * 
 * Helper functions for emitting Canon events to console/stdout
 */

import type { EmitFunction, WideEvent } from '../types.js';

/**
 * Create a console emitter function
 * 
 * @param opts - Options for the emitter
 * @param opts.pretty - If true, uses JSON.stringify with indentation (default: false)
 * @returns Emit function that writes to stdout
 */
export function createConsoleEmitter(opts?: { pretty?: boolean }): EmitFunction {
  const pretty = opts?.pretty ?? false;
  
  return (event: WideEvent): void => {
    const json = pretty 
      ? JSON.stringify(event, null, 2)
      : JSON.stringify(event);
    process.stdout.write(json + '\n');
  };
}

