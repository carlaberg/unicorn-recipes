import sensible from "@fastify/sensible";
import Fastify, { FastifyInstance } from "fastify";
import { menuRoutes } from "./routes/menu";
import { recipeRoutes } from "./routes/recipes";
import { userRoutes } from "./routes/users";
import { clerkWebhookRoutes } from "./routes/webhooks";
import rawBody = require("fastify-raw-body");

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  app.register(sensible);
  app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true,
  });

  app.register(clerkWebhookRoutes, { prefix: "/webhooks" });
  app.register(userRoutes, { prefix: "/users" });
  app.register(recipeRoutes, { prefix: "/me/recipes" });
  app.register(menuRoutes, { prefix: "/me/menus" });

  return app;
}
