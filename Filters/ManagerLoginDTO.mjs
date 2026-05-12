// Filters/ManagerLoginDTO.mjs
// Used by: POST /restaurant/login  (RestaurantController.login)
// Raw input keys from the HTML form: restaurantName, password

export class ManagerLoginDTO {
  constructor(rawData) {

    // ── SANITIZE ──────────────────────────────────────────────────────────────
    // Apply the same whitespace normalisation used at registration so login
    // with "Pizza  Palace" (two spaces) still finds the stored "Pizza Palace".
    this.restaurantName = (rawData.restaurantName ?? "")
      .toString()
      .trim()
      .replace(/\s+/g, " ");

    // Passwords must NOT be trimmed — a space could be intentional
    this.password = (rawData.password ?? "").toString();

    // ── VALIDATE ──────────────────────────────────────────────────────────────
    this.#validate();
  }

  #validate() {
    const errors = [];

    if (this.restaurantName.length === 0) {
      errors.push("Restaurant name is required");
    }

    if (this.restaurantName.length > 100) {
      errors.push("Restaurant name must be 100 characters or less");
    }

    if (this.password.length === 0) {
      errors.push("Password is required");
    }

    if (this.password.length > 128) {
      errors.push("Password must be 128 characters or less");
    }

    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
  }

  // Returns the sanitised fields in the exact shape RestaurantManager.login() expects.
  toModel() {
    return { restaurantName: this.restaurantName, password: this.password };
  }
}
