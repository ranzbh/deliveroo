import { v4 } from "uuid"; // generates a unique ID for each new order
import OrderRepository from "../Database/OrderRepository.mjs"; // persists orders and their items
import { errorController } from "./ErrorController.mjs"; // sends error pages on failure
import { HTTP_STATUS, OrderStatus, OrderLimits, UserRoles } from "../Utils/constants.mjs"; // status constants and business rule limits
import { parseBody } from "../Utils/bodyParser.mjs"; // reads and decodes the POST request body
import { verifyToken } from "../Utils/token.mjs"; // reads the session cookie to identify the logged-in customer
import { renderHTML, trustedHTML } from "../Utils/renderHTML.mjs"; // renders an HTML template; trustedHTML marks server-built markup safe
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log
import { AddToCartDTO } from "../Filters/AddToCartDTO.mjs"; // validates add-to-cart input
import { CreateOrderDTO } from "../Filters/CreateOrderDTO.mjs"; // validates create-order input
import { CancelOrderDTO } from "../Filters/CancelOrderDTO.mjs"; // validates cancel-order input
import { Guard } from "../Guard/Guard.mjs"; // chainable auth + role + ownership guard

const repository = new OrderRepository(); // single repository instance reused across all handlers

export const orderController = {
  // handles POST /cart/add — adds one item to the customer's in-progress cart for a restaurant
  addToCart: async (req, res) => {
    try {
      const guard = await new Guard().authenticate(req);
      guard.authorize(UserRoles.CUSTOMER); // only customers may add to cart
      const { userId } = guard.payload;
      const raw = await parseBody(req);
      const dto = new AddToCartDTO(raw); // validates: restaurantId UUID, itemName not empty max 100, price 0–9999.99

      let cartOrder = await repository.findCartOrder(userId, dto.restaurantId);
      if (!cartOrder) {
        const activeOrders = await repository.findActiveByCustomerId(userId);
        if (activeOrders.length >= OrderLimits.MAX_ACTIVE_ORDERS) {
          logger.warn(`addToCart: userId ${userId} hit MAX_ACTIVE_ORDERS limit`);
          return errorController(HTTP_STATUS.BAD_REQUEST, req, res);
        }
        const orderId = v4();
        await repository.createOrder(orderId, userId, dto.restaurantId, OrderStatus.INCOMPLETE);
        cartOrder = { orderId };
        logger.info(`New cart order created: ${orderId} for userId ${userId}`);
      }

      await repository.addOrderItem(cartOrder.orderId, dto.itemName, dto.itemPrice);
      logger.debug(`Item added to order ${cartOrder.orderId}: ${dto.itemName} @ $${dto.itemPrice}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: `/restaurant/menu?id=${dto.restaurantId}` });
      res.end();
    } catch (err) {
      logger.error(`addToCart failed: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },

  // handles POST /order/create — submits the customer's existing cart for this restaurant
  create: async (req, res) => {
    try {
      const guard = await new Guard().authenticate(req);
      guard.authorize(UserRoles.CUSTOMER); // only customers may place orders
      const { userId } = guard.payload;
      const raw = await parseBody(req);
      const dto = new CreateOrderDTO(raw); // validates: restaurantId is a valid UUID

      const cartOrder = await repository.findCartOrder(userId, dto.restaurantId);
      if (!cartOrder) {
        logger.warn(`create order: no cart found for userId ${userId}, restaurantId ${dto.restaurantId}`);
        return errorController(HTTP_STATUS.BAD_REQUEST, req, res);
      }

      // Ensure the cart has at least one item before submitting
      const cartItems = await repository.findItemsByOrderId(cartOrder.orderId);
      if (!cartItems.length) {
        logger.warn(`create order: cart ${cartOrder.orderId} is empty`);
        return errorController(HTTP_STATUS.BAD_REQUEST, req, res);
      }

      await repository.updateStatus(cartOrder.orderId, OrderStatus.SUBMITTED);
      logger.info(`Order submitted: ${cartOrder.orderId} by userId ${userId}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: `/order?id=${cartOrder.orderId}` });
      res.end();
    } catch (err) {
      logger.error(`create order failed: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },

  // handles GET /order?id=... — renders the order detail page for the logged-in customer
  view: async (req, res) => {
    try {
      const guard = await new Guard().authenticate(req);
      guard.authorize(UserRoles.CUSTOMER); // only customers view their own orders
      const { userId } = guard.payload;
      const url = new URL(req.url, `http://${req.headers.host}`); // parses the URL to extract query params
      const orderId = url.searchParams.get("id"); // reads the order ID from the ?id= query string

      if (!orderId) {
        logger.warn(`view order: missing orderId from userId ${userId}`);
        return errorController(HTTP_STATUS.BAD_REQUEST, req, res);
      }

      const order = await repository.findById(orderId); // fetches the order row from the DB
      if (!order) {
        logger.warn(`view order: order ${orderId} not found`);
        return errorController(HTTP_STATUS.NOT_FOUND, req, res); // sends 404 if the order doesn't exist
      }

      // Use Guard.requireOwnership so the ownership pattern is consistent across the codebase.
      // Throws if the authenticated customer does not own this order (403 Forbidden).
      guard.requireOwnership(order.customerId);

      const items = await repository.findItemsByOrderId(orderId); // fetches all items belonging to this order

      // Server-built HTML — mark as trusted so renderHTML does not double-escape the tags
      const orderItems = trustedHTML(
        items.length
          ? items.map(i => `<li>${i.itemName} — $${Number(i.price).toFixed(2)}</li>`).join("") // builds the item list HTML
          : "<li class='empty'>No items in this order.</li>", // fallback when the order has no items yet
      );
      const totalPrice = items.reduce((sum, i) => sum + Number(i.price), 0).toFixed(2); // sums item prices to two decimals

      logger.debug(`Order ${orderId} viewed by userId ${userId}`);
      await renderHTML(res, "Customer-OrderView.html", {
        orderId:     order.orderId,  // plain string — escaped automatically
        orderStatus: order.status,   // plain string — escaped automatically
        orderItems,                  // trustedHTML — server-built <li> markup
        totalPrice,                  // plain string — escaped automatically
      });
    } catch (err) {
      logger.warn(`view order failed: ${err.message}`);
      errorController(HTTP_STATUS.UNAUTHORIZED, req, res); // sends 401 if token is missing or expired
    }
  },

  // handles POST /order/cancel — cancels an existing order if it has not yet been picked up
  cancel: async (req, res) => {
    try {
      const guard = await new Guard().authenticate(req);
      guard.authorize(UserRoles.CUSTOMER); // only customers may cancel orders
      const { userId } = guard.payload;
      const raw = await parseBody(req);
      const dto = new CancelOrderDTO(raw); // validates: orderId is a valid UUID

      const order = await repository.findById(dto.orderId); // fetches the order to verify ownership and current status
      if (!order) {
        logger.warn(`cancel order: order ${dto.orderId} not found`);
        return errorController(HTTP_STATUS.NOT_FOUND, req, res); // sends 404 if the order doesn't exist
      }
      // Use Guard.requireOwnership — consistent with the pattern used in view()
      guard.requireOwnership(order.customerId);
      if (order.status === OrderStatus.ONTHEWAY || order.status === OrderStatus.DELIVERED) {
        // Can't cancel once a courrier has picked it up
        logger.warn(`cancel order: order ${dto.orderId} cannot be cancelled — status is "${order.status}"`);
        return errorController(HTTP_STATUS.BAD_REQUEST, req, res);
      }

      await repository.updateStatus(dto.orderId, OrderStatus.INCOMPLETE); // marks the order as Incomplete Cart (cancelled)
      logger.info(`Order ${dto.orderId} cancelled by userId ${userId}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/home" }); // redirects back to the customer home page
      res.end();
    } catch (err) {
      logger.error(`cancel order failed: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res); // sends 500 if anything goes wrong
    }
  },
};