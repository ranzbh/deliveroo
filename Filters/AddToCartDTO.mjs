// Filters/AddToCartDTO.mjs
// Used by: POST /cart/add  (OrderController.addToCart)
// Raw input keys from the hidden form inputs: restaurantId, itemName, itemPrice
//
// These values originate from the database (injected into the menu page by
// PageController.restaurantMenu) and come back via hidden <input> fields.
// They are still fully user-controlled — anyone can POST any value they like.

// UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AddToCartDTO {
  constructor(rawData) {

    // ── SANITIZE ──────────────────────────────────────────────────────────────
    this.restaurantId = (rawData.restaurantId ?? "").toString().trim();
    this.itemName     = (rawData.itemName     ?? "").toString().trim();
    this.itemPrice    = parseFloat(rawData.itemPrice ?? "");

    // ── VALIDATE ──────────────────────────────────────────────────────────────
    this.#validate();
  }

  #validate() {
    const errors = [];

    // RESTAURANT ID — must be a valid UUID v4
    // We validate the format here to reject garbage before touching the DB.
    // The parameterised query still protects against SQL injection even without
    // this check, but UUID validation gives a cleaner, earlier rejection.
    if (!UUID_REGEX.test(this.restaurantId)) {
      errors.push("restaurantId must be a valid UUID");
    }

    // ITEM NAME — must not be empty and must fit the DB column
    if (this.itemName.length === 0) {
      errors.push("Item name is required");
    }
    if (this.itemName.length > 100) {
      errors.push("Item name must be 100 characters or less");
    }

    // ITEM PRICE — must be a valid, finite, non-negative number
    if (isNaN(this.itemPrice) || !isFinite(this.itemPrice)) {
      errors.push("Item price must be a number");
    } else if (this.itemPrice < 0) {
      errors.push("Item price cannot be negative");
    } else if (this.itemPrice > 9999.99) {
      errors.push("Item price must be 9999.99 or less");
    } else {
      // Round to 2 decimal places to match DECIMAL(10,2) in the OrderItem table
      this.itemPrice = Math.round(this.itemPrice * 100) / 100;
    }

    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
  }

  // Returns the sanitised fields in the exact shape OrderController needs
  // to call repository.addOrderItem().
  toModel() {
    return {
      restaurantId: this.restaurantId,
      itemName:     this.itemName,
      itemPrice:    this.itemPrice,
    };
  }
}
