import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import db from "../db";
import { getUserIdFromRequest } from "../utils/auth";
import {
    addDaysUtc,
    formatDateOnlyUtc,
    generateWeeksForRotation,
} from "../utils/rotation";

const createRotationBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  startDate: z.string().date(),
  templateMenuIds: z.array(z.number().int().positive()).min(1),
  activateNow: z.boolean().optional().default(false),
  preGenerateWeeks: z.number().int().min(0).max(26).optional().default(0),
  maxCycles: z.number().int().positive().nullable().optional(),
});

const updateOrderBodySchema = z.object({
  templateMenuIds: z.array(z.number().int().positive()).min(1),
});

const updateRotationBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
  startDate: z.string().date().optional(),
});

const activateBodySchema = z.object({
  preGenerateWeeks: z.number().int().min(0).max(26).optional().default(0),
});

const generateBodySchema = z.object({
  weeks: z.number().int().min(1).max(26),
});

const deactivateBodySchema = z.object({
  mode: z
    .enum(["keep-generated", "delete-future-generated"])
    .optional()
    .default("keep-generated"),
});

const timelineQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(26).optional().default(8),
});

function parseRotationId(raw: string): number {
  const id = parseInt(raw, 10);
  if (isNaN(id) || id <= 0) {
    throw new Error("Invalid rotationId");
  }
  return id;
}

