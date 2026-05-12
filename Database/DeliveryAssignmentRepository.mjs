// DeliveryAssignmentRepository.mjs
// Data access layer for the DeliveryAssignment table.
// All SQL is parameterised — values are never interpolated into query strings.

import Database from "./Database.mjs"; // singleton pool — never creates a second connection
import { logger } from "../Utils/Logger.mjs"; // structured logger

export default class DeliveryAssignmentRepository {
  #database; // private — holds the shared Database singleton

  constructor() {
    this.#database = Database.getInstance();
  }

  // ─── CREATE ───────────────────────────────────────────────────────────────

  // Inserts a new DeliveryAssignment row.
  // Called by DeliveryAssignment.create() in the model after validation.
  async createAssignment(assignmentId, orderId, courierId, status) {
    await this.#database.query(
      `INSERT INTO DeliveryAssignment (assignmentId, orderId, courierId, status)
       VALUES (?, ?, ?, ?)`,
      [assignmentId, orderId, courierId, status],
    );
    logger.debug(`DeliveryAssignmentRepository.createAssignment: assignmentId=${assignmentId} orderId=${orderId} courierId=${courierId}`);
  }

  // ─── READ ─────────────────────────────────────────────────────────────────

  // Looks up an assignment by its UUID.  Returns null if not found.
  async findById(assignmentId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM DeliveryAssignment WHERE assignmentId = ?`,
      [assignmentId],
    );
    if (rows.length === 0) return null;
    return rows[0]; // { assignmentId, orderId, courierId, status, createdAt }
  }

  // Looks up the assignment for a specific order.  Returns null if no assignment
  // has been created yet (i.e. the order is still SUBMITTED, not PREPARING).
  async findByOrderId(orderId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM DeliveryAssignment WHERE orderId = ?`,
      [orderId],
    );
    if (rows.length === 0) return null;
    return rows[0];
  }

  // Returns all assignments for a given courrier, ordered most-recent first.
  // Used by CourrierController to populate the courrier dashboard.
  async findByCourierId(courierId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM DeliveryAssignment
       WHERE courierId = ?
       ORDER BY createdAt DESC`,
      [courierId],
    );
    return rows; // empty array if no deliveries have been assigned yet
  }

  // Returns all active (non-delivered) assignments for a courrier.
  // Useful for checking whether a courrier is currently busy.
  async findActiveByCourierId(courierId) {
    const [rows] = await this.#database.query(
      `SELECT * FROM DeliveryAssignment
       WHERE courierId = ? AND status != ?
       ORDER BY createdAt DESC`,
      [courierId, "Delivered"],
    );
    return rows;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  // Updates the delivery status of an assignment in place.
  // Called by DeliveryAssignment.updateStatus() after model-layer validation.
  async updateStatus(assignmentId, status) {
    const [result] = await this.#database.query(
      `UPDATE DeliveryAssignment SET status = ? WHERE assignmentId = ?`,
      [status, assignmentId],
    );
    logger.debug(`DeliveryAssignmentRepository.updateStatus: assignmentId=${assignmentId} → "${status}" (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────

  // Hard-deletes an assignment by UUID.  Returns true if a row was deleted.
  async deleteById(assignmentId) {
    const [result] = await this.#database.query(
      `DELETE FROM DeliveryAssignment WHERE assignmentId = ?`,
      [assignmentId],
    );
    logger.info(`DeliveryAssignmentRepository.deleteById: assignmentId=${assignmentId} (affected=${result.affectedRows})`);
    return result.affectedRows > 0;
  }

  // Removes all assignments for a given order.
  // Call before deleting the order to satisfy the foreign-key constraint.
  async deleteByOrderId(orderId) {
    const [result] = await this.#database.query(
      `DELETE FROM DeliveryAssignment WHERE orderId = ?`,
      [orderId],
    );
    logger.info(`DeliveryAssignmentRepository.deleteByOrderId: orderId=${orderId} (affected=${result.affectedRows})`);
    return result.affectedRows;
  }
}