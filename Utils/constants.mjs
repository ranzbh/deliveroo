// constants.mjs
// Central registry for every value that is fixed at startup and shared across
// the entire application.  Import only what you need — all exports are frozen
// so no file can accidentally mutate a shared constant at runtime.

// ─── Order lifecycle statuses ─────────────────────────────────────────────────
// Represents every state an order (or delivery assignment) can be in.
// Used by OrderController, RestaurantController, CourrierController, and the
// DeliveryAssignment model.  Object.freeze() ensures no file can add, remove,
// or overwrite a value at runtime.
export const OrderStatus = Object.freeze({
    INCOMPLETE: "Incomplete Cart", // open cart — customer is still adding items
    SUBMITTED:  "Submitted",       // customer has placed the order — awaiting manager action
    PREPARING:  "Preparing",       // manager has assigned a courrier — kitchen is preparing
    ONTHEWAY:   "On the way",      // courrier has picked up the order
    DELIVERED:  "Delivered",       // order has been delivered to the customer
  });
  
  // ─── User roles ───────────────────────────────────────────────────────────────
  // Written into the Session table at login and read back by verifyToken().
  // Must match exactly what the controllers pass to issueToken().
  export const UserRoles = Object.freeze({
    CUSTOMER: "Customer",
    COURRIER: "Courrier",
    MANAGER:  "Manager",
  });
  
  // ─── bcrypt ───────────────────────────────────────────────────────────────────
  // Cost factor used by every model that hashes passwords with bcrypt.
  // 10 is the industry-standard minimum; increase to 12-14 for production.
  export const SALT_ROUNDS = 10;
  
  // ─── Business-rule limits ─────────────────────────────────────────────────────
  // Enforced in OrderController before writing to the DB.
  export const OrderLimits = Object.freeze({
    MAX_ITEMS_PER_ORDER: 20, // a single order cannot contain more than 20 line-items
    MAX_ACTIVE_ORDERS:   5,  // a customer cannot have more than 5 active orders at once
  });
  
  // ─── HTTP status codes ────────────────────────────────────────────────────────
  // Used in every controller and the ErrorController when calling res.writeHead().
  // Keeping them here means a typo (e.g. 401 vs 403) is caught in one place.
  export const HTTP_STATUS = Object.freeze({
    OK:             200, // request succeeded, body contains the result
    CREATED:        201, // resource successfully created
    TEMP_REDIRECT:  302, // temporary redirect — browser follows the Location header
    BAD_REQUEST:    400, // client sent malformed or invalid data
    UNAUTHORIZED:   401, // client is not authenticated — redirect to login
    FORBIDDEN:      403, // client is authenticated but not allowed to perform this action
    NOT_FOUND:      404, // requested resource does not exist
    SERVER_ERROR:   500, // unexpected server-side failure
  });
  
  // ─── Session / token settings ─────────────────────────────────────────────────
  // Consumed by token.mjs when building the Set-Cookie header.
  // Expressed in seconds — 3 600 s = 1 hour.
  export const TOKEN_MAX_AGE = 3600;
  
  // ─── Log levels ───────────────────────────────────────────────────────────────
  // Mirrors the level strings used internally by Logger.mjs so other modules can
  // reference them as constants rather than hard-coding string literals.
  export const LogLevel = Object.freeze({
    DEBUG: "DEBUG",
    INFO:  "INFO",
    WARN:  "WARN",
    ERROR: "ERROR",
  });