async function ensureNoOtherActiveRotation(userId: number, excludeId?: number) {
  const active = await db.menuRotation.findFirst({
    where: {
      userId,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });

  if (active) {
    throw new Error("Another rotation is already active");
  }
}

export async function rotationRoutes(app: FastifyInstance) {
  app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserIdFromRequest(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!userId) return;

    const rotations = await db.menuRotation.findMany({
      where: { userId },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      include: {
        templates: {
          orderBy: { orderIndex: "asc" },
          include: {
            templateMenu: {
              select: { id: true, name: true, tags: true },
            },
          },
        },
      },
    });

    return reply.send(rotations);
  });

  app.get("/active", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserIdFromRequest(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!userId) return;

    const activeRotation = await db.menuRotation.findFirst({
      where: { userId, isActive: true },
      include: {
        templates: {
          orderBy: { orderIndex: "asc" },
          include: {
            templateMenu: { select: { id: true, name: true } },
          },
        },
      },
    });

    return reply.send(activeRotation);
  });

  app.get(
    "/:rotationId",
    async (
      req: FastifyRequest<{ Params: { rotationId: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      let rotationId: number;
      try {
        rotationId = parseRotationId(req.params.rotationId);
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : "Invalid rotationId",
        );
      }

      const rotation = await db.menuRotation.findFirst({
        where: { id: rotationId, userId },
        include: {
          templates: {
            orderBy: { orderIndex: "asc" },
            include: {
              templateMenu: {
                select: { id: true, name: true, tags: true },
              },
            },
          },
          generatedMenus: {
            where: { isTemplate: false },
            orderBy: [{ startDate: "asc" }, { id: "asc" }],
            include: {
              menuEntries: {
                orderBy: [{ dayOffset: "asc" }, { mealType: "asc" }],
              },
            },
          },
        },
      });

      if (!rotation) {
        return reply.notFound("Rotation not found");
      }

      return reply.send(rotation);
    },
  );

  app.get(
    "/:rotationId/timeline",
    async (
      req: FastifyRequest<{
        Params: { rotationId: string };
        Querystring: { weeks?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      let rotationId: number;
      try {
        rotationId = parseRotationId(req.params.rotationId);
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : "Invalid rotationId",
        );
      }

      const queryResult = timelineQuerySchema.safeParse(req.query ?? {});
      if (!queryResult.success) {
        return reply.badRequest(
          queryResult.error.issues[0]?.message ?? "Invalid query",
        );
      }

      const rotation = await db.menuRotation.findFirst({
        where: { id: rotationId, userId },
        include: {
          templates: {
            orderBy: { orderIndex: "asc" },
            include: {
              templateMenu: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (!rotation) {
        return reply.notFound("Rotation not found");
      }

      if (rotation.templates.length === 0) {
        return reply.send({
          rotation,
          timeline: [],
        });
      }

      const maxWeeks =
        rotation.maxCycles !== null
          ? rotation.maxCycles * rotation.templates.length
          : null;
      const timeline: Array<{
        weekIndex: number;
        startDate: string;
        templateMenuId: number;
        templateName: string | null;
        status: "generated" | "available" | "conflict";
        menuId: number | null;
      }> = [];

      for (let offset = 0; offset < queryResult.data.weeks; offset += 1) {
        const weekIndex = rotation.nextWeekIndex + offset;

        if (maxWeeks !== null && weekIndex >= maxWeeks) {
          break;
        }

        const template =
          rotation.templates[weekIndex % rotation.templates.length];
        const startDate = addDaysUtc(rotation.startDate, weekIndex * 7);

        const generated = await db.weeklyMenu.findFirst({
          where: {
            userId,
            rotationId: rotation.id,
            rotationWeekIndex: weekIndex,
            isTemplate: false,
          },
          select: { id: true },
        });

        if (generated) {
          timeline.push({
            weekIndex,
            startDate: formatDateOnlyUtc(startDate),
            templateMenuId: template.templateMenuId,
            templateName: template.templateMenu.name,
            status: "generated",
            menuId: generated.id,
          });
          continue;
        }

        const conflictingMenu = await db.weeklyMenu.findFirst({
          where: {
            userId,
            isTemplate: false,
            startDate,
          },
          select: { id: true },
        });

        timeline.push({
          weekIndex,
          startDate: formatDateOnlyUtc(startDate),
          templateMenuId: template.templateMenuId,
          templateName: template.templateMenu.name,
          status: conflictingMenu ? "conflict" : "available",
          menuId: conflictingMenu?.id ?? null,
        });
      }

      return reply.send({
        rotation,
        timeline,
      });
    },
  );

  app.post(
    "/",
    async (
      req: FastifyRequest<{
        Body: {
          name?: string;
          description?: string;
          startDate: string;
          templateMenuIds: number[];
          activateNow?: boolean;
          preGenerateWeeks?: number;
          maxCycles?: number | null;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      const parsed = createRotationBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.badRequest(
          parsed.error.issues[0]?.message ?? "Invalid body",
        );
      }

      const {
        name,
        description,
        startDate,
        templateMenuIds,
        activateNow,
        preGenerateWeeks,
        maxCycles,
      } = parsed.data;

      const uniqueTemplateIds = [...new Set(templateMenuIds)];
      const templates = await db.weeklyMenu.findMany({
        where: {
          id: { in: uniqueTemplateIds },
          userId,
          isTemplate: true,
        },
        select: { id: true },
      });

      if (templates.length !== uniqueTemplateIds.length) {
        return reply.badRequest("One or more template IDs are invalid");
      }

      if (activateNow) {
        try {
          await ensureNoOtherActiveRotation(userId);
        } catch (error) {
          return reply.conflict(
            error instanceof Error
              ? error.message
              : "Another rotation is already active",
          );
        }
      }

      const createdRotation = await db.$transaction(async (tx) => {
        const created = await tx.menuRotation.create({
          data: {
            userId,
            name: name ?? null,
            description: description ?? null,
            startDate: new Date(startDate),
            isActive: activateNow,
            maxCycles: maxCycles ?? null,
          },
        });

        await tx.menuRotationTemplate.createMany({
          data: templateMenuIds.map((templateMenuId, orderIndex) => ({
            rotationId: created.id,
            templateMenuId,
            orderIndex,
          })),
        });

        return created;
      });

      let generationResult:
        | {
            generated: number;
            attempted: number;
            createdMenuIds: number[];
            conflicts: Array<{
              weekIndex: number;
              startDate: string;
              existingMenuId: number;
            }>;
          }
        | undefined;

      if (activateNow && preGenerateWeeks > 0) {
        generationResult = await generateWeeksForRotation(
          userId,
          createdRotation.id,
          preGenerateWeeks,
        );
      }

      const rotation = await db.menuRotation.findFirst({
        where: { id: createdRotation.id, userId },
        include: {
          templates: {
            orderBy: { orderIndex: "asc" },
            include: {
              templateMenu: {
                select: { id: true, name: true, tags: true },
              },
            },
          },
        },
      });

      return reply.status(201).send({
        rotation,
        generation: generationResult ?? null,
      });
    },
  );

  app.patch(
    "/:rotationId/order",
    async (
      req: FastifyRequest<{
        Params: { rotationId: string };
        Body: { templateMenuIds: number[] };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      let rotationId: number;
      try {
        rotationId = parseRotationId(req.params.rotationId);
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : "Invalid rotationId",
        );
      }

      const parsed = updateOrderBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.badRequest(
          parsed.error.issues[0]?.message ?? "Invalid body",
        );
      }

      const existingRotation = await db.menuRotation.findFirst({
        where: { id: rotationId, userId },
      });
      if (!existingRotation) {
        return reply.notFound("Rotation not found");
      }

      const uniqueTemplateIds = [...new Set(parsed.data.templateMenuIds)];
      const templates = await db.weeklyMenu.findMany({
        where: {
          id: { in: uniqueTemplateIds },
          userId,
          isTemplate: true,
        },
        select: { id: true },
      });

      if (templates.length !== uniqueTemplateIds.length) {
        return reply.badRequest("One or more template IDs are invalid");
      }

      await db.$transaction(async (tx) => {
        await tx.menuRotationTemplate.deleteMany({ where: { rotationId } });
        await tx.menuRotationTemplate.createMany({
          data: parsed.data.templateMenuIds.map(
            (templateMenuId, orderIndex) => ({
              rotationId,
              templateMenuId,
              orderIndex,
            }),
          ),
        });
      });

      const updated = await db.menuRotation.findFirst({
        where: { id: rotationId, userId },
        include: {
          templates: {
            orderBy: { orderIndex: "asc" },
            include: {
              templateMenu: {
                select: { id: true, name: true, tags: true },
              },
            },
          },
        },
      });

      return reply.send(updated);
    },
  );

  app.patch(
    "/:rotationId",
    async (
      req: FastifyRequest<{
        Params: { rotationId: string };
        Body: { name?: string; description?: string; startDate?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      let rotationId: number;
      try {
        rotationId = parseRotationId(req.params.rotationId);
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : "Invalid rotationId",
        );
      }

      const parsed = updateRotationBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.badRequest(
          parsed.error.issues[0]?.message ?? "Invalid body",
        );
      }

      const existingRotation = await db.menuRotation.findFirst({
        where: { id: rotationId, userId },
      });
      if (!existingRotation) {
        return reply.notFound("Rotation not found");
      }

      const updateData: Record<string, string | null> = {};
      if (parsed.data.name !== undefined)
        updateData.name = parsed.data.name || null;
      if (parsed.data.description !== undefined)
        updateData.description = parsed.data.description || null;
      if (parsed.data.startDate !== undefined)
        updateData.startDate = parsed.data.startDate;

      await db.menuRotation.update({
        where: { id: rotationId },
        data: updateData,
      });

      const updated = await db.menuRotation.findFirst({
        where: { id: rotationId, userId },
        include: {
          templates: {
            orderBy: { orderIndex: "asc" },
            include: {
              templateMenu: {
                select: { id: true, name: true, tags: true },
              },
            },
          },
        },
      });

      return reply.send(updated);
    },
  );

  app.post(
    "/:rotationId/activate",
    async (
      req: FastifyRequest<{
        Params: { rotationId: string };
        Body: { preGenerateWeeks?: number };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      let rotationId: number;
      try {
        rotationId = parseRotationId(req.params.rotationId);
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : "Invalid rotationId",
        );
      }

      const parsed = activateBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.badRequest(
          parsed.error.issues[0]?.message ?? "Invalid body",
        );
      }

      const rotation = await db.menuRotation.findFirst({
        where: { id: rotationId, userId },
      });
      if (!rotation) {
        return reply.notFound("Rotation not found");
      }

      try {
        await ensureNoOtherActiveRotation(userId, rotationId);
      } catch (error) {
        return reply.conflict(
          error instanceof Error
            ? error.message
            : "Another rotation is already active",
        );
      }

      await db.menuRotation.update({
        where: { id: rotationId },
        data: { isActive: true },
      });

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      await db.weeklyMenu.updateMany({
        where: {
          userId,
          rotationId,
          isTemplate: false,
          startDate: { gte: today },
          hiddenFromCalendar: true,
        },
        data: { hiddenFromCalendar: false },
      });

      const generation =
        parsed.data.preGenerateWeeks > 0
          ? await generateWeeksForRotation(
              userId,
              rotationId,
              parsed.data.preGenerateWeeks,
            )
          : null;

      const activated = await db.menuRotation.findFirst({
        where: { id: rotationId, userId },
        include: {
          templates: {
            orderBy: { orderIndex: "asc" },
            include: {
              templateMenu: {
                select: { id: true, name: true, tags: true },
              },
            },
          },
        },
      });

      return reply.send({ rotation: activated, generation });
    },
  );

  app.post(
    "/:rotationId/generate",
    async (
      req: FastifyRequest<{
        Params: { rotationId: string };
        Body: { weeks: number };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      let rotationId: number;
      try {
        rotationId = parseRotationId(req.params.rotationId);
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : "Invalid rotationId",
        );
      }

      const parsed = generateBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.badRequest(
          parsed.error.issues[0]?.message ?? "Invalid body",
        );
      }

      const rotation = await db.menuRotation.findFirst({
        where: { id: rotationId, userId },
        select: { id: true },
      });
      if (!rotation) {
        return reply.notFound("Rotation not found");
      }

      const generation = await generateWeeksForRotation(
        userId,
        rotationId,
        parsed.data.weeks,
      );

      return reply.send(generation);
    },
  );

  app.post(
    "/:rotationId/deactivate",
    async (
      req: FastifyRequest<{
        Params: { rotationId: string };
        Body: { mode?: "keep-generated" | "delete-future-generated" };
      }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      let rotationId: number;
      try {
        rotationId = parseRotationId(req.params.rotationId);
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : "Invalid rotationId",
        );
      }

      const parsed = deactivateBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.badRequest(
          parsed.error.issues[0]?.message ?? "Invalid body",
        );
      }

      const rotation = await db.menuRotation.findFirst({
        where: { id: rotationId, userId },
      });
      if (!rotation) {
        return reply.notFound("Rotation not found");
      }

      await db.menuRotation.update({
        where: { id: rotationId },
        data: { isActive: false },
      });

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      await db.weeklyMenu.updateMany({
        where: {
          userId,
          rotationId,
          isTemplate: false,
          startDate: { gte: today },
          hiddenFromCalendar: false,
        },
        data: { hiddenFromCalendar: true },
      });

      if (parsed.data.mode === "delete-future-generated") {
        const futureGeneratedMenus = await db.weeklyMenu.findMany({
          where: {
            userId,
            rotationId,
            isTemplate: false,
            startDate: { gte: today },
          },
          select: { id: true },
        });

        const futureIds = futureGeneratedMenus.map((menu) => menu.id);

        if (futureIds.length > 0) {
          await db.shoppingCheck.deleteMany({
            where: { weeklyMenuId: { in: futureIds } },
          });
          await db.menuEntry.deleteMany({
            where: { weeklyMenuId: { in: futureIds } },
          });
          await db.weeklyMenu.deleteMany({ where: { id: { in: futureIds } } });
        }
      }

      const updated = await db.menuRotation.findFirst({
        where: { id: rotationId, userId },
        include: {
          templates: {
            orderBy: { orderIndex: "asc" },
            include: {
              templateMenu: {
                select: { id: true, name: true, tags: true },
              },
            },
          },
        },
      });

      return reply.send(updated);
    },
  );

  app.delete(
    "/:rotationId",
    async (
      req: FastifyRequest<{ Params: { rotationId: string } }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      let rotationId: number;
      try {
        rotationId = parseRotationId(req.params.rotationId);
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : "Invalid rotationId",
        );
      }

      const rotation = await db.menuRotation.findFirst({
        where: { id: rotationId, userId },
        select: { id: true },
      });
      if (!rotation) {
        return reply.notFound("Rotation not found");
      }

      const generatedMenus = await db.weeklyMenu.findMany({
        where: {
          userId,
          rotationId,
          isTemplate: false,
        },
        select: { id: true },
      });

      const generatedMenuIds = generatedMenus.map((menu) => menu.id);

      await db.$transaction(async (tx) => {
        if (generatedMenuIds.length > 0) {
          await tx.shoppingCheck.deleteMany({
            where: { weeklyMenuId: { in: generatedMenuIds } },
          });

          await tx.menuEntry.deleteMany({
            where: { weeklyMenuId: { in: generatedMenuIds } },
          });

          await tx.weeklyMenu.deleteMany({
            where: { id: { in: generatedMenuIds } },
          });
        }

        await tx.menuRotation.delete({
          where: { id: rotationId },
        });
      });

      return reply.send({
        deletedRotationId: rotationId,
        deletedGeneratedMenuCount: generatedMenuIds.length,
      });
    },
  );
}
