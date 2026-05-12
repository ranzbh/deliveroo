import { v4 } from "uuid"; // generates a unique ID for each order item

export default class OrderItem {
  constructor(name, price, description = "", quantity = 1) {
    this.orderItemId = v4(); // unique identifier for this item instance
    this.name = name; // item name (e.g. "Chicken Burger")

    // Validate price on construction so bad data never silently enters an order
    const parsedPrice = Number(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      throw new Error(`OrderItem: invalid price "${price}" for item "${name}"`);
    }
    this.price = parsedPrice; // item price — used by Order to calculate totalPrice

    this.description = description; // short description of the item

    // TODO completed: quantity field — previously each call to addItem() pushed a new
    // OrderItem instance rather than incrementing a count.  Now every item tracks its
    // own quantity so duplicate additions can be aggregated correctly.
    const parsedQty = Number(quantity);
    if (!Number.isInteger(parsedQty) || parsedQty < 1) {
      throw new Error(`OrderItem: quantity must be a positive integer, got "${quantity}"`);
    }
    this.quantity = parsedQty;
  }

  // ─── Instance methods ─────────────────────────────────────────────────────────

  // Increments the quantity by the given amount (default 1).
  // Returns the new quantity so callers can log or display it.
  incrementQuantity(by = 1) {
    if (!Number.isInteger(by) || by < 1) {
      throw new Error(`incrementQuantity: "by" must be a positive integer, got "${by}"`);
    }
    this.quantity += by;
    return this.quantity;
  }

  // Decrements the quantity; throws if the result would fall below 1.
  // The caller is responsible for removing the item from the order when quantity hits 0.
  decrementQuantity(by = 1) {
    if (!Number.isInteger(by) || by < 1) {
      throw new Error(`decrementQuantity: "by" must be a positive integer, got "${by}"`);
    }
    if (this.quantity - by < 0) {
      throw new Error(`decrementQuantity: cannot reduce quantity below 0 for item "${this.name}"`);
    }
    this.quantity -= by;
    return this.quantity;
  }

  // Returns the line-item total (unit price × quantity).
  getLineTotal() {
    return Number((this.price * this.quantity).toFixed(2));
  }

  // not STATIC — must be called on an instance, not on the class itself.
  // Returns a plain-object snapshot of this item — safe to send as a response.
  getItemInfo() {
    return {
      orderItemId: this.orderItemId,
      name: this.name,
      price: this.price,
      description: this.description,
      quantity: this.quantity,
      lineTotal: this.getLineTotal(),
    };
  }
}