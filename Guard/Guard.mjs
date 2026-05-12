// Guard/Guard.mjs
// Chainable authentication and authorization helper.
//
// Sits between the Router and any controller logic that requires the user
// to be identified or permitted.  Every method throws on failure so the
// controller's existing try/catch block handles errors without extra wiring.
//
// IMPORTANT — this app uses OPAQUE SESSION TOKENS, NOT JWTs.
// verifyToken() does a database lookup (SELECT * FROM Session WHERE token = ?)
// and returns the raw Session row.  There is no cryptographic signature
// verification here — the server is the source of truth.  A token is valid
// if and only if a row for it exists in the Session table.
//
// The payload this Guard exposes is therefore a plain Session row object:
//   { token, userId, role, userEmail, restaurantName, phoneNumber, createdAt }
//
// ─── Usage pattern inside a controller ───────────────────────────────────────
//
//   import { Guard } from "../Guard/Guard.mjs";
//   import { UserRoles } from "../Utils/constants.mjs";
//
//   // Authentication only (any logged-in user):
//   const { userId } = await new Guard().authenticate(req).then(g => g.payload);
//
//   // Authentication + role check (Manager only):
//   const guard = await new Guard().authenticate(req);
//   guard.authorize(UserRoles.MANAGER);
//   const { userId, restaurantName } = guard.payload;
//
//   // Authentication + ownership check (customer cancelling their own order):
//   const guard = await new Guard().authenticate(req);
//   guard.requireOwnership(order.customerId);
//   const { userId } = guard.payload;
//
//   // Multi-role (Customer or Manager):
//   guard.authorize(UserRoles.CUSTOMER, UserRoles.MANAGER);
//
// ─────────────────────────────────────────────────────────────────────────────

import { verifyToken } from "../Utils/token.mjs"; // looks up the session token in the DB
import { logger }      from "../Utils/Logger.mjs"; // structured logger

export class Guard {
  // The Session row returned by verifyToken() — null until authenticate() runs.
  // Fields: { token, userId, role, userEmail, restaurantName, phoneNumber, createdAt }
  #sessionRow = null;

  // ── Step 1: Authentication ─────────────────────────────────────────────────
  // Reads the session token from the request cookie and looks it up in the
  // Session table.  Throws if:
  //   - The cookie is missing
  //   - The token is not found in the database (revoked or never issued)
  //   - The database query itself fails
  //
  // On success, stores the full Session row so subsequent guard steps and
  // the payload getter can access the caller's identity.
  async authenticate(req) {
    this.#sessionRow = await verifyToken(req); // throws if missing or invalid
    logger.debug(`Guard.authenticate: userId=${this.#sessionRow.userId} role=${this.#sessionRow.role}`);
    return this; // enables method chaining: new Guard().authenticate(req).authorize(...)
  }

  // ── Step 2a: Role-based Authorization ──────────────────────────────────────
  // Checks that the authenticated user's role is in the allowed list.
  // Pass one or more role strings:
  //   guard.authorize(UserRoles.MANAGER)
  //   guard.authorize(UserRoles.CUSTOMER, UserRoles.MANAGER)
  //
  // The role value in the Session row is written by issueToken() at login time
  // using UserRoles.CUSTOMER / UserRoles.COURRIER / UserRoles.MANAGER constants.
  // Must be called after authenticate().  Throws on role mismatch.
  authorize(...allowedRoles) {
    this.#assertAuthenticated("authorize");

    if (!allowedRoles.includes(this.#sessionRow.role)) {
      logger.warn(
        `Guard.authorize: role '${this.#sessionRow.role}' denied — required one of [${allowedRoles.join(", ")}]`,
      );
      throw new Error(
        `Guard: role '${this.#sessionRow.role}' is not permitted. Required: [${allowedRoles.join(", ")}]`,
      );
    }

    logger.debug(`Guard.authorize: role '${this.#sessionRow.role}' accepted`);
    return this; // enables chaining
  }

  // Alias — semantically identical to authorize(), matches the language used
  // in the teaching documents ("requireRole" reads more naturally in some contexts).
  requireRole(...allowedRoles) {
    return this.authorize(...allowedRoles);
  }

  // ── Step 2b: Ownership Authorization ───────────────────────────────────────
  // Checks that the authenticated user is the OWNER of the resource being acted on.
  // Pass the owner ID read from the DB row (e.g. order.customerId).
  // Throws if session.userId !== resourceOwnerId.
  //
  // Use this when you need to verify that Customer A cannot act on Customer B's data,
  // rather than checking a role.  Example:
  //
  //   const order = await repository.findById(dto.orderId);
  //   guard.requireOwnership(order.customerId); // throws if wrong customer
  //
  // Must be called after authenticate().
  requireOwnership(resourceOwnerId) {
    this.#assertAuthenticated("requireOwnership");

    if (this.#sessionRow.userId !== resourceOwnerId) {
      logger.warn(
        `Guard.requireOwnership: userId=${this.#sessionRow.userId} tried to access resource owned by ${resourceOwnerId}`,
      );
      throw new Error("Guard: user does not own this resource");
    }

    logger.debug(`Guard.requireOwnership: ownership confirmed for userId=${this.#sessionRow.userId}`);
    return this;
  }

  // ── Payload Accessor ───────────────────────────────────────────────────────
  // Returns the full Session row after authentication.
  // Destructure only the fields you need:
  //   const { userId } = guard.payload;
  //   const { userId, role, userEmail, restaurantName } = guard.payload;
  //
  // Throws if called before authenticate() — prevents accidentally reading
  // null as a payload in controllers that forget to call authenticate first.
  get payload() {
    this.#assertAuthenticated("payload");
    return this.#sessionRow;
  }

  // ── Private Guard ──────────────────────────────────────────────────────────
  // Centralises the "not yet authenticated" error so every method above has
  // the same safety check without repeating the null test.
  #assertAuthenticated(callerName) {
    if (!this.#sessionRow) {
      throw new Error(`Guard: call authenticate() before ${callerName}()`);
    }
  }
}