// Filters/CourrierLoginDTO.mjs
// Used by: POST /courrier/login  (CourrierController.login)
// Raw input keys from the HTML form: phoneNumber, password

export class CourrierLoginDTO {
  constructor(rawData) {

    // ── SANITIZE ──────────────────────────────────────────────────────────────
    this.phoneNumber = (rawData.phoneNumber ?? "").toString().trim();

    // Passwords must NOT be trimmed — a space could be intentional
    this.password    = (rawData.password    ?? "").toString();

    // ── VALIDATE ──────────────────────────────────────────────────────────────
    this.#validate();
  }

  #validate() {
    const errors = [];

    // On login we still apply the phone format check — a string that does not
    // match the pattern will never exist in the DB, so we reject early without
    // a DB round-trip.
    const phoneRegex = /^\+?[0-9\s\-]{7,20}$/;
    if (!phoneRegex.test(this.phoneNumber)) {
      errors.push("Phone number must be 7–20 digits (optional + prefix allowed)");
    }

    if (this.password.length === 0) {
      errors.push("Password is required");
    }

    // Max length prevents bcrypt DoS even on login
    if (this.password.length > 128) {
      errors.push("Password must be 128 characters or less");
    }

    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
  }

  // Returns the sanitised fields in the exact shape Courrier.login() expects.
  toModel() {
    return { phoneNumber: this.phoneNumber, password: this.password };
  }
}
