import { v4 } from "uuid"; // generates a unique ID for each new customer
import bcrypt from "bcrypt"; // handles password hashing and comparison
import User from "./User.mjs"; // inherits the abstract User base class
import CustomerRepository from "../Database/CustomerRepository.mjs"; // data access layer for Customer DB operations
import { SALT_ROUNDS } from "../Utils/constants.mjs"; // salt rounds constant used for bcrypt hashing
import { revokeToken } from "../Utils/token.mjs"; // deletes the Session row from the DB on logout
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log

export default class Customer extends User {
  #orders; // private field — the customer's order history, not directly accessible from outside

  constructor(userId, email) {
    super(userId); // calls User constructor — sets this.userId and this.createdAt
    this.email = email;
    this.#orders = []; // starts with an empty order list on every new instance
  }

  // ─── Static auth methods ──────────────────────────────────────────────────────

  static async register(email, password) {
    logger.info(`Customer.register — checking if email exists: ${email}`);
    const repo = new CustomerRepository();

    const emailExists = await repo.findByEmail(email); // checks if this email is already registered
    if (emailExists) {
      logger.warn(`Customer.register — email already in use: ${email}`);
      // Return a proper Customer instance built from the existing DB row rather than
      // the raw row object, so callers always receive the same type back.
      return new Customer(emailExists.userId, emailExists.userEmail ?? email);
    }

    const userId = v4(); // generates a new unique ID for this customer
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS); // hashes the password using the shared SALT_ROUNDS constant

    // Propagate DB errors upward — a failed DB write must not silently return a
    // Customer instance that has no persistent record behind it.
    await repo.createUser(userId, email, hashedPassword);

    const newCustomer = new Customer(userId, email); // creates and returns the in-memory Customer instance
    logger.info(`Customer.register — new customer created: ${userId}`);
    return newCustomer;
  }

  static async login(email, password) {
    logger.info(`Customer.login — attempting login for: ${email}`);
    const repo = new CustomerRepository();

    const account = await repo.findByEmail(email); // fetches the customer row from DB by email
    if (!account) {
      logger.warn(`Customer.login — email not found: ${email}`);
      throw new Error("Email not found"); // throws so the controller knows login failed
    }

    const checkPassword = await bcrypt.compare(password, account.passwordHash); // compares the plain input against the stored hash
    if (!checkPassword) {
      logger.warn(`Customer.login — wrong password for: ${email}`);
      throw new Error("Wrong Password"); // throws so the controller knows the password was incorrect
    }

    // TODO completed: return a proper Customer instance (not a raw DB row) so every
    // caller gets a consistent type regardless of which auth path was taken.
    logger.info(`Customer.login — authenticated: ${account.userId}`);
    return new Customer(account.userId, account.userEmail ?? email);
  }

  // TODO completed: logout() — overrides the abstract method on User.
  // Revokes the server-side session token and clears the HttpOnly cookie so
  // the session is permanently invalidated even if the cookie is stolen.
  static async logout(req, res) {
    await revokeToken(req); // deletes the Session row from the DB
    res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0"); // clears the cookie in the browser
    logger.info("Customer.logout — session revoked");
  }

  // ─── Instance methods ─────────────────────────────────────────────────────────

  // Returns this customer's public profile, extending the base User profile.
  getProfile() {
    return {
      ...super.getProfile(),
      email: this.email,
    };
  }

  // Adds a previously-fetched order to the in-memory order history.
  // Typically called after loading orders from the DB so the instance stays in sync.
  addOrder(order) {
    this.#orders.push(order);
  }

  // Returns a copy of the in-memory order list (read-only snapshot).
  getOrders() {
    return [...this.#orders];
  }
}