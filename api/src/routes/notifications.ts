import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import db from "../db";
import { getUserIdFromRequest } from "../utils/auth";

const notificationDeliveryMethodSchema = z.enum(["CALENDAR", "SMS", "APP"]);

const createNotificationBodySchema = z.object({
  date: z.string().date(),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  message: z.string().trim().min(1),
  repeatsWeekly: z.boolean().optional().default(false),
  deliveryMethods: z.array(notificationDeliveryMethodSchema).min(1),
});

const updateNotificationBodySchema = z
  .object({
    date: z.string().date().optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    message: z.string().trim().min(1).optional(),
    repeatsWeekly: z.boolean().optional(),
    deliveryMethods: z.array(notificationDeliveryMethodSchema).min(1).optional(),
  })
  .refine(
    (value) =>
      value.date !== undefined ||
      value.time !== undefined ||
      value.message !== undefined ||
      value.repeatsWeekly !== undefined ||
      value.deliveryMethods !== undefined,
    {
      message: "At least one field is required",
      path: ["message"],
    },
  );

type CreateNotificationBody = z.infer<typeof createNotificationBodySchema>;
type UpdateNotificationBody = z.infer<typeof updateNotificationBodySchema>;

interface NotificationParams {
  notificationId: string;
}

function normalizeDeliveryMethods(
  deliveryMethods: CreateNotificationBody["deliveryMethods"],
) {
  return Array.from(new Set(deliveryMethods));
}

function formatDateOnlyUtc(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mapNotification(notification: {
  id: number;
  date: Date;
  time: string;
  message: string;
  repeatsWeekly: boolean;
  deliveryMethods: ("CALENDAR" | "SMS" | "APP")[];
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: notification.id,
    date: formatDateOnlyUtc(notification.date),
    time: notification.time,
    message: notification.message,
    repeatsWeekly: notification.repeatsWeekly,
    deliveryMethods: notification.deliveryMethods,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
  };
}

function parseNotificationId(raw: string) {
  const notificationId = parseInt(raw, 10);
  if (Number.isNaN(notificationId) || notificationId <= 0) {
    throw new Error("notificationId must be a positive integer");
  }
  return notificationId;
}

export async function notificationRoutes(app: FastifyInstance) {
  app.get("/", async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserIdFromRequest(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!userId) return;

    const notifications = await db.notification.findMany({
      where: { userId },
      orderBy: [{ date: "asc" }, { time: "asc" }, { id: "asc" }],
    });

    return reply.send(notifications.map(mapNotification));
  });

  app.get<{ Params: NotificationParams }>(
    "/:notificationId",
    async (req, reply) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      let notificationId: number;
      try {
        notificationId = parseNotificationId(req.params.notificationId);
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : "Invalid notification id",
        );
      }

      const notification = await db.notification.findFirst({
        where: { id: notificationId, userId },
      });

      if (!notification) {
        return reply.notFound("Notification not found");
      }

      return reply.send(mapNotification(notification));
    },
  );

  app.post<{ Body: CreateNotificationBody }>("/", async (req, reply) => {
    const userId = await getUserIdFromRequest(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!userId) return;

    const parsedBody = createNotificationBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.badRequest(parsedBody.error.issues[0]?.message);
    }

    const notification = await db.notification.create({
      data: {
        userId,
        date: new Date(parsedBody.data.date),
        time: parsedBody.data.time,
        message: parsedBody.data.message,
        repeatsWeekly: parsedBody.data.repeatsWeekly,
        deliveryMethods: normalizeDeliveryMethods(parsedBody.data.deliveryMethods),
      },
    });

    return reply.status(201).send(mapNotification(notification));
  });

  app.patch<{ Params: NotificationParams; Body: UpdateNotificationBody }>(
    "/:notificationId",
    async (req, reply) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      let notificationId: number;
      try {
        notificationId = parseNotificationId(req.params.notificationId);
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : "Invalid notification id",
        );
      }

      const parsedBody = updateNotificationBodySchema.safeParse(req.body);
      if (!parsedBody.success) {
        return reply.badRequest(parsedBody.error.issues[0]?.message);
      }

      const existingNotification = await db.notification.findFirst({
        where: { id: notificationId, userId },
      });

      if (!existingNotification) {
        return reply.notFound("Notification not found");
      }

      const notification = await db.notification.update({
        where: { id: notificationId },
        data: {
          ...(parsedBody.data.date !== undefined
            ? { date: new Date(parsedBody.data.date) }
            : {}),
          ...(parsedBody.data.time !== undefined
            ? { time: parsedBody.data.time }
            : {}),
          ...(parsedBody.data.message !== undefined
            ? { message: parsedBody.data.message }
            : {}),
          ...(parsedBody.data.repeatsWeekly !== undefined
            ? { repeatsWeekly: parsedBody.data.repeatsWeekly }
            : {}),
          ...(parsedBody.data.deliveryMethods !== undefined
            ? {
                deliveryMethods: normalizeDeliveryMethods(
                  parsedBody.data.deliveryMethods,
                ),
              }
            : {}),
        },
      });

      return reply.send(mapNotification(notification));
    },
  );

  app.delete<{ Params: NotificationParams }>(
    "/:notificationId",
    async (req, reply) => {
      const userId = await getUserIdFromRequest(
        req.headers as Record<string, string | string[] | undefined>,
      );
      if (!userId) return;

      let notificationId: number;
      try {
        notificationId = parseNotificationId(req.params.notificationId);
      } catch (error) {
        return reply.badRequest(
          error instanceof Error ? error.message : "Invalid notification id",
        );
      }

      const notification = await db.notification.findFirst({
        where: { id: notificationId, userId },
        select: { id: true },
      });

      if (!notification) {
        return reply.notFound("Notification not found");
      }

      await db.notification.delete({
        where: { id: notificationId },
      });

      return reply.status(204).send();
    },
  );
}
