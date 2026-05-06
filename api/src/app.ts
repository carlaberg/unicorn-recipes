import sensible from "@fastify/sensible";
import Fastify, { FastifyInstance } from "fastify";
import { recipeRoutes } from "./routes/recipes";
import { userRoutes } from "./routes/users";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test",
  });

  app.register(sensible);
  app.register(userRoutes, { prefix: "/users" });
  app.register(recipeRoutes, { prefix: "/me/recipes" });

  return app;
}
