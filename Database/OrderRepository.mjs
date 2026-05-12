// OrderRepository.mjs
// Data access layer for the Order and OrderItem tables.
// All SQL is parameterised — values are never interpolated into query strings.
// Status strings use the OrderStatus constants from constants.mjs so a rename
// in one place propagates everywhere automatically.

import Database from "./Database.mjs"; // singleton pool — never creates a second connection
import { OrderStatus } from "../Utils/constants.mjs"; // shared status constants — eliminates hardcoded strings
import { logger } from "../Utils/Logger.mjs"; // structured logger

export default class OrderRepository {
  #database; // private — holds the shared Database singleton

  constructor() {
    this.#database = Database.getInstance();
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────

  // Inserts a new Order row (initially with status = INCOMPLETE / open cart).
  async createOrder(orderId, customerId, restaurantId, status) {
    await this.#database.query(
      `INSERT INTO \`Order\` (orderId, customerId, restaurantId, status)
       VALUES (?, ?, ?, ?)`,
      [orderId, customerId, restaurantId, status],
    );
    logger.debug(`OrderRepository.createOrder: orderId=${orderId} customerId=${customerId} status="${status}"`);
  }

  // Adds one item to an order, or increments its quantity if it already exists.
  // ON DUPLICATE KEY UPDATE means adding the same item twice increments quantity
  // rather than inserting a second row — matching the UNIQUE KEY on (orderId, itemName).
  async addOrderItem(orderId, itemName, price) {
    await this.#database.query(
      `INSERT INTO OrderItem (orderId, itemName, price, quantity)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE quantity = quantity + 1`,
      [orderId, itemName, price],
    );
    logger.debug(`OrderRepository.addOrderItem: orderId=${orderId} item="${itemName}" price=${price}`);
  }

  // ─── READ ─────────────────────────────────────────────────────────────────

  // Looks up an order by its UUID.  Returns null if not found.
  async findById(orderId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM \`Order\` WHERE orderId = ?`,
      [orderId],
    );
    if (rows.length === 0) return null;
    return rows[0]; // { orderId, customerId, restaurantId, status, createdAt }
  }

  // Returns all orders placed by a specific customer (all statuses).
  async findByCustomerId(customerId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM \`Order\` WHERE customerId = ?
       ORDER BY createdAt DESC`,
      [customerId],
    );
    return rows;
  }

  // Returns all items belonging to an order.
  async findItemsByOrderId(orderId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM OrderItem WHERE orderId = ?`,
      [orderId],
    );
    return rows; // { id, orderId, itemName, price, quantity }
  }

  // Returns all non-cart orders for a restaurant (used by the manager dashboard).
  // Excludes INCOMPLETE orders (open carts) since they haven't been placed yet.
  async findByRestaurantId(restaurantId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM \`Order\`
       WHERE restaurantId = ? AND status != ?
       ORDER BY createdAt DESC`,
      [restaurantId, OrderStatus.INCOMPLETE], // uses constant — no hardcoded string
    );
    return rows;
  }

  // Returns the open cart (status = INCOMPLETE) for a specific customer +
  // restaurant combination.  Returns null if no cart exists yet.
  async findCartOrder(customerId, restaurantId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM \`Order\`
       WHERE customerId = ? AND restaurantId = ? AND status = ?`,
      [customerId, restaurantId, OrderStatus.INCOMPLETE], // uses constant
    );
    if (rows.length === 0) return null;
    return rows[0];
  }

  // Returns all active (in-progress) orders for a customer.
  // Excludes DELIVERED orders (completed) and INCOMPLETE orders (open carts).
  // Used by OrderController to enforce MAX_ACTIVE_ORDERS.
  async findActiveByCustomerId(customerId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM \`Order\`
       WHERE customerId = ? AND status NOT IN (?, ?)
       ORDER BY createdAt DESC`,
      [customerId, OrderStatus.DELIVERED, OrderStatus.INCOMPLETE], // uses constants
    );
    return rows;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  // Advances an order to a new status (e.g. INCOMPLETE → SUBMITTED → PREPARING…).
  async updateStatus(orderId, status) {
    const [result] = await this.#database.query(
      `UPDATE \`Order\` SET status = ? WHERE orderId = ?`,
      [status, orderId],
    );
    logger.debug(`OrderRepository.updateStatus: orderId=${orderId} → "${status}" (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }

  // Decrements the quantity of a specific item in an order.
  // If quantity reaches 0 the row is deleted automatically.
  async decrementOrderItem(orderId, itemName) {
    // First decrement
    await this.#database.query(
      `UPDATE OrderItem SET quantity = quantity - 1
       WHERE orderId = ? AND itemName = ? AND quantity > 0`,
      [orderId, itemName],
    );
    // Then prune any rows whose quantity hit 0
    await this.#database.query(
      `DELETE FROM OrderItem WHERE orderId = ? AND itemName = ? AND quantity <= 0`,
      [orderId, itemName],
    );
    logger.debug(`OrderRepository.decrementOrderItem: orderId=${orderId} item="${itemName}"`);
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  // Removes all OrderItem rows for an order.
  // Must be called before deleteOrder() to satisfy the foreign-key constraint.
  async deleteOrderItems(orderId) {
    const [result] = await this.#database.query(
      `DELETE FROM OrderItem WHERE orderId = ?`,
      [orderId],
    );
    logger.info(`OrderRepository.deleteOrderItems: orderId=${orderId} (affected=${result.affectedRows})`);
    return result.affectedRows;
  }

  // Hard-deletes an order row.
  // Call deleteOrderItems() first to avoid a foreign-key constraint violation.
  async deleteOrder(orderId) {
    const [result] = await this.#database.query(
      `DELETE FROM \`Order\` WHERE orderId = ?`,
      [orderId],
    );
    logger.info(`OrderRepository.deleteOrder: orderId=${orderId} (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }
}