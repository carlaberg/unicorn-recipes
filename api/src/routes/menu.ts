import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import db from "../db";
import { getUserIdFromRequest } from "../utils/auth";

const createMenuBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    startDate: z.string().date().optional(),
  })
  .optional()
  .default({});

const updateMenuBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    startDate: z.string().date().nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.startDate !== undefined, {
    message: "At least one field is required",
    path: ["name"],
  });

const upsertEntryBodySchema = z.object({
  recipeId: z.number().int().positive(),
});

const validMealTypes = ["LUNCH", "DINNER"] as const;
type MealTypeParam = (typeof validMealTypes)[number];

function parseDayOffset(raw: string): number {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 0 || n > 6) {
    throw new Error("dayOffset must be an integer between 0 and 6");
  }
  return n;
}

function parseMealType(raw: string): MealTypeParam {
  const upper = raw.toUpperCase() as MealTypeParam;
  if (!validMealTypes.includes(upper)) {
    throw new Error("mealType must be LUNCH or DINNER");
  }
  return upper;
}

export async function menuRoutes(app: FastifyInstance) {
  // GET /me/menus — list all weekly menus for the authenticated user
  app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserIdFromRequest(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!userId) return;

    const menus = await db.weeklyMenu.findMany({
      where: { userId },
      orderBy: { startDate: "asc" },
      include: {
        menuEntries: {
          include: {
            recipe: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
        },
      },
    });

    return reply.send(menus);
  });

  // POST /me/menus — create a new weekly menu
  app.post("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserIdFromRequest(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!userId) return;

    const result = createMenuBodySchema.safeParse(req.body);
    if (!result.success) {
      return reply.badRequest(
        result.error.issues[0]?.message ?? "Invalid body",
      );
    }

    const { name, startDate } = result.data;

    const menu = await db.weeklyMenu.create({
      data: {
        userId,
        name: name ?? null,
        startDate: startDate ? new Date(startDate) : null,
      },
      include: {
        menuEntries: {
          include: {
            recipe: { select: { id: true, name: true, image: true } },
          },
        },
      },
    });

    return reply.status(201).send(menu);
  });

  // PATCH /me/menus/:menuId — update name / startDate
  app.patch(
    "/:menuId",
    async (
      req: FastifyRequest<{ Params: { menuId: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      const menuId = parseInt(req.params.menuId, 10);
      if (isNaN(menuId)) return reply.badRequest("Invalid menuId");

      const existing = await db.weeklyMenu.findFirst({
        where: { id: menuId, userId },
      });
      if (!existing) return reply.notFound("Menu not found");

      const result = updateMenuBodySchema.safeParse(req.body);
      if (!result.success) {
        return reply.badRequest(
          result.error.issues[0]?.message ?? "Invalid body",
        );
      }

      const { name, startDate } = result.data;

      const updated = await db.weeklyMenu.update({
        where: { id: menuId },
        data: {
          ...(name !== undefined && { name }),
          ...(startDate !== undefined && {
            startDate: startDate ? new Date(startDate) : null,
          }),
        },
        include: {
          menuEntries: {
            include: {
              recipe: { select: { id: true, name: true, image: true } },
            },
          },
        },
      });

      return reply.send(updated);
    },
  );

  // DELETE /me/menus/:menuId — delete menu and all its entries
  app.delete(
    "/:menuId",
    async (
      req: FastifyRequest<{ Params: { menuId: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      const menuId = parseInt(req.params.menuId, 10);
      if (isNaN(menuId)) return reply.badRequest("Invalid menuId");

      const existing = await db.weeklyMenu.findFirst({
        where: { id: menuId, userId },
      });
      if (!existing) return reply.notFound("Menu not found");

      await db.menuEntry.deleteMany({ where: { weeklyMenuId: menuId } });
      await db.weeklyMenu.delete({ where: { id: menuId } });

      return reply.status(204).send();
    },
  );

  // PUT /me/menus/:menuId/:dayOffset/:mealType — upsert a menu entry
  app.put(
    "/:menuId/:dayOffset/:mealType",
    async (
      req: FastifyRequest<{
        Params: { menuId: string; dayOffset: string; mealType: string };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      const menuId = parseInt(req.params.menuId, 10);
      if (isNaN(menuId)) return reply.badRequest("Invalid menuId");

      let dayOffset: number;
      let mealType: MealTypeParam;
      try {
        dayOffset = parseDayOffset(req.params.dayOffset);
        mealType = parseMealType(req.params.mealType);
      } catch (e) {
        return reply.badRequest(
          e instanceof Error ? e.message : "Invalid params",
        );
      }

      const menu = await db.weeklyMenu.findFirst({
        where: { id: menuId, userId },
      });
      if (!menu) return reply.notFound("Menu not found");

      const result = upsertEntryBodySchema.safeParse(req.body);
      if (!result.success) {
        return reply.badRequest(
          result.error.issues[0]?.message ?? "Invalid body",
        );
      }

      const { recipeId } = result.data;

      // Verify the recipe belongs to the user
      const recipe = await db.recipe.findFirst({
        where: { id: recipeId, userId },
      });
      if (!recipe) return reply.notFound("Recipe not found");

      const entry = await db.menuEntry.upsert({
        where: {
          weeklyMenuId_dayOffset_mealType: {
            weeklyMenuId: menuId,
            dayOffset,
            mealType,
          },
        },
        create: { weeklyMenuId: menuId, dayOffset, mealType, recipeId },
        update: { recipeId },
        include: {
          recipe: { select: { id: true, name: true, image: true } },
        },
      });

      return reply.send(entry);
    },
  );

  // DELETE /me/menus/:menuId/:dayOffset/:mealType — remove an entry
  app.delete(
    "/:menuId/:dayOffset/:mealType",
    async (
      req: FastifyRequest<{
        Params: { menuId: string; dayOffset: string; mealType: string };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      const menuId = parseInt(req.params.menuId, 10);
      if (isNaN(menuId)) return reply.badRequest("Invalid menuId");

      let dayOffset: number;
      let mealType: MealTypeParam;
      try {
        dayOffset = parseDayOffset(req.params.dayOffset);
        mealType = parseMealType(req.params.mealType);
      } catch (e) {
        return reply.badRequest(
          e instanceof Error ? e.message : "Invalid params",
        );
      }

      const menu = await db.weeklyMenu.findFirst({
        where: { id: menuId, userId },
      });
      if (!menu) return reply.notFound("Menu not found");

      await db.menuEntry.deleteMany({
        where: { weeklyMenuId: menuId, dayOffset, mealType },
      });

      return reply.status(204).send();
    },
  );
}
