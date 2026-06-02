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

export async function shoppingRoutes(app: FastifyInstance) {
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
            const normalizedUnit = normalizeIngredientUnit(
              recipeIngredient.unit,
            );
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
            existingUnit.recipeIds.add(entry.recipeId);
            existingUnit.entryIds.add(entry.id);
            existingIngredient.units.set(displayUnit, existingUnit);

            totals.set(normalizedName, existingIngredient);
          }
        }
      }

      const items = [] as Array<{
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
          items.push({
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

      conflicts.sort((a, b) =>
        a.ingredientName.localeCompare(b.ingredientName),
      );

      return reply.send({
        startDate,
        endDate,
        items,
        conflicts,
      });
    },
  );
}
