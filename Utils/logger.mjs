// Logger.mjs
// Structured logger with level filtering, timestamps, console output, and
// file output.  A single shared instance is exported so every module writes
// to the same log file during a server run.
//
// Usage:
//   import { logger } from "../Utils/Logger.mjs";
//   logger.info("Server started on port 3000");
//   logger.error("DB connection failed: " + err.message);
//
// Configuration (via .env / process.env):
//   LOG_LEVEL=DEBUG   → all messages written
//   LOG_LEVEL=INFO    → INFO, WARN, ERROR written  (default)
//   LOG_LEVEL=WARN    → WARN and ERROR written
//   LOG_LEVEL=ERROR   → only ERROR written

import fs   from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirName = path.dirname(fileURLToPath(import.meta.url));

// Log levels in ascending severity order.
// Only messages whose level is >= the configured threshold are written.
const LEVELS = Object.freeze({ DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 });

// Ensure the Logs/ directory exists before opening the write stream.
// Using mkdirSync here (synchronously, at module load time) keeps the
// constructor simple and guarantees the directory is ready before the
// first log line is written.
const logsDir = path.join(__dirName, "../Logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export default class Logger {
  // ── Private fields ────────────────────────────────────────────────────────
  #level;   // minimum severity level — messages below this are discarded
  #logFile; // writable stream — every log line is appended to Logs/app.log

  constructor() {
    // Read the configured level from the environment; fall back to "INFO".
    // toUpperCase() makes the comparison case-insensitive in the env file.
    const envLevel = (process.env.LOG_LEVEL ?? "INFO").toUpperCase();
    this.#level = LEVELS[envLevel] !== undefined ? envLevel : "INFO";

    // Open (or create) the log file in append mode so every server restart
    // adds to the existing file rather than wiping previous runs.
    this.#logFile = fs.createWriteStream(
      path.join(logsDir, "app.log"),
      { flags: "a" }, // "a" = append — never truncates the file
    );

    // Log a separator line so it's easy to tell restarts apart in the file.
    this.#write("INFO", "─── Logger initialised ───────────────────────────────────────");
  }

  // ── Private write method ──────────────────────────────────────────────────

  #write(level, message) {
    // 1. Level filter — discard anything below the configured threshold.
    if (LEVELS[level] < LEVELS[this.#level]) return;

    // 2. Build the formatted log line.
    //    Format:  [2026-05-04T12:00:00.000Z] [INFO]  Message text here
    const timestamp = new Date().toISOString();
    const paddedLevel = level.padEnd(5); // align columns: DEBUG=5, INFO=5, WARN=4+1, ERROR=5
    const line = `[${timestamp}] [${paddedLevel}] ${message}\n`;

    // 3. Write to console (process.stderr for WARN/ERROR, stdout for the rest).
    if (LEVELS[level] >= LEVELS["WARN"]) {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }

    // 4. Append to the log file — fire-and-forget (stream handles back-pressure).
    this.#logFile.write(line);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  debug(message) { this.#write("DEBUG", message); }
  info(message)  { this.#write("INFO",  message); }
  warn(message)  { this.#write("WARN",  message); }
  error(message) { this.#write("ERROR", message); }

  // Gracefully closes the file stream — call this when the process exits so
  // the OS flushes any buffered bytes before the stream handle is released.
  close() {
    this.#logFile.end();
  }
}

// Export a single shared instance so every file in the application writes to
// the same log file handle during one server run.
export const logger = new Logger();