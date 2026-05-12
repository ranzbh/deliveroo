// Filters/ManagerRegisterDTO.mjs
// Used by: POST /restaurant/register  (RestaurantController.register)
// Raw input keys from the HTML form: restaurantName, password

export class ManagerRegisterDTO {
  constructor(rawData) {

    // ── SANITIZE ──────────────────────────────────────────────────────────────
    // Collapse multiple internal spaces so "Pizza   Palace" → "Pizza Palace".
    // This prevents two managers registering names that look different but are
    // functionally identical — the UNIQUE DB constraint wouldn't catch them.
    this.restaurantName = (rawData.restaurantName ?? "")
      .toString()
      .trim()
      .replace(/\s+/g, " ");

    // Passwords must NOT be trimmed — a leading/trailing space is intentional
    this.password = (rawData.password ?? "").toString();

    // ── VALIDATE ──────────────────────────────────────────────────────────────
    this.#validate();
  }

  #validate() {
    const errors = [];

    // Minimum 2 characters — a single letter is not a meaningful restaurant name
    if (this.restaurantName.length < 2) {
      errors.push("Restaurant name must be at least 2 characters");
    }

    // Match the VARCHAR(100) column in RestaurantManager and Restaurant tables
    if (this.restaurantName.length > 100) {
      errors.push("Restaurant name must be 100 characters or less");
    }

    if (this.password.length < 8) {
      errors.push("Password must be at least 8 characters");
    }

    if (this.password.length > 128) {
      errors.push("Password must be 128 characters or less");
    }

    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
  }

  // Returns the sanitised fields in the exact shape RestaurantManager.register() expects.
  toModel() {
    return { restaurantName: this.restaurantName, password: this.password };
  }
}
