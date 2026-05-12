// Filters/CustomerRegisterDTO.mjs
// Used by: POST /auth/register  (AuthController.register)
// Raw input keys from the HTML form: userEmail, password
//
// Sanitises and validates the customer registration payload before it reaches
// the Customer model.  Throws on the first set of violations so the controller
// can catch and return a 400 immediately.

export class CustomerRegisterDTO {
  constructor(rawData) {

    // ── SANITIZE ──────────────────────────────────────────────────────────────
    // ?? ""     guards against a missing field (body parser returns undefined)
    // .toString() guards against any non-string type
    // .trim()   removes accidental leading/trailing whitespace from the field
    // .toLowerCase() normalises emails so "Me@Gmail.com" and "me@gmail.com"
    //   are treated as identical — matches how we store them in the Customer table

    this.email    = (rawData.userEmail ?? "").toString().trim().toLowerCase();

    // Passwords must NOT be trimmed — a leading/trailing space is intentional
    this.password = (rawData.password  ?? "").toString();

    // ── VALIDATE ──────────────────────────────────────────────────────────────
    this.#validate();
  }

  #validate() {
    const errors = [];

    // EMAIL — basic format: something @ something . something
    // Not a full RFC 5321 check but catches the common cases.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      errors.push("Email must be a valid email address");
    }

    // EMAIL — max length must match the VARCHAR(100) in the Customer table
    if (this.email.length > 100) {
      errors.push("Email must be 100 characters or less");
    }

    // PASSWORD — minimum 8 characters (industry-standard minimum)
    if (this.password.length < 8) {
      errors.push("Password must be at least 8 characters");
    }

    // PASSWORD — max 128 characters prevents the bcrypt DoS attack.
    // bcrypt is intentionally slow; a 100 000-character password would block
    // the Node.js event loop for seconds per request.
    if (this.password.length > 128) {
      errors.push("Password must be 128 characters or less");
    }

    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
  }

  // Returns the sanitised fields in the exact shape the Customer model expects.
  // Controllers call dto.toModel() and spread the result directly into the model call.
  toModel() {
    return { email: this.email, password: this.password };
  }
}
