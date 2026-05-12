export default class User {
  // An abstract class — cannot be instantiated directly, only extended by subclasses

  constructor(userId) {
    if (this.constructor === User) {
      throw new Error("You cannot instantiate an Abstract Class `User`"); // enforces that only subclasses can be instantiated
    }
    this.userId = userId; // every user type (Customer, Courrier, Manager) shares this base property
    this.createdAt = new Date().toISOString(); // timestamps every user instance at creation
  }

  // ─── Abstract static methods ─────────────────────────────────────────────────
  // Every subclass MUST override these. Calling them directly on User or on a
  // subclass that forgot to override will throw a descriptive error immediately.

  static async register() {
    if (this === User) {
      throw new Error("Cannot call register() from an abstract class");
    }
    throw new Error(`${this.name} must implement register()`);
  }

  static async login() {
    if (this === User) {
      throw new Error("Cannot call login() from an abstract class");
    }
    throw new Error(`${this.name} must implement login()`);
  }

  // TODO completed: logout() abstract contract — every subclass (Customer, Courrier,
  // RestaurantManager) must override this to revoke the session token and clear the
  // cookie. Calling it on the base class or a subclass that forgot to override throws.
  static async logout() {
    if (this === User) {
      throw new Error("Cannot call logout() from an abstract class");
    }
    throw new Error(`${this.name} must implement logout()`);
  }

  // ─── Shared instance methods ──────────────────────────────────────────────────

  // Returns a safe, serialisable snapshot of the user's public identity.
  // Subclasses can override this to include their own extra fields (e.g. email,
  // phoneNumber, restaurantName) while still calling super.getProfile().
  getProfile() {
    return {
      userId: this.userId,
      createdAt: this.createdAt,
      role: this.constructor.name, // "Customer" | "Courrier" | "RestaurantManager"
    };
  }
}