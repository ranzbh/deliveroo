import { authController } from "./AuthController.mjs"; // handles login, logout, and customer registration
import { pageController } from "./PageController.mjs"; // handles serving HTML pages and CSS files
import { courrierController } from "./CourrierController.mjs"; // handles courrier auth and dashboard
import { restaurantController } from "./RestaurantController.mjs"; // handles restaurant manager auth and dashboard
import { orderController } from "./OrderController.mjs"; // handles order creation, viewing, and cancellation
import { createRouter } from "./Router.mjs"; // factory function that creates a Router instance
import { logger } from "../Utils/Logger.mjs"; // structured logger — logs route registration at startup

const router = createRouter(); // creates a new Router instance with an empty routes table

// ─── Pages ───────────────────────────────────────────────────────────────────
router.add("GET", "/", pageController.login); // unauthenticated root visit lands on login, not the protected home page
router.add("GET", "/login", pageController.login); // serves the login form
router.add("GET", "/register", pageController.register); // serves the registration form
router.add("GET", "/home", pageController.home); // serves the customer home page

// ─── Styles ──────────────────────────────────────────────────────────────────
router.add("GET", "/index.css",     pageController.styleIndex);     // serves the login/register stylesheet
router.add("GET", "/error.css",     pageController.styleError);     // serves the error pages stylesheet
router.add("GET", "/dashboard.css", pageController.styleDashboard); // serves the dashboard pages stylesheet

// ─── Customer Auth ───────────────────────────────────────────────────────────
router.add("POST", "/auth/register", authController.register); // handles customer registration form submission
router.add("POST", "/auth/login",    authController.login);    // handles customer login form submission
router.add("POST", "/auth/logout",   authController.logout);   // handles customer logout

// ─── Courrier ─────────────────────────────────────────────────────────────────
router.add("GET",  "/courrier/register",  pageController.courrierRegister);  // serves the courrier registration form
router.add("GET",  "/courrier/login",     pageController.courrierLogin);      // serves the courrier login form
router.add("GET",  "/courrier/dashboard", courrierController.dashboard);      // serves the courrier dashboard
router.add("POST", "/courrier/register",  courrierController.register);       // handles courrier registration
router.add("POST", "/courrier/login",     courrierController.login);          // handles courrier login
router.add("POST", "/courrier/logout",    courrierController.logout);         // handles courrier logout
router.add("POST", "/courrier/status",    courrierController.updateStatus);   // handles delivery status update from the courrier dashboard

// ─── Restaurant Manager ───────────────────────────────────────────────────────
router.add("GET",  "/restaurant/register",  pageController.restaurantRegister);    // serves the manager registration form
router.add("GET",  "/restaurant/login",     pageController.restaurantLogin);       // serves the manager login form
router.add("GET",  "/restaurant/dashboard", restaurantController.dashboard);       // serves the manager dashboard
router.add("POST", "/restaurant/register",  restaurantController.register);        // handles manager registration
router.add("POST", "/restaurant/login",     restaurantController.login);           // handles manager login
router.add("POST", "/restaurant/logout",    restaurantController.logout);          // handles manager logout
router.add("POST", "/restaurant/menu/add",  restaurantController.addMenuItem);     // handles adding a new menu item from the manager dashboard

// ─── Restaurant Menu ──────────────────────────────────────────────────────────
router.add("GET", "/restaurant/menu", pageController.restaurantMenu); // serves the restaurant menu page — expects ?id= query param

// ─── Cart & Orders ────────────────────────────────────────────────────────────
router.add("POST", "/cart/add",      orderController.addToCart); // adds one item to the customer's in-progress cart
router.add("POST", "/order/create",  orderController.create);    // submits the in-progress cart as a placed order
router.add("GET",  "/order",         orderController.view);      // serves the order detail page — expects ?id= query param
router.add("POST", "/order/cancel",  orderController.cancel);    // handles order cancellation from the order detail page
router.add("POST", "/order/assign",  restaurantController.assignCourier); // manager assigns a courier to a submitted order

logger.info("All routes registered — router ready");

export const appRouter = router.dispatch; // exports the dispatch method — passed to http.createServer() in index.mjs