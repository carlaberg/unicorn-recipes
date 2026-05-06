import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import db from "../db";
import {
  RecipeCreateInputSchema,
  RecipeUpdateInputSchema,
} from "../prisma/generated/zod";
import { getUserIdFromRequest } from "../utils/auth";

// Infer types from generated Zod schemas
type CreateRecipeBody = z.infer<typeof RecipeCreateInputSchema>;
type UpdateRecipeBody = z.infer<typeof RecipeUpdateInputSchema>;

interface RecipeParams {
  recipeId: string;
}

export async function recipeRoutes(app: FastifyInstance) {
  // GET /me/recipes
  app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = getUserIdFromRequest(
      request.headers as Record<string, string | string[] | undefined>,
    );
    const recipes = await db.recipe.findMany({
      where: { userId },
      include: { ingredients: { include: { ingredient: true } } },
    });
    return reply.send(recipes);
  });

  // POST /me/recipes/create
  app.post<{ Body: CreateRecipeBody }>(
    "/create",
    async (
      request: FastifyRequest<{ Body: CreateRecipeBody }>,
      reply: FastifyReply,
    ) => {
      const userId = getUserIdFromRequest(
        request.headers as Record<string, string | string[] | undefined>,
      );
      const { name, ingredients = [] } = request.body;

      const recipe = await db.recipe.create({
        data: {
          name,
          user: { connect: { id: userId } },
          ingredients: {
            create: ingredients.map((ing: (typeof ingredients)[number]) => ({
              amount: ing.amount,
              unit: ing.unit,
              ingredient: {
                connectOrCreate: {
                  where: { name: ing.name },
                  create: { name: ing.name },
                },
              },
            })),
          },
        },
        include: { ingredients: { include: { ingredient: true } } },
      });

      return reply.status(201).send(recipe);
    },
  );

  // GET /me/recipes/:recipeId
  app.get(
    "/:recipeId",
    async (
      request: FastifyRequest<{ Params: RecipeParams }>,
      reply: FastifyReply,
    ) => {
      const userId = getUserIdFromRequest(
        request.headers as Record<string, string | string[] | undefined>,
      );
      const recipeId = parseInt(request.params.recipeId, 10);

      const recipe = await db.recipe.findFirst({
        where: { id: recipeId, userId },
        include: { ingredients: { include: { ingredient: true } } },
      });

      if (!recipe) {
        return reply.notFound();
      }

      return reply.send(recipe);
    },
  );

  // PATCH /me/recipes/:recipeId
  app.patch<{ Params: RecipeParams; Body: UpdateRecipeBody }>(
    "/:recipeId",
    async (
      request: FastifyRequest<{ Params: RecipeParams; Body: UpdateRecipeBody }>,
      reply: FastifyReply,
    ) => {
      const userId = getUserIdFromRequest(
        request.headers as Record<string, string | string[] | undefined>,
      );
      const recipeId = parseInt(request.params.recipeId, 10);

      const existing = await db.recipe.findFirst({
        where: { id: recipeId, userId },
      });

      if (!existing) {
        return reply.notFound();
      }

      const { name, ingredients } = request.body;

      if (ingredients !== undefined) {
        await db.recipeIngredient.deleteMany({ where: { recipeId } });
      }

      const recipe = await db.recipe.update({
        where: { id: recipeId },
        data: {
          ...(name !== undefined && { name }),
          ...(ingredients !== undefined && {
            ingredients: {
              create: ingredients.map((ing: (typeof ingredients)[number]) => ({
                amount: ing.amount,
                unit: ing.unit,
                ingredient: {
                  connectOrCreate: {
                    where: { name: ing.name },
                    create: { name: ing.name },
                  },
                },
              })),
            },
          }),
        },
        include: { ingredients: { include: { ingredient: true } } },
      });

      return reply.send(recipe);
    },
  );

  // DELETE /me/recipes/:recipeId
  app.delete(
    "/:recipeId",
    async (
      request: FastifyRequest<{ Params: RecipeParams }>,
      reply: FastifyReply,
    ) => {
      const userId = getUserIdFromRequest(
        request.headers as Record<string, string | string[] | undefined>,
      );
      const recipeId = parseInt(request.params.recipeId, 10);

      const existing = await db.recipe.findFirst({
        where: { id: recipeId, userId },
      });

      if (!existing) {
        return reply.notFound();
      }

      await db.recipeIngredient.deleteMany({ where: { recipeId } });
      await db.recipe.delete({ where: { id: recipeId } });

      return reply.status(204).send();
    },
  );
}
