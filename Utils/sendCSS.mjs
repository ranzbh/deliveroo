// sendCSS.mjs
// Reads a CSS file from Views/Styles/ and sends it as a 200 text/css response.
//
// Usage:
//   await sendCSS(res, "index.css");
//   await sendCSS(res, "dashboard.css");
//
// Errors:
//   File-read failures are propagated to the caller.  Every controller that
//   calls sendCSS wraps it in a try/catch and sends a 500 error page.

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./Logger.mjs";

const __dirName = path.dirname(fileURLToPath(import.meta.url));

// reads a CSS file from Views/Styles/ and sends it as a 200 response
export const sendCSS = async (res, filename) => {
  const filePath = path.join(__dirName, `../Views/Styles/${filename}`);

  // Stat the file first so we can set a Last-Modified header, which lets the
  // browser skip re-downloading a stylesheet it already has cached.
  // If stat fails for any reason we still serve the file — the header is
  // informational, not essential.
  let lastModified;
  try {
    const stat = await fs.promises.stat(filePath);
    lastModified = stat.mtime.toUTCString();
  } catch {
    // Non-fatal — proceed without the Last-Modified header
  }

  // Let file-read errors propagate — the calling controller's catch block will
  // handle them and send a 500 error page.
  const css = await fs.promises.readFile(filePath, "utf-8");
  logger.debug(`sendCSS: serving "${filename}"`);

  const headers = {
    "Content-Type":  "text/css; charset=utf-8",
    // Cache CSS for 1 hour in the browser and shared caches.
    // Stylesheets rarely change mid-session; caching them reduces page-load
    // round-trips without risking stale HTML.
    "Cache-Control": "public, max-age=3600",
  };

  if (lastModified) {
    headers["Last-Modified"] = lastModified;
  }

  res.writeHead(200, headers);
  res.end(css); // sends the full CSS body and closes the response
};