// RestaurantManagerRepository.mjs
// Data access layer for the RestaurantManager table.
// All SQL is parameterised — values are never interpolated into query strings.

import Database from "./Database.mjs"; // singleton pool — never creates a second connection
import { logger } from "../Utils/Logger.mjs"; // structured logger

export default class RestaurantManagerRepository {
  #database; // private — holds the shared Database singleton

  constructor() {
    this.#database = Database.getInstance();
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────

  // Inserts a new RestaurantManager row.
  // Throws on duplicate restaurantName (UNIQUE constraint).
  async createManager(userId, restaurantName, hashedPassword) {
    await this.#database.query(
      `INSERT INTO RestaurantManager (userId, restaurantName, passwordHash)
       VALUES (?, ?, ?)`,
      [userId, restaurantName, hashedPassword],
    );
    logger.debug(`RestaurantManagerRepository.createManager: inserted userId=${userId}`);
  }

  // ─── READ ─────────────────────────────────────────────────────────────────

  // Looks up a manager by restaurant name.  Returns null if not found.
  async findByRestaurantName(restaurantName) {
    const [rows] = await this.#database.query(
      `SELECT * FROM RestaurantManager WHERE restaurantName = ?`,
      [restaurantName],
    );
    if (rows.length === 0) return null;
    return rows[0]; // { userId, restaurantName, passwordHash, createdAt }
  }

  // Looks up a manager by UUID.  Returns null if not found.
  async findById(userId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM RestaurantManager WHERE userId = ?`,
      [userId],
    );
    if (rows.length === 0) return null;
    return rows[0];
  }

  // Returns every manager row — excludes passwordHash for safety.
  async findAll() {
    const [rows] = await this.#database.query(
      `SELECT userId, restaurantName, createdAt FROM RestaurantManager
       ORDER BY createdAt DESC`,
      [],
    );
    return rows;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  // Updates the restaurant name for this manager account.
  // Throws on duplicate restaurantName (UNIQUE constraint).
  async updateRestaurantName(userId, newRestaurantName) {
    const [result] = await this.#database.query(
      `UPDATE RestaurantManager SET restaurantName = ? WHERE userId = ?`,
      [newRestaurantName, userId],
    );
    logger.debug(`RestaurantManagerRepository.updateRestaurantName: userId=${userId} → "${newRestaurantName}" (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }

  // Replaces the stored password hash (call after bcrypt.hash() in the model).
  async updatePassword(userId, newHashedPassword) {
    const [result] = await this.#database.query(
      `UPDATE RestaurantManager SET passwordHash = ? WHERE userId = ?`,
      [newHashedPassword, userId],
    );
    logger.debug(`RestaurantManagerRepository.updatePassword: userId=${userId} (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  // Hard-deletes a manager row by UUID.
  // NOTE: the related Restaurant (and its MenuItems / Orders) must be deleted
  //       first to avoid foreign-key constraint violations.
  async deleteById(userId) {
    const [result] = await this.#database.query(
      `DELETE FROM RestaurantManager WHERE userId = ?`,
      [userId],
    );
    logger.info(`RestaurantManagerRepository.deleteById: userId=${userId} (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }
}