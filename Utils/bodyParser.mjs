// bodyParser.mjs
// Reads the raw POST body from the incoming request stream and returns a
// plain key-value object decoded from application/x-www-form-urlencoded data.
//
// Usage:
//   const { email, password } = await parseBody(req);
//
// Guards:
//   • Rejects if the stream emits an error (network drop, etc.)
//   • Rejects if the body exceeds MAX_BODY_BYTES (prevents memory exhaustion)
//   • Works with any content-type — the controllers always send URL-encoded forms

import { logger } from "./Logger.mjs";

// Maximum body size accepted in bytes (1 MB).
// Adjust upward only if the app ever needs to accept large payloads.
const MAX_BODY_BYTES = 1 * 1024 * 1024; // 1 MB

// reads the raw POST body from the request stream and returns it as a plain object
export const parseBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = "";        // accumulates incoming data chunks
    let bytesReceived = 0;

    req.on("data", (chunk) => {
      bytesReceived += chunk.length;

      // Guard against bodies that are too large — reject before accumulating
      // further to avoid holding a huge string in memory.
      if (bytesReceived > MAX_BODY_BYTES) {
        logger.warn(`parseBody: request body exceeded ${MAX_BODY_BYTES} bytes — rejecting`);
        req.destroy(); // stop the stream immediately
        return reject(new Error(`Request body too large (limit: ${MAX_BODY_BYTES} bytes)`));
      }

      raw += chunk; // safe to accumulate — still within the size limit
    });

    req.on("end", () => {
      try {
        // URLSearchParams handles percent-encoding and duplicate keys correctly.
        // Object.fromEntries() collapses duplicate keys to the last value —
        // this matches standard HTML form behaviour.
        const parsed = Object.fromEntries(new URLSearchParams(raw));
        logger.debug(`parseBody: parsed ${Object.keys(parsed).length} field(s) from body`);
        resolve(parsed);
      } catch (err) {
        logger.error(`parseBody: failed to parse body — ${err.message}`);
        reject(err);
      }
    });

    // Propagate stream errors (connection reset, timeout, etc.) so the
    // calling controller's catch block can surface a 500 rather than hanging.
    req.on("error", (err) => {
      logger.error(`parseBody: stream error — ${err.message}`);
      reject(err);
    });
  });