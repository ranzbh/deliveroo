// sendHTML.mjs
// Reads a static HTML file from Views/ and sends it as a 200 text/html response.
//
// Use this for pages that need NO data injection (login form, register form,
// error page shells, etc.).  For pages with dynamic content use renderHTML.mjs.
//
// Usage:
//   await sendHTML(res, "Auth-LoginView.html");
//
// Errors:
//   File-read failures are propagated to the caller.  Every controller that
//   calls sendHTML wraps it in a try/catch and sends a 500 error page.

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./Logger.mjs";

const __dirName = path.dirname(fileURLToPath(import.meta.url));

// reads a static HTML file from Views/ and sends it as a 200 response
export const sendHTML = async (res, filename) => {
  const filePath = path.join(__dirName, `../Views/${filename}`);

  // Let file-read errors propagate — the calling controller's catch block will
  // handle them and send an appropriate error page.
  const html = await fs.promises.readFile(filePath, "utf-8");
  logger.debug(`sendHTML: serving "${filename}"`);

  res.writeHead(200, {
    "Content-Type":  "text/html; charset=utf-8",
    // Static auth pages can be cached briefly by the browser — 5 minutes is
    // enough to avoid redundant disk reads without serving stale markup.
    "Cache-Control": "public, max-age=300",
  });
  res.end(html); // sends the full HTML body and closes the response
};