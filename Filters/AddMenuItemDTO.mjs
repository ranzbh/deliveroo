// Filters/AddMenuItemDTO.mjs
// Used by: POST /restaurant/menu/add  (RestaurantController.addMenuItem)
// Raw input keys from the HTML form: name, price, description

export class AddMenuItemDTO {
  constructor(rawData) {

    // ── SANITIZE ──────────────────────────────────────────────────────────────
    this.name  = (rawData.name ?? "").toString().trim();

    // parseFloat converts the string from the form body to a number.
    // If it cannot be parsed (e.g. "abc"), parseFloat returns NaN —
    // the validator below catches and rejects it.
    this.price = parseFloat(rawData.price ?? "");

    // description is optional — normalise empty string to null so we store
    // NULL in the DB instead of an empty string (matches the schema: TEXT nullable)
    const rawDesc = (rawData.description ?? "").toString().trim();
    this.description = rawDesc.length > 0 ? rawDesc : null;

    // ── VALIDATE ──────────────────────────────────────────────────────────────
    this.#validate();
  }

  #validate() {
    const errors = [];

    // NAME
    if (this.name.length < 2) {
      errors.push("Item name must be at least 2 characters");
    }
    if (this.name.length > 100) {
      errors.push("Item name must be 100 characters or less");
    }

    // PRICE
    // isNaN catches parseFloat("abc") === NaN
    // isFinite catches Infinity (parseFloat("Infinity") is technically a number)
    if (isNaN(this.price) || !isFinite(this.price)) {
      errors.push("Price must be a number");
    } else if (this.price < 0) {
      errors.push("Price cannot be negative");
    } else if (this.price > 9999.99) {
      errors.push("Price must be 9999.99 or less");
    } else {
      // Round to 2 decimal places to match DECIMAL(10,2) in the MenuItem table.
      // Without this, 9.999 would reach MySQL and be silently rounded there —
      // it is better to round explicitly so the stored value is predictable.
      this.price = Math.round(this.price * 100) / 100;
    }

    // DESCRIPTION (optional — only validate if provided)
    if (this.description !== null && this.description.length > 500) {
      errors.push("Description must be 500 characters or less");
    }

    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
  }

  // Returns the sanitised fields in the exact shape RestaurantRepository.addMenuItem() expects.
  toModel() {
    return {
      name:        this.name,
      price:       this.price,
      description: this.description,
    };
  }
}
