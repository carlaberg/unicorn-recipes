import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import db from "../db";
import { getUserIdFromRequest } from "../utils/auth";
import {
    applyAmountMultiplier,
    normalizeIngredientName,
    normalizeIngredientUnit,
} from "../utils/ingredient-units";

const shoppingQuerySchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
});

const toggleShoppingCheckBodySchema = z.object({
  ingredientKey: z.string().trim().min(1),
  checked: z.boolean(),
});

function formatDateOnlyUtc(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split("-").map((part) => parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateKey(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function buildShoppingResponse(
  menus: Array<{
    startDate: Date | null;
    menuEntries: Array<{
      id: number;
      dayOffset: number;
      recipeId: number | null;
      recipe: {
        ingredients: Array<{
          amount: unknown;
          unit: string;
          ingredient: { name: string };
        }>;
      } | null;
    }>;
  }>,
  rangeStart: Date,
  rangeEnd: Date,
) {
  const rangeStartKey = toDateKey(rangeStart);
  const rangeEndKey = toDateKey(rangeEnd);

  const totals = new Map<
    string,
    {
      ingredientName: string;
      units: Map<
        string,
        {
          totalAmount: number;
          recipeIds: Set<number>;
          entryIds: Set<number>;
        }
      >;
    }
  >();

  for (const menu of menus) {
    if (!menu.startDate) {
      continue;
    }

    for (const entry of menu.menuEntries) {
      const entryDate = addDays(menu.startDate, entry.dayOffset);
      const entryDateKey = toDateKey(entryDate);
      if (entryDateKey < rangeStartKey || entryDateKey > rangeEndKey) {
        continue;
      }

      if (!entry.recipe) {
        continue;
      }

      for (const recipeIngredient of entry.recipe.ingredients) {
        const normalizedName = normalizeIngredientName(
          recipeIngredient.ingredient.name,
        );
        const normalizedUnit = normalizeIngredientUnit(recipeIngredient.unit);
        const displayUnit =
          normalizedUnit?.unit ?? recipeIngredient.unit.trim();
        const amount = applyAmountMultiplier(
          Number(recipeIngredient.amount),
          normalizedUnit?.multiplier ?? 1,
        );

        const existingIngredient = totals.get(normalizedName) ?? {
          ingredientName: normalizedName,
          units: new Map(),
        };

        const existingUnit = existingIngredient.units.get(displayUnit) ?? {
          totalAmount: 0,
          recipeIds: new Set<number>(),
          entryIds: new Set<number>(),
        };

        existingUnit.totalAmount += amount;
        if (entry.recipeId !== null) {
          existingUnit.recipeIds.add(entry.recipeId);
        }
        existingUnit.entryIds.add(entry.id);
        existingIngredient.units.set(displayUnit, existingUnit);

        totals.set(normalizedName, existingIngredient);
      }
    }
  }

  const items = [] as Array<{
    ingredientKey: string;
    ingredientName: string;
    unit: string;
    totalAmount: number;
    recipeCount: number;
    entryCount: number;
  }>;

  const conflicts = [] as Array<{
    ingredientName: string;
    units: string[];
  }>;

  for (const ingredient of totals.values()) {
    const sortedUnits = [...ingredient.units.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    );

    if (sortedUnits.length > 1) {
      conflicts.push({
        ingredientName: ingredient.ingredientName,
        units: sortedUnits.map(([unit]) => unit),
      });
    }

    for (const [unit, data] of sortedUnits) {
      const ingredientKey = `${ingredient.ingredientName}::${unit}`;
      items.push({
        ingredientKey,
        ingredientName: ingredient.ingredientName,
        unit,
        totalAmount: Number(data.totalAmount.toFixed(6)),
        recipeCount: data.recipeIds.size,
        entryCount: data.entryIds.size,
      });
    }
  }

  items.sort((a, b) => {
    const byName = a.ingredientName.localeCompare(b.ingredientName);
    if (byName !== 0) {
      return byName;
    }
    return a.unit.localeCompare(b.unit);
  });

  conflicts.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName));

  return {
    startDate: formatDateOnlyUtc(rangeStart),
    endDate: formatDateOnlyUtc(rangeEnd),
    items,
    conflicts,
  };
}

export async function shoppingRoutes(app: FastifyInstance) {
  // GET /me/menus/:menuId/shopping — shopping list for a specific planned menu period
  app.get(
    "/:menuId/shopping",
    async (
      request: FastifyRequest<{ Params: { menuId: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        request.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      const menuId = parseInt(request.params.menuId, 10);
      if (isNaN(menuId)) {
        return reply.status(400).send({ message: "Invalid menuId" });
      }

      const menu = await db.weeklyMenu.findFirst({
        where: { id: menuId, userId, isTemplate: false },
        include: {
          menuEntries: {
            include: {
              recipe: {
                include: {
                  ingredients: {
                    include: {
                      ingredient: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!menu) {
        return reply.status(404).send({ message: "Menu not found" });
      }

      if (!menu.startDate) {
        return reply.status(400).send({ message: "Menu is missing startDate" });
      }

      const rangeStart = parseDateOnly(formatDateOnlyUtc(menu.startDate));
      const rangeEnd = addDays(rangeStart, 6);

      const checks = await db.shoppingCheck.findMany({
        where: { weeklyMenuId: menuId, userId },
        select: { ingredientKey: true },
      });

      const response = buildShoppingResponse([menu], rangeStart, rangeEnd);

      return reply.send({
        ...response,
        checkedIngredientKeys: checks.map(
          (check: { ingredientKey: string }) => check.ingredientKey,
        ),
      });
    },
  );

  // POST /me/menus/:menuId/shopping/check — persist check state for an aggregated ingredient row
  app.post(
    "/:menuId/shopping/check",
    async (
      request: FastifyRequest<{
        Params: { menuId: string };
        Body: { ingredientKey: string; checked: boolean };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        request.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      const menuId = parseInt(request.params.menuId, 10);
      if (isNaN(menuId)) {
        return reply.status(400).send({ message: "Invalid menuId" });
      }

      const parsedBody = toggleShoppingCheckBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          message: "Invalid body",
          errors: parsedBody.error.flatten(),
        });
      }

      const menu = await db.weeklyMenu.findFirst({
        where: { id: menuId, userId, isTemplate: false },
      });
      if (!menu) {
        return reply.status(404).send({ message: "Menu not found" });
      }

      const { ingredientKey, checked } = parsedBody.data;

      if (checked) {
        await db.shoppingCheck.upsert({
          where: {
            weeklyMenuId_userId_ingredientKey: {
              weeklyMenuId: menuId,
              userId,
              ingredientKey,
            },
          },
          update: { checkedAt: new Date() },
          create: {
            weeklyMenuId: menuId,
            userId,
            ingredientKey,
          },
        });
      } else {
        await db.shoppingCheck.deleteMany({
          where: {
            weeklyMenuId: menuId,
            userId,
            ingredientKey,
          },
        });
      }

      return reply.status(204).send();
    },
  );

  // GET /me/menus/shopping?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
  app.get(
    "/shopping",
    async (
      request: FastifyRequest<{
        Querystring: { startDate: string; endDate: string };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        request.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      const parsedQuery = shoppingQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          message: "Invalid query",
          errors: parsedQuery.error.flatten(),
        });
      }

      const { startDate, endDate } = parsedQuery.data;
      const rangeStart = parseDateOnly(startDate);
      const rangeEnd = parseDateOnly(endDate);

      if (rangeStart.getTime() > rangeEnd.getTime()) {
        return reply.status(400).send({
          message: "startDate must be before or equal to endDate",
        });
      }

      const dbWindowStart = addDays(rangeStart, -6);

      const menus = await db.weeklyMenu.findMany({
        where: {
          userId,
          isTemplate: false,
          startDate: {
            not: null,
            gte: dbWindowStart,
            lte: rangeEnd,
          },
        },
        include: {
          menuEntries: {
            include: {
              recipe: {
                include: {
                  ingredients: {
                    include: {
                      ingredient: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      return reply.send(buildShoppingResponse(menus, rangeStart, rangeEnd));
    },
  );
}
