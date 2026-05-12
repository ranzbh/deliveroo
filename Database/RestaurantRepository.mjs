// RestaurantRepository.mjs
// Data access layer for the Restaurant and MenuItem tables.
// All SQL is parameterised — values are never interpolated into query strings.

import Database from "./Database.mjs"; // singleton pool — never creates a second connection
import { logger } from "../Utils/Logger.mjs"; // structured logger

export default class RestaurantRepository {
  #database; // private — holds the shared Database singleton

  constructor() {
    this.#database = Database.getInstance();
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────

  // Inserts a new Restaurant row.
  async createRestaurant(restaurantId, restaurantName, managerId) {
    await this.#database.query(
      `INSERT INTO Restaurant (restaurantId, restaurantName, managerId)
       VALUES (?, ?, ?)`,
      [restaurantId, restaurantName, managerId],
    );
    logger.debug(`RestaurantRepository.createRestaurant: restaurantId=${restaurantId} managerId=${managerId}`);
  }

  // Inserts a new MenuItem row for the given restaurant.
  // description is optional — stored as NULL if omitted.
  async addMenuItem(itemId, restaurantId, name, price, description) {
    await this.#database.query(
      `INSERT INTO MenuItem (itemId, restaurantId, name, price, description)
       VALUES (?, ?, ?, ?, ?)`,
      [itemId, restaurantId, name, price, description ?? null],
    );
    logger.debug(`RestaurantRepository.addMenuItem: itemId=${itemId} restaurantId=${restaurantId} name="${name}" price=${price}`);
  }

  // ─── READ ─────────────────────────────────────────────────────────────────

  // Returns every restaurant — used to populate the customer home page.
  async findAll() {
    const [rows] = await this.#database.query(
      `SELECT * FROM Restaurant ORDER BY restaurantName ASC`,
      [],
    );
    return rows;
  }

  // Looks up a restaurant by its UUID.  Returns null if not found.
  async findById(restaurantId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM Restaurant WHERE restaurantId = ?`,
      [restaurantId],
    );
    if (rows.length === 0) return null;
    return rows[0];
  }

  // Looks up the restaurant owned by a specific manager.  Returns null if the
  // manager has not created a restaurant yet.  A manager owns exactly one restaurant.
  async findByManagerId(managerId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM Restaurant WHERE managerId = ?`,
      [managerId],
    );
    if (rows.length === 0) return null;
    return rows[0];
  }

  // Returns all menu items for a given restaurant, ordered by name.
  async findMenuByRestaurantId(restaurantId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM MenuItem WHERE restaurantId = ? ORDER BY name ASC`,
      [restaurantId],
    );
    return rows; // empty array if no items have been added yet
  }

  // Looks up a single menu item by its UUID.  Returns null if not found.
  async findMenuItemById(itemId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM MenuItem WHERE itemId = ?`,
      [itemId],
    );
    if (rows.length === 0) return null;
    return rows[0];
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  // Updates the restaurant's display name.
  async updateRestaurantName(restaurantId, newName) {
    const [result] = await this.#database.query(
      `UPDATE Restaurant SET restaurantName = ? WHERE restaurantId = ?`,
      [newName, restaurantId],
    );
    logger.debug(`RestaurantRepository.updateRestaurantName: restaurantId=${restaurantId} → "${newName}" (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }

  // Updates a menu item's name, price, and/or description in place.
  // Pass the existing values for any fields you do not want to change.
  async updateMenuItem(itemId, name, price, description) {
    const [result] = await this.#database.query(
      `UPDATE MenuItem SET name = ?, price = ?, description = ? WHERE itemId = ?`,
      [name, price, description ?? null, itemId],
    );
    logger.debug(`RestaurantRepository.updateMenuItem: itemId=${itemId} name="${name}" price=${price} (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  // Removes a single menu item by UUID.  Returns true if a row was deleted.
  // Compatible with Restaurant model's removeItemFromMenu() method.
  async deleteMenuItem(itemId) {
    const [result] = await this.#database.query(
      `DELETE FROM MenuItem WHERE itemId = ?`,
      [itemId],
    );
    logger.info(`RestaurantRepository.deleteMenuItem: itemId=${itemId} (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }

  // Removes all menu items for a restaurant — call before deleting the restaurant.
  async deleteAllMenuItems(restaurantId) {
    const [result] = await this.#database.query(
      `DELETE FROM MenuItem WHERE restaurantId = ?`,
      [restaurantId],
    );
    logger.info(`RestaurantRepository.deleteAllMenuItems: restaurantId=${restaurantId} (affected=${result.affectedRows})`);
    return result.affectedRows;
  }

  // Hard-deletes a restaurant row.
  // NOTE: all related MenuItems and Orders must be deleted first to avoid
  //       foreign-key constraint violations.
  async deleteRestaurant(restaurantId) {
    const [result] = await this.#database.query(
      `DELETE FROM Restaurant WHERE restaurantId = ?`,
      [restaurantId],
    );
    logger.info(`RestaurantRepository.deleteRestaurant: restaurantId=${restaurantId} (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }
}