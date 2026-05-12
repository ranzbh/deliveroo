// CourrierRepository.mjs
// Data access layer for the Courrier table.
// All SQL is parameterised — values are never interpolated into query strings.

import Database from "./Database.mjs"; // singleton pool — never creates a second connection
import { logger } from "../Utils/Logger.mjs"; // structured logger

export default class CourrierRepository {
  #database; // private — holds the shared Database singleton

  constructor() {
    this.#database = Database.getInstance();
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────

  // Inserts a new Courrier row.  Throws on duplicate phoneNumber (UNIQUE constraint).
  async createCourrier(userId, phoneNumber, hashedPassword) {
    await this.#database.query(
      `INSERT INTO Courrier (userId, phoneNumber, passwordHash)
       VALUES (?, ?, ?)`,
      [userId, phoneNumber, hashedPassword],
    );
    logger.debug(`CourrierRepository.createCourrier: inserted userId=${userId}`);
  }

  // ─── READ ─────────────────────────────────────────────────────────────────

  // Looks up a courrier by phone number.  Returns null if not found.
  async findByPhoneNumber(phoneNumber) {
    const [rows] = await this.#database.query(
      `SELECT * FROM Courrier WHERE phoneNumber = ?`,
      [phoneNumber],
    );
    if (rows.length === 0) return null;
    return rows[0]; // { userId, phoneNumber, passwordHash, createdAt }
  }

  // Looks up a courrier by UUID.  Returns null if not found.
  async findById(userId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM Courrier WHERE userId = ?`,
      [userId],
    );
    if (rows.length === 0) return null;
    return rows[0];
  }

  // Returns all couriers — only safe columns (no passwordHash).
  // Used by RestaurantController to populate the "assign courrier" dropdown.
  async findAll() {
    const [rows] = await this.#database.query(
      `SELECT userId, phoneNumber, createdAt FROM Courrier
       ORDER BY createdAt DESC`,
      [],
    );
    return rows;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  // Updates the courrier's phone number.
  // Throws on duplicate phoneNumber (UNIQUE constraint).
  async updatePhoneNumber(userId, newPhoneNumber) {
    const [result] = await this.#database.query(
      `UPDATE Courrier SET phoneNumber = ? WHERE userId = ?`,
      [newPhoneNumber, userId],
    );
    logger.debug(`CourrierRepository.updatePhoneNumber: userId=${userId} → ${newPhoneNumber} (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }

  // Replaces the stored password hash (call after bcrypt.hash() in the model).
  async updatePassword(userId, newHashedPassword) {
    const [result] = await this.#database.query(
      `UPDATE Courrier SET passwordHash = ? WHERE userId = ?`,
      [newHashedPassword, userId],
    );
    logger.debug(`CourrierRepository.updatePassword: userId=${userId} (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  // Hard-deletes a courrier row by UUID.
  // NOTE: all related DeliveryAssignments must be deleted first to avoid
  //       a foreign-key constraint violation.
  async deleteById(userId) {
    const [result] = await this.#database.query(
      `DELETE FROM Courrier WHERE userId = ?`,
      [userId],
    );
    logger.info(`CourrierRepository.deleteById: userId=${userId} (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }
}