import { errorController } from "./ErrorController.mjs"; // sends error pages on failure
import { sendHTML } from "../Utils/sendHTML.mjs"; // sends a static HTML file with no data injection
import { sendCSS } from "../Utils/sendCSS.mjs"; // reads and sends a CSS file from Views/Styles/
import { renderHTML, trustedHTML } from "../Utils/renderHTML.mjs"; // renders an HTML template; trustedHTML marks server-built markup safe
import { verifyToken } from "../Utils/token.mjs"; // reads and verifies the session token from the request cookie
import { HTTP_STATUS, UserRoles } from "../Utils/constants.mjs"; // HTTP status code constants and role constants
import { Guard } from "../Guard/Guard.mjs"; // chainable auth + role guard
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log
import RestaurantRepository from "../Database/RestaurantRepository.mjs"; // reads restaurant and menu data from the DB
import OrderRepository from "../Database/OrderRepository.mjs"; // reads the customer's active cart for this restaurant

const restaurantRepo = new RestaurantRepository(); // single instance reused across all page handlers
const orderRepo = new OrderRepository();

export const pageController = {
  // serves GET /login — static login form, no data injection needed
  login: async (req, res) => {
    try {
      await sendHTML(res, "Auth-LoginView.html");
    } catch (err) {
      logger.error(`Failed to serve login page: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },

  // serves GET /register — static registration form, no data injection needed
  register: async (req, res) => {
    try {
      await sendHTML(res, "Auth-RegisterView.html");
    } catch (err) {
      logger.error(`Failed to serve register page: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },

  // serves GET /home — renders the customer home page with their email and restaurant list
  home: async (req, res) => {
    try {
      // authenticate() verifies the session token; authorize() ensures only Customers
      // reach this page — Managers and Couriers are redirected to login instead.
      const guard = await new Guard().authenticate(req);
      guard.authorize(UserRoles.CUSTOMER);
      const { userEmail } = guard.payload;
      logger.debug(`Home page requested by: ${userEmail}`);
      const restaurants = await restaurantRepo.findAll(); // fetches every restaurant row from the DB
      const restaurantList = trustedHTML(
        restaurants.length
          ? restaurants.map(r => `<li><a href="/restaurant/menu?id=${r.restaurantId}">${r.restaurantName}</a></li>`).join("") // each restaurant links to its menu page
          : "<li class='empty'>No restaurants available yet.</li>", // fallback when no restaurants are registered
      );
      await renderHTML(res, "User-HomeView.html", {
        userEmail,      // plain string — escaped automatically
        restaurantList, // trustedHTML — server-built <li><a> markup
      });
    } catch (err) {
      logger.warn(`Home page access denied — redirecting to login: ${err.message}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/login" }); // token missing, expired, or wrong role
      res.end();
    }
  },

  // serves GET /restaurant/menu?id=... — renders a restaurant's menu page for a logged-in customer
  restaurantMenu: async (req, res) => {
    try {
      const guard = await new Guard().authenticate(req);
      guard.authorize(UserRoles.CUSTOMER); // only customers browse menus
      const { userId } = guard.payload;
      const url = new URL(req.url, `http://${req.headers.host}`);
      const restaurantId = url.searchParams.get("id");

      if (!restaurantId) {
        logger.warn(`restaurantMenu: missing restaurantId from userId ${userId}`);
        return errorController(HTTP_STATUS.BAD_REQUEST, req, res);
      }

      const restaurant = await restaurantRepo.findById(restaurantId);
      if (!restaurant) {
        logger.warn(`restaurantMenu: restaurant ${restaurantId} not found`);
        return errorController(HTTP_STATUS.NOT_FOUND, req, res);
      }

      logger.debug(`Menu page for restaurant ${restaurantId} requested by userId ${userId}`);

      const items = await restaurantRepo.findMenuByRestaurantId(restaurantId);
      const menuItems = trustedHTML(
        items.length
          ? items.map(i =>
              `<li>
                <span>${i.name} — $${Number(i.price).toFixed(2)}</span>
                <br><small>${i.description ?? ""}</small>
                <form method="POST" action="/cart/add" style="display:inline; margin-left:1rem;">
                  <input type="hidden" name="restaurantId" value="${restaurantId}" />
                  <input type="hidden" name="itemName" value="${i.name}" />
                  <input type="hidden" name="itemPrice" value="${i.price}" />
                  <button type="submit">+ Add</button>
                </form>
              </li>`).join("")
          : "<li class='empty'>No menu items yet.</li>",
      );

      // Load any existing in-progress cart for this customer + restaurant
      const cartOrder = await orderRepo.findCartOrder(userId, restaurantId);
      let cartItems = trustedHTML("<li class='empty'>Your cart is empty.</li>");
      let totalPrice = "0.00";
      let checkoutDisabled = "disabled";

      if (cartOrder) {
        const cartRows = await orderRepo.findItemsByOrderId(cartOrder.orderId);
        if (cartRows.length) {
          cartItems = trustedHTML(
            cartRows
              .map(i => `<li>${i.itemName} × ${i.quantity} — $${(Number(i.price) * i.quantity).toFixed(2)}</li>`)
              .join(""),
          );
          totalPrice = cartRows
            .reduce((sum, i) => sum + Number(i.price) * i.quantity, 0)
            .toFixed(2);
          checkoutDisabled = "";
        }
      }

      await renderHTML(res, "Customer-RestaurantMenuView.html", {
        restaurantName:   restaurant.restaurantName, // plain string — escaped automatically
        menuItems,        // trustedHTML — server-built <li><form> markup
        cartItems,        // trustedHTML — server-built <li> markup
        totalPrice,       // plain string — escaped automatically
        restaurantId,     // plain string — escaped automatically
        checkoutDisabled, // plain string ("" or "disabled") — escaped automatically
      });
    } catch (err) {
      logger.warn(`restaurantMenu access denied — redirecting to login: ${err.message}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/login" });
      res.end();
    }
  },

  // serves GET /restaurant/register — static registration form for restaurant managers
  restaurantRegister: async (req, res) => {
    try {
      await sendHTML(res, "Restaurant-RegisterView.html");
    } catch (err) {
      logger.error(`Failed to serve restaurant register page: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },

  // serves GET /restaurant/login — static login form for restaurant managers
  restaurantLogin: async (req, res) => {
    try {
      await sendHTML(res, "Restaurant-LoginView.html");
    } catch (err) {
      logger.error(`Failed to serve restaurant login page: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },

  // serves GET /courrier/register — static registration form for couriers
  courrierRegister: async (req, res) => {
    try {
      await sendHTML(res, "Courrier-RegisterView.html");
    } catch (err) {
      logger.error(`Failed to serve courrier register page: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },

  // serves GET /courrier/login — static login form for couriers
  courrierLogin: async (req, res) => {
    try {
      await sendHTML(res, "Courrier-LoginView.html");
    } catch (err) {
      logger.error(`Failed to serve courrier login page: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },

  // serves GET /index.css — stylesheet for login and register pages
  styleIndex: async (req, res) => {
    try {
      await sendCSS(res, "index.css");
    } catch (err) {
      logger.error(`Failed to serve index.css: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },

  // serves GET /error.css — stylesheet for all error pages
  styleError: async (req, res) => {
    try {
      await sendCSS(res, "error.css");
    } catch (err) {
      logger.error(`Failed to serve error.css: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },

  // serves GET /dashboard.css — stylesheet for all dashboard pages
  styleDashboard: async (req, res) => {
    try {
      await sendCSS(res, "dashboard.css");
    } catch (err) {
      logger.error(`Failed to serve dashboard.css: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  },
};