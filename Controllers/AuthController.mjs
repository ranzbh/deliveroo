import Customer from "../Models/Customer.mjs"; // Customer model — handles register, login, and logout logic
import { errorController } from "./ErrorController.mjs"; // sends error HTML pages on failure
import { HTTP_STATUS, UserRoles } from "../Utils/constants.mjs"; // role constants — used as session payload value
import { parseBody } from "../Utils/bodyParser.mjs"; // reads and decodes the POST request body
import { issueToken } from "../Utils/token.mjs"; // issues a session token cookie on successful auth
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log
import { CustomerRegisterDTO } from "../Filters/CustomerRegisterDTO.mjs"; // sanitises and validates register input
import { CustomerLoginDTO } from "../Filters/CustomerLoginDTO.mjs"; // sanitises and validates login input

export const authController = {
  // handles POST /auth/register — creates a new customer account and logs them in
  register: async (req, res) => {
    try {
      const raw = await parseBody(req);
      const dto = new CustomerRegisterDTO(raw); // validates: email format, max length, password 8–128 chars
      const customer = await Customer.register(dto.email, dto.password); // creates the customer in the DB (hashes password internally)
      await issueToken(res, customer, UserRoles.CUSTOMER); // generates a session token and sets it as an HttpOnly cookie
      logger.info(`Customer registered: ${dto.email}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/home" });
      res.end();
    } catch (err) {
      logger.error(`Customer registration failed: ${err.message}`);
      errorController(HTTP_STATUS.BAD_REQUEST, req, res); // sends 400 if validation or DB registration fails
    }
  },

  // handles POST /auth/login — verifies credentials and issues a session cookie
  login: async (req, res) => {
    try {
      const raw = await parseBody(req);
      const dto = new CustomerLoginDTO(raw); // validates: email format, password not empty, max 128 chars
      const customer = await Customer.login(dto.email, dto.password); // verifies email exists and password matches the stored hash
      await issueToken(res, customer, UserRoles.CUSTOMER); // generates a session token and sets it as an HttpOnly cookie
      logger.info(`Customer logged in: ${dto.email}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/home" });
      res.end();
    } catch (err) {
      logger.warn(`Customer login failed: ${err.message}`);
      errorController(HTTP_STATUS.UNAUTHORIZED, req, res); // sends 401 if validation fails or credentials are wrong
    }
  },

  // handles POST /auth/logout — revokes the session token and clears the cookie
  logout: async (req, res) => {
    try {
      await Customer.logout(req, res); // delegates token revocation and cookie clearing to the Customer model
      logger.info("Customer logged out");
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/login" });
      res.end();
    } catch (err) {
      logger.error(`Customer logout failed: ${err.message}`);
      // Even if revocation fails, clear the cookie and redirect — fail-safe logout
      res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0");
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/login" });
      res.end();
    }
  },
};