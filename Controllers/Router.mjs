import path from "node:path"; // built-in Node.js module for working with file and directory paths
import { fileURLToPath } from "node:url"; // converts an ES module URL (import.meta.url) into a file system path
import { HTTP_STATUS } from "../Utils/constants.mjs"; // HTTP status code constants
import { errorController } from "./ErrorController.mjs"; // renders error pages on failure
import { logger } from "../Utils/Logger.mjs"; // structured logger — writes to console and Logs/app.log

const __dirName = path.dirname(fileURLToPath(import.meta.url)); // resolves the current file's directory (ES module replacement for __dirname)

export class Router {
  #routes = []; // private array that stores all registered routes as { method, path, handler }

  add(method, path, handler) {
    this.#routes.push({ method: method.toUpperCase(), path, handler }); // registers a new route — normalises HTTP method to uppercase
  }

  #notFound(req, res) {
    logger.info(`404 Not Found — ${req.method} ${req.url}`);
    errorController(HTTP_STATUS.NOT_FOUND, req, res);
  }

  dispatch = async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`); // parses the full URL from the request, using the Host header as the base
    const pathname = url.pathname; // extracts just the path portion (e.g. "/auth/login")
    const method = req.method; // extracts the HTTP method (GET, POST, etc.)

    logger.debug(`Incoming request — ${method} ${pathname}`);

    const match = this.#routes.find(
      (route) => route.method === method && route.path === pathname, // finds the first route that matches both method and path
    );

    const handler = match ? match.handler : this.#notFound.bind(this); // uses the matched handler or falls back to 404

    try {
      await handler(req, res); // calls the handler — await supports async controllers
    } catch (error) {
      logger.error(`Unhandled error on ${method} ${pathname}: ${error.message}`);
      errorController(HTTP_STATUS.SERVER_ERROR, req, res);
    }
  };
}

export function createRouter() {
  return new Router(); // factory function — creates and returns a fresh Router instance
}