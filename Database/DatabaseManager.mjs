// DatabaseManager.mjs
// Singleton configuration class — reads every environment variable the app
// needs at startup, validates that required ones are present and well-formed,
// and exposes them as named, typed properties.
//
// This replaces scattered process.env.* reads across Database.mjs and index.mjs
// with a single, validated source of truth.
//
// Usage:
//   import DatabaseManager from "../Database/DatabaseManager.mjs";
//   const config = DatabaseManager.getInstance();
//   console.log(config.dbHost, config.port);
//
// On missing required variables the constructor throws a descriptive error:
//   "Missing required config: DB_HOST"
// so the server refuses to start rather than crashing later with a cryptic
// mysql2 or network error.

import "dotenv/config"; // loads .env into process.env before any variable is read

export default class DatabaseManager {
  static #instance = null; // the one shared instance — null until first call

  // ─── Static factory ────────────────────────────────────────────────────────

  static getInstance() {
    if (!DatabaseManager.#instance) {
      DatabaseManager.#instance = new DatabaseManager();
    }
    return DatabaseManager.#instance;
  }

  // ─── Constructor ───────────────────────────────────────────────────────────

  constructor() {
    // ── Required variables ────────────────────────────────────────────────────
    // These must be present and valid; the server cannot start without them.

    this.port        = Number(process.env.PORT);         // HTTP server port
    this.dbHost      = process.env.DB_HOST;              // MySQL server hostname or IP
    this.dbPort      = Number(process.env.DB_PORT);      // MySQL server port (usually 3306)
    this.dbUser      = process.env.DB_USER;              // MySQL username
    this.dbPassword  = process.env.DB_PASSWORD;          // MySQL password
    this.dbName      = process.env.DB_NAME;              // MySQL schema/database name

    // ── Optional variables ────────────────────────────────────────────────────
    // These have sensible defaults and will not cause a startup failure if
    // they are absent from the .env file.

    this.dbConnLimit  = Number(process.env.DB_CONNECTION_LIMIT ?? "10"); // max simultaneous connections in the pool
    this.dbQueueLimit = Number(process.env.DB_QUEUE_LIMIT       ?? "0"); // max queued connection requests (0 = unlimited)
    this.logLevel     = process.env.LOG_LEVEL                   ?? "INFO"; // minimum log level (DEBUG/INFO/WARN/ERROR)
    this.jwtSecret    = process.env.JWT_SECRET                  ?? null;  // legacy — kept for reference; app uses opaque tokens
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN              ?? "1h";  // legacy — informational only

    // ── Validation ────────────────────────────────────────────────────────────
    this.#validate();
  }

  // ─── Private validator ─────────────────────────────────────────────────────

  #validate() {
    // Required string fields — must be non-empty strings
    const requiredStrings = {
      DB_HOST:     this.dbHost,
      DB_USER:     this.dbUser,
      DB_PASSWORD: this.dbPassword,
      DB_NAME:     this.dbName,
    };

    for (const [key, value] of Object.entries(requiredStrings)) {
      if (value === undefined || value === null || String(value).trim() === "") {
        throw new Error(`Missing required config: ${key}`);
      }
    }

    // Required numeric fields — must be present and parse to a valid number
    const requiredNumbers = {
      PORT:    this.port,
      DB_PORT: this.dbPort,
    };

    for (const [key, value] of Object.entries(requiredNumbers)) {
      if (Number.isNaN(value) || value <= 0) {
        throw new Error(`Missing required config: ${key} (must be a positive number)`);
      }
    }

    // Optional numeric fields — if present they must still be valid numbers
    if (Number.isNaN(this.dbConnLimit) || this.dbConnLimit < 1) {
      throw new Error("Invalid config: DB_CONNECTION_LIMIT must be a positive integer");
    }
    if (Number.isNaN(this.dbQueueLimit) || this.dbQueueLimit < 0) {
      throw new Error("Invalid config: DB_QUEUE_LIMIT must be zero or a positive integer");
    }
  }

  // ─── Convenience helpers ───────────────────────────────────────────────────

  // Returns a plain-object snapshot of the DB connection settings.
  // Useful for passing to mysql2's createPool() in Database.mjs.
  getDbConfig() {
    return {
      host:            this.dbHost,
      port:            this.dbPort,
      user:            this.dbUser,
      password:        this.dbPassword,
      database:        this.dbName,
      connectionLimit: this.dbConnLimit,
      queueLimit:      this.dbQueueLimit,
    };
  }

  // Returns a sanitised summary (no passwords) safe to log at startup.
  getSafeConfig() {
    return {
      port:         this.port,
      dbHost:       this.dbHost,
      dbPort:       this.dbPort,
      dbUser:       this.dbUser,
      dbName:       this.dbName,
      dbConnLimit:  this.dbConnLimit,
      dbQueueLimit: this.dbQueueLimit,
      logLevel:     this.logLevel,
    };
  }
}