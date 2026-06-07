import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import db from "../db";
import { getUserIdFromRequest } from "../utils/auth";

const createMenuBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    startDate: z.string().date().optional(),
    isTemplate: z.boolean().optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
  })
  .optional()
  .default({});

const updateMenuBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    startDate: z.string().date().nullable().optional(),
    isTemplate: z.boolean().optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.startDate !== undefined ||
      v.isTemplate !== undefined ||
      v.tags !== undefined,
    {
      message: "At least one field is required",
      path: ["name"],
    },
  );

const templatesQuerySchema = z.object({
  search: z.string().trim().optional(),
  tag: z.string().trim().optional(),
});

const createTemplateBodySchema = z.object({
  name: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
  sourceMenuId: z.number().int().positive().optional(),
});

const duplicateTemplateBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
  })
  .optional()
  .default({});

const upsertEntryBodySchema = z
  .object({
    recipeId: z.number().int().positive().optional(),
    note: z.string().trim().min(1).optional(),
  })
  .refine((v) => (v.recipeId === undefined) !== (v.note === undefined), {
    message: "Provide exactly one of recipeId or note",
    path: ["recipeId"],
  });

const planMenuBodySchema = z.object({
  templateMenuId: z.number().int().positive(),
  startDate: z.string().date(),
  name: z.string().trim().min(1).optional(),
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

  // GET /me/menus/planned — list planned (non-template) menus
  app.get("/planned", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserIdFromRequest(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!userId) return;

    const menus = await db.weeklyMenu.findMany({
      where: { userId, isTemplate: false },
      orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
      include: {
        menuEntries: {
          include: {
            recipe: { select: { id: true, name: true, image: true } },
          },
          orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
        },
      },
    });

    return reply.send(menus);
  });

  // GET /me/menus/templates — list template menus with optional search/tag filter
  app.get(
    "/templates",
    async (
      req: FastifyRequest<{ Querystring: { search?: string; tag?: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      const parsed = templatesQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.badRequest(
          parsed.error.issues[0]?.message ?? "Invalid query",
        );
      }

      const { search, tag } = parsed.data;

      const templates = await db.weeklyMenu.findMany({
        where: {
          userId,
          isTemplate: true,
          ...(search
            ? {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              }
            : {}),
          ...(tag ? { tags: { has: tag } } : {}),
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        include: {
          menuEntries: {
            include: {
              recipe: { select: { id: true, name: true, image: true } },
            },
            orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
          },
        },
      });

      return reply.send(templates);
    },
  );

  // POST /me/menus/templates — create a new template (optionally from source menu)
  app.post("/templates", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserIdFromRequest(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!userId) return;

    const parsed = createTemplateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.badRequest(
        parsed.error.issues[0]?.message ?? "Invalid body",
      );
    }

    const { name, tags, sourceMenuId } = parsed.data;

    let sourceEntries: Array<{
      dayOffset: number;
      mealType: MealTypeParam;
      recipeId: number | null;
      note: string | null;
    }> = [];

    if (sourceMenuId !== undefined) {
      const sourceMenu = await db.weeklyMenu.findFirst({
        where: { id: sourceMenuId, userId },
        include: {
          menuEntries: {
            orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
          },
        },
      });

      if (!sourceMenu) {
        return reply.notFound("Source menu not found");
      }

      sourceEntries = sourceMenu.menuEntries.map((entry) => ({
        dayOffset: entry.dayOffset,
        mealType: entry.mealType,
        recipeId: entry.recipeId,
        note: entry.note,
      }));
    }

    const createdTemplate = await db.weeklyMenu.create({
      data: {
        userId,
        name,
        isTemplate: true,
        tags,
        startDate: null,
      },
    });

    if (sourceEntries.length > 0) {
      await db.menuEntry.createMany({
        data: sourceEntries.map((entry) => ({
          weeklyMenuId: createdTemplate.id,
          dayOffset: entry.dayOffset,
          mealType: entry.mealType,
          recipeId: entry.recipeId,
          note: entry.note,
        })),
      });
    }

    const template = await db.weeklyMenu.findFirst({
      where: { id: createdTemplate.id, userId },
      include: {
        menuEntries: {
          include: {
            recipe: { select: { id: true, name: true, image: true } },
          },
          orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
        },
      },
    });

    return reply.status(201).send(template);
  });

  // POST /me/menus/templates/:menuId/duplicate — duplicate template
  app.post(
    "/templates/:menuId/duplicate",
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

      const parsed = duplicateTemplateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.badRequest(
          parsed.error.issues[0]?.message ?? "Invalid body",
        );
      }

      const existingTemplate = await db.weeklyMenu.findFirst({
        where: { id: menuId, userId, isTemplate: true },
        include: {
          menuEntries: {
            orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
          },
        },
      });

      if (!existingTemplate) {
        return reply.notFound("Template menu not found");
      }

      const created = await db.weeklyMenu.create({
        data: {
          userId,
          name: parsed.data.name ?? `${existingTemplate.name ?? "Meny"} kopia`,
          isTemplate: true,
          tags: existingTemplate.tags,
          startDate: null,
        },
      });

      if (existingTemplate.menuEntries.length > 0) {
        await db.menuEntry.createMany({
          data: existingTemplate.menuEntries.map((entry) => ({
            weeklyMenuId: created.id,
            dayOffset: entry.dayOffset,
            mealType: entry.mealType,
            recipeId: entry.recipeId,
            note: entry.note,
          })),
        });
      }

      const duplicatedTemplate = await db.weeklyMenu.findFirst({
        where: { id: created.id, userId },
        include: {
          menuEntries: {
            include: {
              recipe: { select: { id: true, name: true, image: true } },
            },
            orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
          },
        },
      });

      return reply.status(201).send(duplicatedTemplate);
    },
  );

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

    const { name, startDate, isTemplate, tags } = result.data;

    const menu = await db.weeklyMenu.create({
      data: {
        userId,
        name: name ?? null,
        isTemplate: isTemplate ?? false,
        tags: tags ?? [],
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

  // POST /me/menus/plan — create a weekly menu from an existing menu template
  app.post("/plan", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserIdFromRequest(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!userId) return;

    const result = planMenuBodySchema.safeParse(req.body);
    if (!result.success) {
      return reply.badRequest(
        result.error.issues[0]?.message ?? "Invalid body",
      );
    }

    const { templateMenuId, startDate, name } = result.data;

    const template = await db.weeklyMenu.findFirst({
      where: { id: templateMenuId, userId, isTemplate: true },
      include: {
        menuEntries: {
          orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
        },
      },
    });

    if (!template) {
      return reply.notFound("Template menu not found");
    }

    const created = await db.weeklyMenu.create({
      data: {
        userId,
        name: name ?? template.name,
        isTemplate: false,
        tags: [],
        startDate: new Date(startDate),
      },
    });

    if (template.menuEntries.length > 0) {
      await db.menuEntry.createMany({
        data: template.menuEntries.map((entry) => ({
          weeklyMenuId: created.id,
          dayOffset: entry.dayOffset,
          mealType: entry.mealType,
          recipeId: entry.recipeId,
          note: entry.note,
        })),
      });
    }

    const plannedMenu = await db.weeklyMenu.findFirst({
      where: { id: created.id, userId },
      include: {
        menuEntries: {
          include: {
            recipe: { select: { id: true, name: true, image: true } },
          },
          orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
        },
      },
    });

    return reply.status(201).send(plannedMenu);
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

      const { name, startDate, isTemplate, tags } = result.data;

      const updated = await db.weeklyMenu.update({
        where: { id: menuId },
        data: {
          ...(name !== undefined && { name }),
          ...(startDate !== undefined && {
            startDate: startDate ? new Date(startDate) : null,
          }),
          ...(isTemplate !== undefined && {
            isTemplate,
            ...(isTemplate ? {} : { tags: [] }),
          }),
          ...(tags !== undefined && { tags }),
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

      await db.shoppingCheck.deleteMany({ where: { weeklyMenuId: menuId } });
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

      const { recipeId, note } = result.data;

      if (recipeId !== undefined) {
        // Verify the recipe belongs to the user
        const recipe = await db.recipe.findFirst({
          where: { id: recipeId, userId },
        });
        if (!recipe) return reply.notFound("Recipe not found");
      }

      const entry = await db.menuEntry.upsert({
        where: {
          weeklyMenuId_dayOffset_mealType: {
            weeklyMenuId: menuId,
            dayOffset,
            mealType,
          },
        },
        create: {
          weeklyMenuId: menuId,
          dayOffset,
          mealType,
          recipeId: recipeId ?? null,
          note: note ?? null,
        },
        update: {
          recipeId: recipeId ?? null,
          note: note ?? null,
        },
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
