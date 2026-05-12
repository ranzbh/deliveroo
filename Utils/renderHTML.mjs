// renderHTML.mjs
// Reads an HTML template from Views/, replaces every {{key}} placeholder with
// its corresponding value from the data object, and sends the result as a
// 200 text/html response.
//
// Usage:
//   await renderHTML(res, "User-HomeView.html", {
//     userEmail: "alice@example.com",
//     restaurantList: "<li>...</li>",
//   });
//
// Template syntax:  {{key}}
//   Every occurrence of {{key}} in the file is replaced with data[key].
//   Unused placeholders (keys present in the template but not in data) are
//   replaced with an empty string so the page never displays raw {{…}} tokens.
//
// Security note:
//   Values injected here are rendered as raw HTML.  Never inject untrusted
//   user input (e.g. free-text fields) without first sanitising it.
//   The sanitizeValue() helper below escapes the five dangerous HTML characters
//   so controller-supplied strings cannot break out of an attribute or element.

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "./Logger.mjs";

const __dirName = path.dirname(fileURLToPath(import.meta.url));

// ─── HTML escaping ────────────────────────────────────────────────────────────
// Escapes the five characters that are dangerous inside HTML text and attribute
// values.  Applied to every string value before injection so a value like
// `<script>alert(1)</script>` becomes visible text rather than executable code.
//
// Values that are explicitly marked as trusted HTML (e.g. pre-built list HTML
// generated entirely server-side) should be passed through a wrapper object:
//   { raw: "<li>safe server-built html</li>" }
// Any other value (string, number, boolean) is always escaped.

const HTML_ESCAPE_MAP = {
  "&":  "&amp;",
  "<":  "&lt;",
  ">":  "&gt;",
  '"':  "&quot;",
  "'":  "&#39;",
};

const escapeHTML = (str) =>
  String(str).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);

// Decides whether a value needs escaping.
// - Objects with a { raw: "..." } shape are trusted server-built HTML — passed through verbatim.
// - Everything else is escaped.
const sanitizeValue = (value) => {
  if (value !== null && typeof value === "object" && "raw" in value) {
    return value.raw; // caller explicitly opted out of escaping
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return escapeHTML(value);
  }
  return ""; // null / undefined / unexpected types → render nothing
};

// ─── Main export ──────────────────────────────────────────────────────────────

// Reads an HTML template, replaces every {{key}} with the matching value from
// data, and sends the result as a 200 text/html response.
//
// Any {{key}} present in the template but absent from data is replaced with ""
// so the page never ships raw placeholder tokens to the browser.
export const renderHTML = async (res, filename, data = {}) => {
  const filePath = path.join(__dirName, `../Views/${filename}`);

  // Let file-read errors propagate — the calling controller wraps renderHTML in
  // a try/catch and will send a 500 error page if this throws.
  let html = await fs.promises.readFile(filePath, "utf-8");
  logger.debug(`renderHTML: loaded template "${filename}"`);

  // Replace each {{key}} with its sanitised value.
  for (const [key, value] of Object.entries(data)) {
    html = html.replaceAll(`{{${key}}}`, sanitizeValue(value));
  }

  // Clean up any remaining placeholders that had no matching data key.
  // This prevents {{unreplacedKey}} tokens appearing visibly in the page.
  html = html.replace(/\{\{[^}]+\}\}/g, "");

  res.writeHead(200, {
    "Content-Type":  "text/html; charset=utf-8",
    // Prevent the browser from caching dynamic pages — each render should be fresh.
    "Cache-Control": "no-store",
  });
  res.end(html);
  logger.debug(`renderHTML: response sent for "${filename}"`);
};

// ─── Convenience wrapper ──────────────────────────────────────────────────────
// Lets a caller opt a specific value out of HTML escaping when it is known to
// be safe server-built markup (e.g. a list of <li> elements assembled in a
// controller from DB data, not from raw user input).
//
// Usage:
//   await renderHTML(res, "View.html", {
//     restaurantList: trustedHTML("<li>Burger Palace</li>"),
//   });
export const trustedHTML = (rawString) => ({ raw: rawString });