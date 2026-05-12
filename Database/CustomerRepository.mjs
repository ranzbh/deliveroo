// CustomerRepository.mjs
// Data access layer for the Customer table.
// All SQL is parameterised — values are never interpolated into query strings.
// Only this repository (and the auth flow in Customer.mjs) touches Customer rows.

import Database from "./Database.mjs"; // singleton pool — never creates a second connection
import { logger } from "../Utils/Logger.mjs"; // structured logger

export default class CustomerRepository {
  #database; // private — holds the shared Database singleton

  constructor() {
    this.#database = Database.getInstance(); // fetches (or creates) the singleton pool
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────

  // Inserts a new Customer row.  Throws on duplicate email (UNIQUE constraint).
  async createUser(userId, email, hashedPassword) {
    await this.#database.query(
      `INSERT INTO Customer (userId, email, passwordHash)
       VALUES (?, ?, ?)`,
      [userId, email, hashedPassword],
    );
    logger.debug(`CustomerRepository.createUser: inserted userId=${userId}`);
  }

  // ─── READ ─────────────────────────────────────────────────────────────────

  // Looks up a customer by email address.  Returns null if not found.
  async findByEmail(email) {
    const [rows] = await this.#database.query(
      `SELECT * FROM Customer WHERE email = ?`,
      [email],
    );
    if (rows.length === 0) return null;
    return rows[0]; // returns a plain object — { userId, email, passwordHash, createdAt }
  }

  // Looks up a customer by their UUID.  Returns null if not found.
  async findById(customerId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM Customer WHERE userId = ?`,
      [customerId],
    );
    if (rows.length === 0) return null;
    return rows[0];
  }

  // Alias kept for backward-compat with any code that calls findCustomerById().
  async findCustomerById(customerId) {
    return this.findById(customerId);
  }

  // Returns every customer row — excludes passwordHash for safety.
  // Useful for admin views or debugging; not called by any current route.
  async findAll() {
    const [rows] = await this.#database.query(
      `SELECT userId, email, createdAt FROM Customer
       ORDER BY createdAt DESC`,
      [],
    );
    return rows;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  // Updates the customer's email address.
  // Throws on duplicate email (UNIQUE constraint).
  async updateEmail(userId, newEmail) {
    const [result] = await this.#database.query(
      `UPDATE Customer SET email = ? WHERE userId = ?`,
      [newEmail, userId],
    );
    logger.debug(`CustomerRepository.updateEmail: userId=${userId} → ${newEmail} (affected=${result.affectedRows})`);
    return result.affectedRows > 0; // true if a row was actually updated
  }

  // Replaces the stored password hash (call after bcrypt.hash() in the model).
  async updatePassword(userId, newHashedPassword) {
    const [result] = await this.#database.query(
      `UPDATE Customer SET passwordHash = ? WHERE userId = ?`,
      [newHashedPassword, userId],
    );
    logger.debug(`CustomerRepository.updatePassword: userId=${userId} (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  // Hard-deletes a customer row by UUID.
  // NOTE: all related Orders must be deleted or reassigned first to avoid
  //       a foreign-key constraint violation.
  async deleteById(userId) {
    const [result] = await this.#database.query(
      `DELETE FROM Customer WHERE userId = ?`,
      [userId],
    );
    logger.info(`CustomerRepository.deleteById: userId=${userId} (affected=${result.affectedRows})`);
    return result.affectedRows > 0; // true if the row existed and was deleted
  }
}