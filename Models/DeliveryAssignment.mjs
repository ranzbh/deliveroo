import { v4 } from "uuid"; // generates a unique ID for each assignment
import { OrderStatus } from "../Utils/constants.mjs"; // status constants shared across order-related models
import DeliveryAssignmentRepository from "../Database/DeliveryAssignmentRepository.mjs"; // persists assignments to the DB
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log

const repository = new DeliveryAssignmentRepository(); // single repository instance reused across all static calls

// Valid statuses that a delivery assignment can transition through after creation.
// A new assignment starts at PREPARING (the restaurant has acknowledged and is getting the order ready).
const VALID_ASSIGNMENT_STATUSES = [
  OrderStatus.PREPARING,
  OrderStatus.ONTHEWAY,
  OrderStatus.DELIVERED,
];

export default class DeliveryAssignment {
  constructor(orderId, courierId) {
    this.assignmentId = v4(); // unique identifier for this assignment
    this.orderId = orderId; // links the assignment to the order being delivered
    this.courierId = courierId; // links the assignment to the courrier who will deliver it
    // New assignments start at PREPARING — the restaurant has begun preparing the order
    // and a courrier has been assigned. The courrier will advance it through ON_THE_WAY → DELIVERED.
    this.status = OrderStatus.PREPARING;
    this.createdAt = new Date().toISOString(); // timestamps the assignment for audit/display purposes
  }

  // ─── Static factory ───────────────────────────────────────────────────────────

  // Creates a new assignment, persists it to the DB, and returns the instance.
  static async create(orderId, courierId) {
    if (!orderId || !courierId) {
      throw new Error("DeliveryAssignment.create: orderId and courierId are required");
    }
    const assignment = new DeliveryAssignment(orderId, courierId); // builds the instance with a fresh UUID and PREPARING status
    await repository.createAssignment(
      assignment.assignmentId,
      assignment.orderId,
      assignment.courierId,
      assignment.status,
    ); // writes to DB
    logger.info(`DeliveryAssignment created: ${assignment.assignmentId} — order ${orderId} → courrier ${courierId}`);
    return assignment; // returns the persisted instance to the caller
  }

  // ─── Static status update ─────────────────────────────────────────────────────

  // TODO completed: validates the new status against the allowed set before hitting the DB,
  // so invalid values are caught at the model layer rather than causing a silent DB error.
  static async updateStatus(assignmentId, newStatus) {
    if (!assignmentId) {
      throw new Error("DeliveryAssignment.updateStatus: assignmentId is required");
    }
    if (!VALID_ASSIGNMENT_STATUSES.includes(newStatus)) {
      throw new Error(
        `DeliveryAssignment.updateStatus: "${newStatus}" is not a valid assignment status. ` +
        `Allowed values: ${VALID_ASSIGNMENT_STATUSES.join(", ")}`,
      );
    }
    await repository.updateStatus(assignmentId, newStatus); // delegates to repository — no in-memory state to sync
    logger.info(`DeliveryAssignment ${assignmentId} — status updated to: ${newStatus}`);
  }

  // ─── Instance helpers ─────────────────────────────────────────────────────────

  // Returns a plain-object summary of this assignment (safe to log or return in a response).
  getInfo() {
    return {
      assignmentId: this.assignmentId,
      orderId: this.orderId,
      courierId: this.courierId,
      status: this.status,
      createdAt: this.createdAt,
    };
  }
}