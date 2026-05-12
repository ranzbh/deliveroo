// index.mjs
// Entry point — bootstraps the entire application.
//
// Startup order:
//   1. dotenv loads .env into process.env
//   2. DatabaseManager validates all required environment variables (fails fast with a clear error)
//   3. Database.getInstance() creates the MySQL pool and runs CREATE TABLE IF NOT EXISTS for every table
//   4. Expired sessions are cleaned up from the previous run
//   5. http.createServer() binds the appRouter dispatch function
//   6. server.listen() starts accepting connections
//
// Shutdown order (SIGTERM / SIGINT):
//   1. server.close() stops accepting new connections
//   2. Database.close() drains the connection pool
//   3. logger.close() flushes the log file stream
//   4. process.exit(0)

import "dotenv/config"; // loads .env into process.env — must be the very first import
import http from "node:http"; // built-in Node.js HTTP server — no framework needed
import { appRouter } from "./Controllers/AppRouter.mjs"; // dispatch function — all incoming requests route through here
import Database from "./Database/Database.mjs"; // singleton pool — getInstance() also runs the schema
import DatabaseManager from "./Database/DatabaseManager.mjs"; // validates all required env vars at startup
import { logger } from "./Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log

// ─── 1. Validate environment variables ───────────────────────────────────────
// DatabaseManager.getInstance() reads and validates every required env variable.
// If any are missing or malformed it throws immediately with a descriptive error,
// e.g. "Missing required config: DB_HOST" — far clearer than a mysql2 crash later.
let config;
try {
  config = DatabaseManager.getInstance();
  logger.info("Config: all environment variables validated");
  logger.info(`Config: ${JSON.stringify(config.getSafeConfig())}`); // logs settings without the password
} catch (err) {
  // If config fails the server must not start — log to stderr and exit immediately
  process.stderr.write(`[FATAL] Config validation failed: ${err.message}\n`);
  process.exit(1);
}

const PORT = config.port; // read from validated config — not directly from process.env

// ─── 2. Initialise the database ───────────────────────────────────────────────
// getInstance() creates the pool and runs the full schema (CREATE TABLE IF NOT EXISTS).
// The #ready promise ensures no query fires before the schema is up.
const db = Database.getInstance();
logger.info("Database: singleton initialised");

// ─── 3. Clean up expired sessions from previous runs ─────────────────────────
// The Session table stores opaque tokens with a Max-Age of 3600 seconds (1 hour).
// The cookie expires in the browser automatically, but the row stays in MySQL forever
// unless we clean it up. This purge runs once at startup, then on every new login.
// TOKEN_MAX_AGE is 3600 seconds — match exactly what is set in Utils/constants.mjs.
try {
  await db.query(
    `DELETE FROM Session WHERE createdAt < NOW() - INTERVAL ? SECOND`,
    [3600],
  );
  logger.info("Database: expired sessions purged");
} catch (err) {
  // Non-fatal — a failure here does not prevent the server from starting
  logger.warn(`Database: session cleanup failed — ${err.message}`);
}

// ─── 4. Create the HTTP server ────────────────────────────────────────────────
// http.createServer() is SYNCHRONOUS — it does NOT return a Promise.
// The original code had `await http.createServer(appRouter)` — the await is a no-op
// but misleading. Removed here for clarity.
const server = http.createServer(appRouter);

// ─── 5. Start listening ───────────────────────────────────────────────────────
server.listen(PORT, () => {
  logger.info(`Server: listening on http://localhost:${PORT}`);
});

// ─── 6. Graceful shutdown ─────────────────────────────────────────────────────
// On SIGTERM (Docker / Kubernetes stop) or SIGINT (Ctrl+C in development),
// we stop accepting new connections, drain the DB pool, and close the log stream
// before exiting. This prevents dropped in-flight requests and lost log lines.

const gracefulShutdown = async (signal) => {
  logger.warn(`Server: received ${signal} — shutting down gracefully`);

  // Stop accepting new HTTP connections.
  // Existing connections are allowed to complete before the callback fires.
  server.close(async () => {
    try {
      await db.close(); // drain the MySQL connection pool
      logger.info("Server: database connection pool closed");
    } catch (err) {
      logger.error(`Server: error closing DB pool — ${err.message}`);
    } finally {
      logger.info("Server: shutdown complete");
      logger.close(); // flush the log file write stream before exit
      process.exit(0);
    }
  });

  // Force exit after 10 seconds if something hangs during shutdown
  setTimeout(() => {
    logger.error("Server: forced exit after 10s shutdown timeout");
    process.exit(1);
  }, 10_000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM")); // Docker / Kubernetes stop signal
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));  // Ctrl+C in the terminal

// ─── 7. Catch unhandled promise rejections ────────────────────────────────────
// Any async code that throws without a try/catch reaches this handler.
// Log and exit — an unhandled rejection puts the server in an unknown state.
process.on("unhandledRejection", (reason) => {
  logger.error(`Server: unhandled rejection — ${reason}`);
  gracefulShutdown("unhandledRejection");
});

process.on("uncaughtException", (err) => {
  logger.error(`Server: uncaught exception — ${err.message}`);
  gracefulShutdown("uncaughtException");
});