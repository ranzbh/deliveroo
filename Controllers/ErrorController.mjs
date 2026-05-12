import fs from "node:fs"; // reads HTML files from disk
import path from "node:path"; // builds OS-safe file paths
import { fileURLToPath } from "node:url"; // converts import.meta.url to a file system path
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log

const __dirName = path.dirname(fileURLToPath(import.meta.url)); // resolves current directory (ESM equivalent of __dirname)

// maps each HTTP status code to its corresponding error view file
const errorPages = {
  400: "Error-BadRequestView.html",
  401: "Error-UnauthorizedView.html",
  403: "Error-UnauthorizedView.html", // authenticated but not allowed — reuses the 401 view (no separate 403 template)
  404: "Error-NotFoundView.html",
  500: "Error-Server.html",
};

// reads and sends the matching error HTML page — called by Router on 404 and by any controller on error
export const errorController = async (statusCode, req, res) => {
  const file = errorPages[statusCode] ?? "Error-Server.html"; // falls back to 500 page for unknown status codes

  // Log at appropriate level based on status code severity
  const logMessage = `HTTP ${statusCode} — ${req.method} ${req.url}`;
  if (statusCode >= 500) {
    logger.error(logMessage);
  } else if (statusCode === 401 || statusCode === 403) {
    logger.warn(logMessage);
  } else {
    logger.info(logMessage);
  }

  try {
    const html = await fs.promises.readFile(
      path.join(__dirName, `../Views/${file}`), // resolves absolute path to the view file
      "utf-8",
    );
    res.writeHead(statusCode, { "Content-Type": "text/html; charset=utf-8" }); // sets status code and HTML content type
    return res.end(html); // sends the HTML body and closes the response
  } catch (error) {
    logger.error(`Failed to read error view "${file}": ${error.message}`);
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }); // fallback header if view file is missing
    return res.end("Internal Server Error"); // guarantees the client always receives a response
  }
};