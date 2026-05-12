import { v4 } from "uuid";
import RestaurantManager from "../Models/RestaurantManager.mjs"; // Manager model — register, login, and logout logic
import DeliveryAssignment from "../Models/DeliveryAssignment.mjs"; // creates and updates delivery assignments
import { errorController } from "./ErrorController.mjs"; // sends error pages on failure
import { HTTP_STATUS, UserRoles, OrderStatus } from "../Utils/constants.mjs"; // role, status, and order status constants
import { parseBody } from "../Utils/bodyParser.mjs"; // reads and decodes the POST request body
import { issueToken, verifyToken } from "../Utils/token.mjs"; // issues and verifies session token cookies
import { renderHTML, trustedHTML } from "../Utils/renderHTML.mjs"; // renders an HTML template; trustedHTML marks server-built markup safe
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log
import RestaurantRepository from "../Database/RestaurantRepository.mjs";
import OrderRepository from "../Database/OrderRepository.mjs";
import CourrierRepository from "../Database/CourrierRepository.mjs";
import { ManagerRegisterDTO } from "../Filters/ManagerRegisterDTO.mjs"; // validates register input
import { ManagerLoginDTO } from "../Filters/ManagerLoginDTO.mjs"; // validates login input
import { AddMenuItemDTO } from "../Filters/AddMenuItemDTO.mjs"; // validates menu item input
import { AssignCourierDTO } from "../Filters/AssignCourierDTO.mjs"; // validates assign courrier input
import { Guard } from "../Guard/Guard.mjs"; // chainable auth + role guard

const restaurantRepo = new RestaurantRepository();
const orderRepo = new OrderRepository();
const courrierRepo = new CourrierRepository();

