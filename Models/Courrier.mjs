import User from "./User.mjs"; // inherits the abstract User base class
import { v4 } from "uuid"; // generates a unique ID for each new courrier
import bcrypt from "bcrypt"; // handles password hashing and comparison
import { SALT_ROUNDS } from "../Utils/constants.mjs"; // shared bcrypt cost factor
import CourrierRepository from "../Database/CourrierRepository.mjs"; // data access layer for Courrier
import { revokeToken } from "../Utils/token.mjs"; // deletes the Session row from the DB on logout
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log

export default class Courrier extends User {
  constructor(userId, phoneNumber) {
    super(userId); // calls User constructor — sets this.userId and this.createdAt
    this.phoneNumber = phoneNumber; // couriers are identified by phone number
  }

  // ─── Static auth methods ──────────────────────────────────────────────────────

  static async register(phoneNumber, password) {
    logger.info(`Courrier.register — checking phone number: ${phoneNumber}`);
    const repo = new CourrierRepository();

    const phoneExists = await repo.findByPhoneNumber(phoneNumber); // checks if this phone number is already registered
    if (phoneExists) {
      logger.warn(`Courrier.register — phone number already in use: ${phoneNumber}`);
      // Return a consistent Courrier instance rather than the raw DB row.
      return new Courrier(phoneExists.userId, phoneExists.phoneNumber ?? phoneNumber);
    }

    const userId = v4(); // generates a unique ID for this courrier
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS); // hashes the password before storing

    // Propagate DB errors upward — a failed write must never silently succeed.
    await repo.createCourrier(userId, phoneNumber, hashedPassword);

    const newCourrier = new Courrier(userId, phoneNumber); // creates the in-memory Courrier instance
    logger.info(`Courrier.register — new courrier created: ${userId}`);
    return newCourrier;
  }

  static async login(phoneNumber, password) {
    logger.info(`Courrier.login — attempting login for: ${phoneNumber}`);
    const repo = new CourrierRepository();

    const account = await repo.findByPhoneNumber(phoneNumber); // looks up the courrier by phone number
    if (!account) {
      logger.warn(`Courrier.login — phone number not found: ${phoneNumber}`);
      throw new Error("Phone number not found"); // no account exists for this phone number
    }

    const checkPassword = await bcrypt.compare(password, account.passwordHash); // compares input against stored hash
    if (!checkPassword) {
      logger.warn(`Courrier.login — wrong password for: ${phoneNumber}`);
      throw new Error("Wrong Password"); // hash does not match — reject login
    }

    // Return a proper Courrier instance so callers always receive the same type.
    logger.info(`Courrier.login — authenticated: ${account.userId}`);
    return new Courrier(account.userId, account.phoneNumber ?? phoneNumber);
  }

  // TODO completed: logout() — overrides the abstract method on User.
  // Revokes the server-side session token and clears the HttpOnly cookie.
  static async logout(req, res) {
    await revokeToken(req); // deletes the Session row from the DB
    res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0"); // clears the cookie in the browser
    logger.info("Courrier.logout — session revoked");
  }

  // ─── Instance methods ─────────────────────────────────────────────────────────

  // Returns this courrier's public profile, extending the base User profile.
  getProfile() {
    return {
      ...super.getProfile(),
      phoneNumber: this.phoneNumber,
    };
  }
}