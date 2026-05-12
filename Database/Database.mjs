// Database.mjs
// Singleton MySQL connection pool.  Only one instance ever exists per server
// run — every repository fetches it via Database.getInstance().
//
// On first access the pool is created and the full schema is initialised with
// CREATE TABLE IF NOT EXISTS statements so the server is self-bootstrapping;
// no external migration scripts are needed.

import mysql from "mysql2/promise"; // mysql2 with Promise support — allows async/await
import { logger } from "../Utils/Logger.mjs"; // structured logger — replaces all console.log calls

// ─── Schema ───────────────────────────────────────────────────────────────────
// Every CREATE TABLE uses IF NOT EXISTS so re-running on startup is safe.
// Tables are ordered so that foreign-key targets exist before the tables that
// reference them (Customer/Courrier/RestaurantManager before everything else).

const schema = `
CREATE TABLE IF NOT EXISTS Customer (
    userId       VARCHAR(36)  PRIMARY KEY,
    email        VARCHAR(100) UNIQUE NOT NULL,
    passwordHash VARCHAR(255) NOT NULL,
    createdAt    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Courrier (
    userId       VARCHAR(36)  PRIMARY KEY,
    phoneNumber  VARCHAR(20)  UNIQUE NOT NULL,
    passwordHash VARCHAR(255) NOT NULL,
    createdAt    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS RestaurantManager (
    userId         VARCHAR(36)  PRIMARY KEY,
    restaurantName VARCHAR(100) UNIQUE NOT NULL,
    passwordHash   VARCHAR(255) NOT NULL,
    createdAt      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Restaurant (
    restaurantId   VARCHAR(36)  PRIMARY KEY,
    restaurantName VARCHAR(100) NOT NULL,
    managerId      VARCHAR(36)  NOT NULL,
    createdAt      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (managerId) REFERENCES RestaurantManager(userId)
);

CREATE TABLE IF NOT EXISTS MenuItem (
    itemId       VARCHAR(36)    PRIMARY KEY,
    restaurantId VARCHAR(36)    NOT NULL,
    name         VARCHAR(100)   NOT NULL,
    price        DECIMAL(10, 2) NOT NULL,
    description  TEXT,
    createdAt    TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (restaurantId) REFERENCES Restaurant(restaurantId)
);

CREATE TABLE IF NOT EXISTS \`Order\` (
    orderId      VARCHAR(36) PRIMARY KEY,
    customerId   VARCHAR(36) NOT NULL,
    restaurantId VARCHAR(36) NOT NULL,
    status       VARCHAR(50) NOT NULL,
    createdAt    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customerId)   REFERENCES Customer(userId),
    FOREIGN KEY (restaurantId) REFERENCES Restaurant(restaurantId)
);

CREATE TABLE IF NOT EXISTS OrderItem (
    id        INT            AUTO_INCREMENT PRIMARY KEY,
    orderId   VARCHAR(36)    NOT NULL,
    itemName  VARCHAR(100)   NOT NULL,
    price     DECIMAL(10, 2) NOT NULL,
    quantity  INT            NOT NULL DEFAULT 1,
    UNIQUE KEY uq_order_item (orderId, itemName),
    FOREIGN KEY (orderId) REFERENCES \`Order\`(orderId)
);

CREATE TABLE IF NOT EXISTS DeliveryAssignment (
    assignmentId VARCHAR(36) PRIMARY KEY,
    orderId      VARCHAR(36) NOT NULL,
    courierId    VARCHAR(36) NOT NULL,
    status       VARCHAR(50) NOT NULL,
    createdAt    TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (orderId)    REFERENCES \`Order\`(orderId),
    FOREIGN KEY (courierId)  REFERENCES Courrier(userId)
);

CREATE TABLE IF NOT EXISTS Session (
    token          VARCHAR(64)  PRIMARY KEY,
    userId         VARCHAR(36)  NOT NULL,
    role           VARCHAR(20)  NOT NULL,
    userEmail      VARCHAR(100),
    restaurantName VARCHAR(100),
    phoneNumber    VARCHAR(20),
    createdAt      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
`;

// ─── Database singleton ───────────────────────────────────────────────────────

export default class Database {
  static #DBInstance = null;      // the one shared instance — null until first call
  static #isConstructing = false; // guard: only getInstance() may call new Database()
  #pool = null;                   // mysql2 connection pool — private to this instance
  #ready = null;                  // Promise that resolves once the pool + schema are up

  constructor() {
    if (!Database.#isConstructing) {
      throw new Error(
        "Database is a singleton. Use Database.getInstance() instead of new Database().",
      );
    }
  }

  // Initialises the pool and runs the schema.  Returns a Promise so callers
  // can await readiness before firing queries.
  async #connect() {
    // Read connection settings directly from process.env.
    // dotenv must be loaded by the entry point (index.mjs) before this runs.
    const host            = process.env.DB_HOST;
    const port            = Number(process.env.DB_PORT);
    const user            = process.env.DB_USER;
    const password        = process.env.DB_PASSWORD;
    const database        = process.env.DB_NAME;
    const connectionLimit = Number(process.env.DB_CONNECTION_LIMIT ?? "10");
    const queueLimit      = Number(process.env.DB_QUEUE_LIMIT ?? "0");

    // Validate required variables before attempting a connection so the error
    // message names the missing variable rather than crashing deep in mysql2.
    const required = { DB_HOST: host, DB_PORT: port, DB_USER: user, DB_PASSWORD: password, DB_NAME: database };
    for (const [key, value] of Object.entries(required)) {
      if (value === undefined || value === null || value === "" || Number.isNaN(value)) {
        throw new Error(`Database: missing required environment variable: ${key}`);
      }
    }

    this.#pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit,
      queueLimit,
      multipleStatements: true, // required for running the multi-statement schema string in one call
    });

    logger.info("Database: connection pool established");

    try {
      // Run every CREATE TABLE IF NOT EXISTS in a single round-trip.
      // multipleStatements: true must be set for this to work.
      await this.#pool.query(schema);
      logger.info("Database: all tables verified / created");
    } catch (err) {
      logger.error(`Database: schema initialisation failed — ${err.message}`);
      throw err; // re-throw so the server can refuse to start on a broken schema
    }
  }

  // Returns the singleton instance, creating it on the first call.
  // The returned instance exposes a #ready promise so query() waits for the
  // pool to be fully initialised before executing any SQL.
  static getInstance() {
    if (Database.#DBInstance === null) {
      logger.info("Database: creating singleton instance");
      Database.#isConstructing = true;
      Database.#DBInstance = new Database();
      Database.#isConstructing = false;

      // Store the connect() promise so query() can await it.
      // This eliminates the race condition where query() fires before the pool
      // and schema are ready (previously #connect() was called without await).
      Database.#DBInstance.#ready = Database.#DBInstance.#connect();
    }
    return Database.#DBInstance;
  }

  // Executes a parameterised SQL query against the pool.
  // Awaits #ready first so the first query never races with pool creation.
  async query(sql, params = []) {
    await this.#ready; // wait for pool + schema before executing
    return await this.#pool.execute(sql, params); // execute() uses prepared statements — safer than query() for user data
  }

  // Gracefully drains and closes the connection pool.
  // Call this on process exit (SIGTERM / SIGINT) to avoid leaked connections.
  async close() {
    if (this.#pool) {
      await this.#pool.end();
      logger.info("Database: connection pool closed");
    }
  }
}