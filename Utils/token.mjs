// token.mjs
// Session-token utilities for the DeliveryApp.
//
// This module implements opaque session tokens (not JWTs).
// Every token is a 64-character random hex string stored in the Session table.
// The browser holds it in an HttpOnly cookie that JavaScript cannot read,
// protecting against XSS.  Logout deletes the DB row, instantly invalidating
// the token even if someone still holds a copy of the cookie.
//
// Three functions are exported:
//   issueToken(res, user, role)  — after successful login
//   verifyToken(req)             — at the start of every protected handler
//   revokeToken(req)             — on logout (called from model logout() methods)

import { randomBytes } from "node:crypto";
import Database         from "../Database/Database.mjs";
import { TOKEN_MAX_AGE } from "./constants.mjs"; // 3600 s = 1 hour
import { logger }        from "./Logger.mjs";

const db = Database.getInstance(); // singleton DB pool — reused for all token queries

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Parses the Cookie request header into a plain key-value object.
// Handles missing headers, whitespace, and values that contain "=".
const parseCookies = (req) => {
  const raw = req.headers.cookie ?? "";
  if (!raw) return {};

  return Object.fromEntries(
    raw.split(";").map((c) => {
      const trimmed = c.trim();
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) return [trimmed, ""]; // flag cookies with no value
      return [
        trimmed.slice(0, eqIndex),           // cookie name
        trimmed.slice(eqIndex + 1),           // cookie value (may contain "=")
      ];
    }),
  );
};

// Builds the Set-Cookie header value for the session token.
// Flags used:
//   HttpOnly    — JavaScript cannot read this cookie (XSS protection)
//   Path=/      — cookie is sent with every request to this origin
//   SameSite=Strict — cookie is not sent on cross-site requests (CSRF protection)
//   Max-Age     — how long (in seconds) the browser should keep the cookie
const buildTokenCookie = (token) =>
  `token=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${TOKEN_MAX_AGE}`;

// ─── issueToken ───────────────────────────────────────────────────────────────

// Generates a random session token, writes it to the Session table alongside
// the user's identity, and sets it as an HttpOnly cookie on the response.
//
// The Session table must have columns:
//   token, userId, role, userEmail, restaurantName, phoneNumber
//
// Called by every controller's login/register handler after credentials pass.
export const issueToken = async (res, user, role) => {
  const token = randomBytes(32).toString("hex"); // 64 hex chars — cryptographically random

  await db.query(
    `INSERT INTO Session (token, userId, role, userEmail, restaurantName, phoneNumber)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      token,
      user.userId,
      role,
      user.email          ?? null, // Customer — identified by email
      user.restaurantName ?? null, // RestaurantManager — identified by restaurantName
      user.phoneNumber    ?? null, // Courrier — identified by phoneNumber
    ],
  );

  res.setHeader("Set-Cookie", buildTokenCookie(token));
  logger.info(`issueToken: session created for userId ${user.userId} (role: ${role})`);
};

// ─── verifyToken ──────────────────────────────────────────────────────────────

// Reads the session token from the request cookie, looks it up in the Session
// table, and returns the full session row on success.
//
// The returned row contains: token, userId, role, userEmail, restaurantName, phoneNumber
// Controllers destructure exactly the fields they need, e.g.:
//   const { userId, userEmail, restaurantName } = await verifyToken(req);
//
// Throws if:
//   • The cookie is missing or has no token value
//   • The token does not match any row in the Session table
//   • The DB query fails
//
// Called at the top of every protected request handler.
export const verifyToken = async (req) => {
  const { token } = parseCookies(req);

  if (!token) {
    logger.warn("verifyToken: no token cookie present on request");
    throw new Error("No token found");
  }

  const [rows] = await db.query(
    "SELECT * FROM Session WHERE token = ?",
    [token],
  );

  if (!rows.length) {
    logger.warn("verifyToken: token not found in Session table — may be expired or revoked");
    throw new Error("Invalid or expired session");
  }

  logger.debug(`verifyToken: valid session for userId ${rows[0].userId}`);
  return rows[0]; // contains userId, role, userEmail, restaurantName, phoneNumber
};

// ─── revokeToken ─────────────────────────────────────────────────────────────

// Reads the session token from the request cookie and deletes the matching
// Session row from the DB, permanently invalidating the token server-side.
//
// After this call the controller (or model logout() method) must also clear
// the cookie on the response with:
//   res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0");
//
// Called from every model's static logout() method
// (Customer.logout, Courrier.logout, RestaurantManager.logout).
// Silently does nothing if no token cookie is present — this is intentional
// so a logout attempt from an already-logged-out browser never throws.
export const revokeToken = async (req) => {
  const { token } = parseCookies(req);

  if (!token) {
    logger.warn("revokeToken: no token cookie — nothing to revoke");
    return; // nothing to do — user was not logged in
  }

  await db.query("DELETE FROM Session WHERE token = ?", [token]);
  logger.info("revokeToken: session row deleted from DB");
};