export const restaurantController = {
  // handles POST /restaurant/register — creates a new restaurant manager account and logs them in
  register: async (req, res) => {
    try {
      const raw = await parseBody(req);
      const dto = new ManagerRegisterDTO(raw); // validates: name 2–100 chars, password 8–128 chars, collapses whitespace

      const manager = await RestaurantManager.register(dto.restaurantName, dto.password);
      // Create the restaurant record only if one doesn't exist for this manager yet
      const existingRestaurant = await restaurantRepo.findByManagerId(manager.userId);
      if (!existingRestaurant) {
        await restaurantRepo.createRestaurant(v4(), dto.restaurantName, manager.userId);
        logger.info(`Restaurant created: "${dto.restaurantName}" for managerId ${manager.userId}`);
      }
      await issueToken(res, manager, UserRoles.MANAGER); // generates a session token and sets it as an HttpOnly cookie
      logger.info(`Restaurant manager registered: "${dto.restaurantName}"`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/restaurant/dashboard" });
      res.end();
    } catch (err) {
      logger.error(`Restaurant registration failed: ${err.message}`);
      errorController(HTTP_STATUS.BAD_REQUEST, req, res);
    }
  },

  // handles POST /restaurant/login — verifies credentials and issues a session cookie
  login: async (req, res) => {
    try {
      const raw = await parseBody(req);
      const dto = new ManagerLoginDTO(raw); // validates: name not empty, max 100 chars, password not empty, max 128 chars
      const manager = await RestaurantManager.login(dto.restaurantName, dto.password);
      await issueToken(res, manager, UserRoles.MANAGER); // generates a session token and sets it as an HttpOnly cookie
      logger.info(`Restaurant manager logged in: "${dto.restaurantName}"`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/restaurant/dashboard" });
      res.end();
    } catch (err) {
      logger.warn(`Restaurant manager login failed: ${err.message}`);
      errorController(HTTP_STATUS.UNAUTHORIZED, req, res);
    }
  },

  // handles POST /restaurant/logout — revokes the session token and clears the cookie
  logout: async (req, res) => {
    try {
      await RestaurantManager.logout(req, res); // delegates token revocation and cookie clearing to the RestaurantManager model
      logger.info("Restaurant manager logged out");
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/login" });
      res.end();
    } catch (err) {
      logger.error(`Restaurant manager logout failed: ${err.message}`);
      // Even if revocation fails, clear the cookie and redirect — fail-safe logout
      res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0");
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/login" });
      res.end();
    }
  },

  // handles GET /restaurant/dashboard — renders the manager dashboard with live menu and order data
  dashboard: async (req, res) => {
    try {
      // Only Managers may view this dashboard — Customers and Couriers are rejected
      const guard = await new Guard().authenticate(req);
      guard.authorize(UserRoles.MANAGER);
      const { userId, restaurantName } = guard.payload;
      logger.debug(`Restaurant dashboard requested by managerId: ${userId}`);
      const restaurant = await restaurantRepo.findByManagerId(userId);
      let menuItems = trustedHTML("<li class='empty'>No menu items yet.</li>");
      let orders    = trustedHTML("<li class='empty'>No pending orders.</li>");

      if (restaurant) {
        const items = await restaurantRepo.findMenuByRestaurantId(restaurant.restaurantId);
        if (items.length) {
          menuItems = trustedHTML(
            items.map(i => `<li>${i.name} — $${Number(i.price).toFixed(2)}</li>`).join(""),
          );
        }

        const pendingOrders = await orderRepo.findByRestaurantId(restaurant.restaurantId);
        if (pendingOrders.length) {
          const couriers = await courrierRepo.findAll();
          const courierOptions = couriers.length
            ? couriers.map(c => `<option value="${c.userId}">${c.phoneNumber}</option>`).join("")
            : `<option disabled>No couriers registered</option>`;

          orders = trustedHTML(
            pendingOrders.map(o => {
              // Only allow assigning a courier to orders that are in Submitted state
              const canAssign = o.status === OrderStatus.SUBMITTED;
              const assignForm = canAssign
                ? `<form method="POST" action="/order/assign" style="display:inline; margin-left:1rem;">
                     <input type="hidden" name="orderId" value="${o.orderId}" />
                     <select name="courierId">${courierOptions}</select>
                     <button type="submit">Assign Courier</button>
                   </form>`
                : "";
              return `<li>Order ${o.orderId} — <strong>${o.status}</strong>${assignForm}</li>`;
            }).join(""),
          );
        }
      }

      await renderHTML(res, "Dash-ManagerView.html", {
        restaurantName, // plain string — escaped automatically
        orders,         // trustedHTML — server-built <li><form> markup
        menuItems,      // trustedHTML — server-built <li> markup
      });
    } catch (err) {
      logger.warn(`Restaurant dashboard access denied — redirecting to login: ${err.message}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/restaurant/login" });
      res.end();
    }
  },

  // handles POST /restaurant/menu/add — adds a new item to the manager's restaurant menu
  addMenuItem: async (req, res) => {
    try {
      const guard = await new Guard().authenticate(req);
      guard.authorize(UserRoles.MANAGER); // only managers may add menu items
      const { userId } = guard.payload;
      const raw = await parseBody(req);
      const dto = new AddMenuItemDTO(raw); // validates: name 2–100 chars, price 0–9999.99, description max 500 chars

      const restaurant = await restaurantRepo.findByManagerId(userId);
      if (!restaurant) {
        logger.warn(`addMenuItem: no restaurant found for managerId ${userId}`);
        return errorController(HTTP_STATUS.NOT_FOUND, req, res);
      }

      const itemId = v4();
      await restaurantRepo.addMenuItem(itemId, restaurant.restaurantId, dto.name, dto.price, dto.description ?? "");
      logger.info(`Menu item added: "${dto.name}" ($${dto.price}) to restaurant ${restaurant.restaurantId}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/restaurant/dashboard" });
      res.end();
    } catch (err) {
      logger.error(`addMenuItem failed: ${err.message}`);
      errorController(HTTP_STATUS.BAD_REQUEST, req, res);
    }
  },

  // handles POST /order/assign — assigns a courier to a submitted order and marks it Preparing
  assignCourier: async (req, res) => {
    try {
      const guard = await new Guard().authenticate(req);
      guard.authorize(UserRoles.MANAGER); // only managers may assign couriers
      const { userId } = guard.payload;
      const raw = await parseBody(req);
      const dto = new AssignCourierDTO(raw); // validates: both orderId and courierId are valid UUIDs

      const order = await orderRepo.findById(dto.orderId);
      if (!order) {
        logger.warn(`assignCourier: order ${dto.orderId} not found`);
        return errorController(HTTP_STATUS.NOT_FOUND, req, res);
      }

      // Authenticated but not the owner of this restaurant — 403 Forbidden, not 401 Unauthorized
      const restaurant = await restaurantRepo.findByManagerId(userId);
      if (!restaurant || restaurant.restaurantId !== order.restaurantId) {
        logger.warn(`assignCourier: managerId ${userId} is not authorised to assign order ${dto.orderId}`);
        return errorController(HTTP_STATUS.FORBIDDEN, req, res);
      }

      // Only allow assignment when the order is in Submitted state
      if (order.status !== OrderStatus.SUBMITTED) {
        logger.warn(`assignCourier: order ${dto.orderId} cannot be assigned — status is "${order.status}"`);
        return errorController(HTTP_STATUS.BAD_REQUEST, req, res);
      }

      await DeliveryAssignment.create(dto.orderId, dto.courierId); // creates the assignment row in the DB
      await orderRepo.updateStatus(dto.orderId, OrderStatus.PREPARING); // advances the order lifecycle
      logger.info(`Order ${dto.orderId} assigned to courierId ${dto.courierId} by managerId ${userId}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/restaurant/dashboard" });
      res.end();
    } catch (err) {
      logger.error(`assignCourier failed: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },
};