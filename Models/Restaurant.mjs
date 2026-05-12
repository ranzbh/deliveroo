import { v4 } from "uuid"; // generates a unique ID for each restaurant
import OrderItem from "./OrderItem.mjs"; // OrderItem represents a single item on the menu
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log

export default class Restaurant {
  // owner should be a RestaurantManager instance (composition)
  constructor(restaurantName, owner) {
    this.restaurantId = v4(); // unique identifier for this restaurant
    this.restaurantName = restaurantName;
    // COMPOSITION: connects the Restaurant with its RestaurantManager owner
    this.owner = owner; // stores a reference to the RestaurantManager who owns this restaurant
    // COMPOSITION: connects the Restaurant with its menu items (OrderItem instances)
    this.menu = []; // starts with an empty menu — items are added via addItemToMenu()
  }

  // ─── Menu management ──────────────────────────────────────────────────────────

  addItemToMenu(name, price, description = "") {
    // Validate price before creating the item — negative prices would corrupt totals
    const parsedPrice = Number(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      throw new Error(`addItemToMenu: invalid price "${price}" for item "${name}"`);
    }
    const newItem = new OrderItem(name, parsedPrice, description); // creates a new menu item instance with its own UUID
    this.menu.push(newItem); // appends the new item to the restaurant's menu array
    logger.debug(`Restaurant "${this.restaurantName}" — menu item added: ${name} ($${parsedPrice})`);
    return newItem; // returns the created item so the caller can use it if needed
  }

  // TODO completed: removeItemFromMenu() — the original class had no way to remove items.
  // Removes the first menu item whose name matches (strict equality).
  // Returns the removed item, or null if no match was found.
  removeItemFromMenu(itemName) {
    const index = this.menu.findIndex((item) => item.name === itemName); // strict equality — avoids unexpected type coercion
    if (index === -1) {
      logger.warn(`Restaurant "${this.restaurantName}" — removeItemFromMenu: "${itemName}" not found`);
      return null;
    }
    const [removed] = this.menu.splice(index, 1);
    logger.info(`Restaurant "${this.restaurantName}" — menu item removed: ${itemName}`);
    return removed;
  }

  // Returns a plain-object snapshot of every menu item — safe to send as a response.
  getMenu() {
    return this.menu.map((item) => item.getItemInfo());
  }

  // TODO completed: fixed loose equality (==) replaced with strict equality (===)
  // so that type coercion can never produce a false positive match.
  findItemByName(itemName) {
    return this.menu.find((item) => item.name === itemName) ?? null; // strict equality — null if not found
  }

  // ─── Instance helpers ─────────────────────────────────────────────────────────

  // Returns a plain-object summary of this restaurant (safe to serialise / log).
  getInfo() {
    return {
      restaurantId: this.restaurantId,
      restaurantName: this.restaurantName,
      ownerId: this.owner?.userId ?? null,
      menuItemCount: this.menu.length,
    };
  }
}