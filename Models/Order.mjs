import { v4 } from "uuid"; // generates a unique ID for each order
import { OrderStatus } from "../Utils/constants.mjs"; // status constants shared across order-related models
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log

export default class Order {
  #items; // private field — the list of OrderItem instances in this order, not accessible from outside

  constructor(customerId, restaurant) {
    this.orderId = v4(); // unique identifier for this order
    this.customerId = customerId; // links the order to the customer who placed it
    this.restaurant = restaurant; // links the order to the restaurant it was placed at — a Restaurant instance
    this.#items = []; // starts with an empty items list
    this.totalPrice = 0; // running total — updated each time an item is added or removed

    // TODO completed: order status tracking using the shared OrderStatus constants.
    // Every new in-memory order starts as INCOMPLETE (i.e. an open cart).
    this.status = OrderStatus.INCOMPLETE;
  }

  // ─── Item management ──────────────────────────────────────────────────────────

  // TODO completed: guard against findItemByName() returning null.
  // Previously this would crash with a TypeError when the item wasn't in the menu.
  addItem(itemName) {
    const newItem = this.restaurant.findItemByName(itemName); // looks up the item in the restaurant's menu
    if (!newItem) {
      // Fail loudly so the caller can surface a meaningful error instead of crashing
      throw new Error(`addItem: "${itemName}" not found in menu for restaurant "${this.restaurant.restaurantName}"`);
    }
    this.#items.push(newItem); // adds the found OrderItem to this order's private list
    this.totalPrice += newItem.price; // accumulates the running total
    logger.debug(`Order ${this.orderId} — item added: ${itemName} ($${newItem.price})`);
    return newItem;
  }

  // TODO completed: removeItem() — the original class had no way to remove items.
  // Removes the first occurrence of an item by name and subtracts its price from the total.
  // Returns the removed item, or null if no match was found.
  removeItem(itemName) {
    const index = this.#items.findIndex((item) => item.name === itemName);
    if (index === -1) {
      logger.warn(`Order ${this.orderId} — removeItem: "${itemName}" not in order`);
      return null;
    }
    const [removed] = this.#items.splice(index, 1);
    this.totalPrice = Math.max(0, this.totalPrice - removed.price); // never go below zero
    logger.info(`Order ${this.orderId} — item removed: ${itemName} ($${removed.price})`);
    return removed;
  }

  // Returns a read-only snapshot of all items as plain objects.
  getItems() {
    return this.#items.map((item) => item.getItemInfo());
  }

  // ─── Status management ────────────────────────────────────────────────────────

  // TODO completed: status update method using OrderStatus constants.
  // Enforces a valid transition and logs the change.
  updateStatus(newStatus) {
    const validStatuses = Object.values(OrderStatus);
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`updateStatus: "${newStatus}" is not a recognised OrderStatus`);
    }
    logger.info(`Order ${this.orderId} — status changed: ${this.status} → ${newStatus}`);
    this.status = newStatus;
  }

  // ─── Serialisation helper ─────────────────────────────────────────────────────

  // Returns a plain-object summary of this order (safe to log or return in a response).
  getInfo() {
    return {
      orderId: this.orderId,
      customerId: this.customerId,
      restaurantId: this.restaurant.restaurantId,
      restaurantName: this.restaurant.restaurantName,
      status: this.status,
      totalPrice: Number(this.totalPrice).toFixed(2),
      itemCount: this.#items.length,
    };
  }
}