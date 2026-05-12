import User from "./User.mjs"; // inherits the abstract User base class
import { v4 } from "uuid"; // generates a unique ID for each new manager
import bcrypt from "bcrypt"; // handles password hashing and comparison
import { SALT_ROUNDS } from "../Utils/constants.mjs"; // shared bcrypt cost factor
import RestaurantManagerRepository from "../Database/RestaurantManagerRepository.mjs"; // data access layer for RestaurantManager
import { revokeToken } from "../Utils/token.mjs"; // deletes the Session row from the DB on logout
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log

export default class RestaurantManager extends User {
  constructor(userId, restaurantName) {
    super(userId); // calls User constructor — sets this.userId and this.createdAt
    this.restaurantName = restaurantName; // managers are tied to a specific restaurant by name
  }

  // ─── Static auth methods ──────────────────────────────────────────────────────

  static async register(restaurantName, password) {
    logger.info(`RestaurantManager.register — checking restaurant name: ${restaurantName}`);
    const repo = new RestaurantManagerRepository();

    const exists = await repo.findByRestaurantName(restaurantName); // checks if this restaurant name is already registered
    if (exists) {
      logger.warn(`RestaurantManager.register — name already in use: ${restaurantName}`);
      // Return a consistent RestaurantManager instance rather than the raw DB row.
      return new RestaurantManager(exists.userId, exists.restaurantName ?? restaurantName);
    }

    const userId = v4(); // generates a unique ID for this manager
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS); // hashes the password before storing

    // Propagate DB errors upward — a failed write must never silently succeed.
    await repo.createManager(userId, restaurantName, hashedPassword);

    const newManager = new RestaurantManager(userId, restaurantName); // creates the in-memory instance
    logger.info(`RestaurantManager.register — new manager created: ${userId}`);
    return newManager;
  }

  static async login(restaurantName, password) {
    logger.info(`RestaurantManager.login — attempting login for: ${restaurantName}`);
    const repo = new RestaurantManagerRepository();

    const account = await repo.findByRestaurantName(restaurantName); // looks up the manager by restaurant name
    if (!account) {
      logger.warn(`RestaurantManager.login — restaurant not found: ${restaurantName}`);
      throw new Error("Restaurant not found"); // no account exists for this restaurant name
    }

    const checkPassword = await bcrypt.compare(password, account.passwordHash); // compares input against stored hash
    if (!checkPassword) {
      logger.warn(`RestaurantManager.login — wrong password for: ${restaurantName}`);
      throw new Error("Wrong Password"); // hash does not match — reject login
    }

    // Return a proper RestaurantManager instance so callers always receive the same type.
    logger.info(`RestaurantManager.login — authenticated: ${account.userId}`);
    return new RestaurantManager(account.userId, account.restaurantName ?? restaurantName);
  }

  // TODO completed: logout() — overrides the abstract method on User.
  // Revokes the server-side session token and clears the HttpOnly cookie so
  // the session is permanently invalidated even if the cookie is stolen.
  static async logout(req, res) {
    await revokeToken(req); // deletes the Session row from the DB
    res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0"); // clears the cookie in the browser
    logger.info("RestaurantManager.logout — session revoked");
  }

  // ─── Instance methods ─────────────────────────────────────────────────────────

  // Returns this manager's public profile, extending the base User profile.
  getProfile() {
    return {
      ...super.getProfile(),
      restaurantName: this.restaurantName,
    };
  }
}