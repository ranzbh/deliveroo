// Filters/CourrierRegisterDTO.mjs
// Used by: POST /courrier/register  (CourrierController.register)
// Raw input keys from the HTML form: phoneNumber, password

export class CourrierRegisterDTO {
  constructor(rawData) {

    // ── SANITIZE ──────────────────────────────────────────────────────────────
    this.phoneNumber = (rawData.phoneNumber ?? "").toString().trim();

    // Passwords must NOT be trimmed — a leading/trailing space is intentional
    this.password    = (rawData.password    ?? "").toString();

    // ── VALIDATE ──────────────────────────────────────────────────────────────
    this.#validate();
  }

  #validate() {
    const errors = [];

    // PHONE NUMBER — allowed format:
    //   Optional leading +
    //   Followed by 7–20 characters that are digits, spaces, or hyphens
    //
    // Valid:   "+1 555 000 0000" | "0501234567" | "+961-70-123456"
    // Invalid: "abc" | "" | "12" | "++123"
    const phoneRegex = /^\+?[0-9\s\-]{7,20}$/;
    if (!phoneRegex.test(this.phoneNumber)) {
      errors.push("Phone number must be 7–20 digits (optional + prefix allowed)");
    }

    // Ensure the value fits the VARCHAR(20) column in the Courrier table
    if (this.phoneNumber.length > 20) {
      errors.push("Phone number must be 20 characters or less");
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

  // Returns the sanitised fields in the exact shape Courrier.register() expects.
  toModel() {
    return { phoneNumber: this.phoneNumber, password: this.password };
  }
}
