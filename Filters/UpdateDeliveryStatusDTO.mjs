// Filters/UpdateDeliveryStatusDTO.mjs
// Used by: POST /courrier/status  (CourrierController.updateStatus)
// Raw input keys from the form in Dash-CourrierView.html: assignmentId, status

import { OrderStatus } from "../Utils/constants.mjs"; // shared status constants

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// The three statuses a courrier is allowed to set on a delivery assignment.
// IMPORTANT: this is intentionally narrower than Object.values(OrderStatus).
//
// A courrier must never be able to set:
//   - OrderStatus.INCOMPLETE ("Incomplete Cart") — that is the customer's open cart state
//   - OrderStatus.SUBMITTED  ("Submitted")       — that is set by the customer on checkout
//
// Allowing those two would let a courrier revert an order back to an earlier
// lifecycle stage, breaking the manager dashboard and order history entirely.
const COURRIER_ALLOWED_STATUSES = [
  OrderStatus.PREPARING,  // "Preparing"  — acknowledged (usually set by manager, but courrier can confirm)
  OrderStatus.ONTHEWAY,   // "On the way" — courrier has picked up the order
  OrderStatus.DELIVERED,  // "Delivered"  — order successfully delivered to the customer
];

export class UpdateDeliveryStatusDTO {
  constructor(rawData) {

    // ── SANITIZE ──────────────────────────────────────────────────────────────
    this.assignmentId = (rawData.assignmentId ?? "").toString().trim();
    this.status       = (rawData.status       ?? "").toString().trim();

    // ── VALIDATE ──────────────────────────────────────────────────────────────
    this.#validate();
  }

  #validate() {
    const errors = [];

    // ASSIGNMENT ID — must be a valid UUID v4
    if (!UUID_REGEX.test(this.assignmentId)) {
      errors.push("assignmentId must be a valid UUID");
    }

    // STATUS — strict whitelist against the three courrier-settable statuses.
    //
    // This is the most critical validation in the entire DTO layer.
    //
    // The <select> in Dash-CourrierView.html only shows three options, but
    // the browser does NOT enforce that — any POST request can send any string.
    // A direct curl request bypasses the browser completely.
    //
    // Without this check, an attacker could:
    //   1. Write an arbitrary string into the DeliveryAssignment.status column
    //   2. Revert an order to "Incomplete Cart" or "Submitted", breaking the
    //      manager dashboard and allowing orders to be re-assigned infinitely
    //
    // We use the narrowed whitelist (not Object.values(OrderStatus)) so that
    // INCOMPLETE and SUBMITTED are never accepted from a courrier.
    if (!COURRIER_ALLOWED_STATUSES.includes(this.status)) {
      errors.push(
        `Status must be one of: ${COURRIER_ALLOWED_STATUSES.join(", ")}`,
      );
    }

    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
  }

  // Returns the sanitised fields in the shape CourrierController.updateStatus() expects.
  toModel() {
    return { assignmentId: this.assignmentId, status: this.status };
  }
}
