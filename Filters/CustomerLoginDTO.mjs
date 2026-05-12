// Filters/CustomerLoginDTO.mjs
// Used by: POST /auth/login  (AuthController.login)
// Raw input keys from the HTML form: userEmail, password
//
// Sanitises and validates the customer login payload before it reaches
// the Customer model.  Throws on validation failure so the controller
// can catch and return a 401 immediately.

export class CustomerLoginDTO {
  constructor(rawData) {

    // ── SANITIZE ──────────────────────────────────────────────────────────────
    this.email    = (rawData.userEmail ?? "").toString().trim().toLowerCase();

    // Passwords must NOT be trimmed — a space could be intentional
    this.password = (rawData.password  ?? "").toString();

    // ── VALIDATE ──────────────────────────────────────────────────────────────
    this.#validate();
  }

  #validate() {
    const errors = [];

    // On login we still check format — a string that fails the regex can never
    // exist in the DB, so we reject early without an unnecessary DB round-trip.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      errors.push("Email must be a valid email address");
    }

    // Max length guard — prevents sending a huge string to the DB query
    if (this.email.length > 100) {
      errors.push("Email must be 100 characters or less");
    }

    // On login we do NOT enforce minimum password length.
    // If the password is wrong the model rejects it via bcrypt.compare() anyway.
    // We only check it is not completely empty.
    if (this.password.length === 0) {
      errors.push("Password is required");
    }

    // Max length still required to prevent the bcrypt DoS attack on login too.
    if (this.password.length > 128) {
      errors.push("Password must be 128 characters or less");
    }

    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
  }

  // Returns the sanitised fields in the exact shape Customer.login() expects.
  toModel() {
    return { email: this.email, password: this.password };
  }
}
