// Filters/AssignCourierDTO.mjs
// Used by: POST /order/assign  (RestaurantController.assignCourier)
// Raw input keys from the form in Dash-ManagerView.html: orderId, courierId

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AssignCourierDTO {
  constructor(rawData) {

    // ── SANITIZE ──────────────────────────────────────────────────────────────
    this.orderId   = (rawData.orderId   ?? "").toString().trim();
    this.courierId = (rawData.courierId ?? "").toString().trim();

    // ── VALIDATE ──────────────────────────────────────────────────────────────
    this.#validate();
  }

  #validate() {
    const errors = [];

    // Both values come from the manager dashboard form.
    // orderId is a hidden <input>; courierId is a <select> value.
    // Both are originally database values but the manager (or an attacker)
    // can submit any string — validate both before touching the DB.

    if (!UUID_REGEX.test(this.orderId)) {
      errors.push("orderId must be a valid UUID");
    }

    if (!UUID_REGEX.test(this.courierId)) {
      errors.push("courierId must be a valid UUID");
    }

    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
  }

  // Returns the sanitised fields in the shape RestaurantController.assignCourier() expects.
  toModel() {
    return { orderId: this.orderId, courierId: this.courierId };
  }
}
