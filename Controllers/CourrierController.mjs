import Courrier from "../Models/Courrier.mjs"; // Courrier model — register, login, and logout logic
import { errorController } from "./ErrorController.mjs"; // sends error pages on failure
import { HTTP_STATUS, UserRoles, OrderStatus } from "../Utils/constants.mjs"; // role, status, and order status constants
import { parseBody } from "../Utils/bodyParser.mjs"; // reads and decodes the POST request body
import { issueToken, verifyToken } from "../Utils/token.mjs"; // issues and verifies session token cookies
import { renderHTML, trustedHTML } from "../Utils/renderHTML.mjs"; // renders an HTML template; trustedHTML marks server-built markup safe
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log
import DeliveryAssignmentRepository from "../Database/DeliveryAssignmentRepository.mjs"; // reads assignments for this courrier
import DeliveryAssignment from "../Models/DeliveryAssignment.mjs"; // updates assignment status
import { CourrierRegisterDTO } from "../Filters/CourrierRegisterDTO.mjs"; // validates register input
import { CourrierLoginDTO } from "../Filters/CourrierLoginDTO.mjs"; // validates login input
import { UpdateDeliveryStatusDTO } from "../Filters/UpdateDeliveryStatusDTO.mjs"; // validates status update input
import { Guard } from "../Guard/Guard.mjs"; // chainable auth + role guard

const assignmentRepo = new DeliveryAssignmentRepository(); // single instance reused across all courrier handlers

export const courrierController = {
  // handles POST /courrier/register — creates a new courrier account and logs them in
  register: async (req, res) => {
    try {
      const raw = await parseBody(req);
      const dto = new CourrierRegisterDTO(raw); // validates: phone format, password 8–128 chars
      const courrier = await Courrier.register(dto.phoneNumber, dto.password); // creates the courrier in the DB
      await issueToken(res, courrier, UserRoles.COURRIER); // generates a session token and sets it as an HttpOnly cookie
      logger.info(`Courrier registered: ${dto.phoneNumber}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/courrier/dashboard" });
      res.end();
    } catch (err) {
      logger.error(`Courrier registration failed: ${err.message}`);
      errorController(HTTP_STATUS.BAD_REQUEST, req, res);
    }
  },

  // handles POST /courrier/login — verifies credentials and issues a session cookie
  login: async (req, res) => {
    try {
      const raw = await parseBody(req);
      const dto = new CourrierLoginDTO(raw); // validates: phone format, password not empty, max 128 chars
      const courrier = await Courrier.login(dto.phoneNumber, dto.password); // verifies phone number and password
      await issueToken(res, courrier, UserRoles.COURRIER); // generates a session token and sets it as an HttpOnly cookie
      logger.info(`Courrier logged in: ${dto.phoneNumber}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/courrier/dashboard" });
      res.end();
    } catch (err) {
      logger.warn(`Courrier login failed: ${err.message}`);
      errorController(HTTP_STATUS.UNAUTHORIZED, req, res);
    }
  },

  // handles POST /courrier/logout — revokes the session token and clears the cookie
  logout: async (req, res) => {
    try {
      await Courrier.logout(req, res); // delegates token revocation and cookie clearing to the Courrier model
      logger.info("Courrier logged out");
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/login" });
      res.end();
    } catch (err) {
      logger.error(`Courrier logout failed: ${err.message}`);
      // Even if revocation fails, clear the cookie and redirect — fail-safe logout
      res.setHeader("Set-Cookie", "token=; HttpOnly; Path=/; Max-Age=0");
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/login" });
      res.end();
    }
  },

  // handles GET /courrier/dashboard — renders the courrier dashboard with assigned deliveries
  dashboard: async (req, res) => {
    try {
      // Only couriers may view the courrier dashboard — Customers and Managers are rejected
      const guard = await new Guard().authenticate(req);
      guard.authorize(UserRoles.COURRIER);
      const { userId } = guard.payload;
      logger.debug(`Courrier dashboard requested by userId: ${userId}`);
      const rows = await assignmentRepo.findByCourierId(userId); // fetches all assignments for this courrier from the DB

      // Server-built HTML — mark as trusted so renderHTML does not double-escape the tags
      const assignments = trustedHTML(
        rows.length
          ? rows.map(a =>
              `<li>
                Order ${a.orderId} — <strong>${a.status}</strong>
                <form method="POST" action="/courrier/status" style="display:inline; margin-left:1rem;">
                  <input type="hidden" name="assignmentId" value="${a.assignmentId}" />
                  <select name="status">
                    <option value="${OrderStatus.PREPARING}">${OrderStatus.PREPARING}</option>
                    <option value="${OrderStatus.ONTHEWAY}">${OrderStatus.ONTHEWAY}</option>
                    <option value="${OrderStatus.DELIVERED}">${OrderStatus.DELIVERED}</option>
                  </select>
                  <button type="submit">Update</button>
                </form>
              </li>`
            ).join("") // renders each assignment with an inline status update form
          : "<li class='empty'>No deliveries assigned yet.</li>", // fallback when no assignments exist
      );
      await renderHTML(res, "Dash-CourrierView.html", { assignments });
    } catch (err) {
      logger.warn(`Courrier dashboard access denied: ${err.message}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/courrier/login" }); // token missing or expired — send courrier back to login
      res.end();
    }
  },

  // handles POST /courrier/status — updates the delivery status of an assigned order
  updateStatus: async (req, res) => {
    try {
      const guard = await new Guard().authenticate(req);
      guard.authorize(UserRoles.COURRIER); // only couriers may update delivery status
      const raw = await parseBody(req);
      const dto = new UpdateDeliveryStatusDTO(raw); // validates: UUID format, status in [Preparing, On the way, Delivered]
      await DeliveryAssignment.updateStatus(dto.assignmentId, dto.status); // delegates the DB update to the model
      logger.info(`Assignment ${dto.assignmentId} status updated to: ${dto.status}`);
      res.writeHead(HTTP_STATUS.TEMP_REDIRECT, { Location: "/courrier/dashboard" }); // redirects back to the dashboard to see the updated status
      res.end();
    } catch (err) {
      logger.error(`Status update failed: ${err.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res); // sends 500 if anything goes wrong
    }
  },
};