import { NotificationDeliveryMethod } from "@prisma/client";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { config } from "../config";
import db from "../db";
import { getUserIdFromRequest } from "../utils/auth";

const notificationDeliveryMethodSchema = z.enum(["CALENDAR", "SMS", "APP"]);
const expoPushTokenSchema = z
  .string()
  .trim()
  .regex(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/);

const createNotificationBodySchema = z.object({
  date: z.string().date(),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  timeZone: z.string().trim().min(1).optional().default("UTC"),
  message: z.string().trim().min(1),
  repeatsWeekly: z.boolean().optional().default(false),
  deliveryMethods: z.array(notificationDeliveryMethodSchema).min(1),
});

const updateNotificationBodySchema = z
  .object({
    date: z.string().date().optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
    timeZone: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1).optional(),
    repeatsWeekly: z.boolean().optional(),
    deliveryMethods: z.array(notificationDeliveryMethodSchema).min(1).optional(),
  })
  .refine(
    (value) =>
      value.date !== undefined ||
      value.time !== undefined ||
      value.timeZone !== undefined ||
      value.message !== undefined ||
      value.repeatsWeekly !== undefined ||
      value.deliveryMethods !== undefined,
    {
      message: "At least one field is required",
      path: ["message"],
    },
  );

const pushTokenBodySchema = z.object({
  expoPushToken: expoPushTokenSchema,
  platform: z.enum(["ios", "android"]),
});

const dispatchHeaderSchema = z.object({
  "x-notification-dispatch-secret": z.string().trim().min(1),
});

type CreateNotificationBody = z.infer<typeof createNotificationBodySchema>;
type UpdateNotificationBody = z.infer<typeof updateNotificationBodySchema>;
type PushTokenBody = z.infer<typeof pushTokenBodySchema>;

type NotificationWithDevices = {
  id: number;
  date: Date;
  time: string;
  timeZone: string;
  message: string;
  repeatsWeekly: boolean;
  deliveryMethods: NotificationDeliveryMethod[];
  appPushLastSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    pushDevices: {
      id: number;
      expoPushToken: string;
      platform: string;
    }[];
  };
};

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
  timeZone: string;
  message: string;
  repeatsWeekly: boolean;
  deliveryMethods: ("CALENDAR" | "SMS" | "APP")[];
  appPushLastSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: notification.id,
    date: formatDateOnlyUtc(notification.date),
    time: notification.time,
    timeZone: notification.timeZone,
    message: notification.message,
    repeatsWeekly: notification.repeatsWeekly,
    deliveryMethods: notification.deliveryMethods,
    appPushLastSentAt: notification.appPushLastSentAt?.toISOString() ?? null,
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

function parseTimeParts(raw: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function addDaysUtc(date: Date, amount: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + amount);
  return copy;
}

function createUtcDateFromDateOnly(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function zonedDateTimeToUtc(date: Date, time: string, timeZone: string) {
  const timeParts = parseTimeParts(time);
  if (!timeParts) {
    return null;
  }

  const guess = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      timeParts.hour,
      timeParts.minute,
      0,
      0,
    ),
  );
  const zoned = getTimeZoneParts(guess, timeZone);
  const targetUtc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    timeParts.hour,
    timeParts.minute,
    0,
    0,
  );
  const guessAsZonedUtc = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
    0,
  );

  return new Date(guess.getTime() + (targetUtc - guessAsZonedUtc));
}

function getLatestDueOccurrence(notification: NotificationWithDevices, now: Date) {
  const firstDate = createUtcDateFromDateOnly(notification.date);
  const firstOccurrenceAt = zonedDateTimeToUtc(
    firstDate,
    notification.time,
    notification.timeZone,
  );

  if (!firstOccurrenceAt || firstOccurrenceAt.getTime() > now.getTime()) {
    return null;
  }

  if (!notification.repeatsWeekly) {
    return firstOccurrenceAt;
  }

  const elapsedWeeks = Math.max(
    0,
    Math.floor((now.getTime() - firstOccurrenceAt.getTime()) / (7 * 24 * 60 * 60 * 1000)),
  );

  let candidateDate = addDaysUtc(firstDate, elapsedWeeks * 7);
  let candidateOccurrence = zonedDateTimeToUtc(
    candidateDate,
    notification.time,
    notification.timeZone,
  );

  while (candidateOccurrence && candidateOccurrence.getTime() > now.getTime()) {
    candidateDate = addDaysUtc(candidateDate, -7);
    candidateOccurrence = zonedDateTimeToUtc(
      candidateDate,
      notification.time,
      notification.timeZone,
    );
  }

  while (candidateOccurrence) {
    const nextCandidateDate = addDaysUtc(candidateDate, 7);
    const nextCandidateOccurrence = zonedDateTimeToUtc(
      nextCandidateDate,
      notification.time,
      notification.timeZone,
    );

    if (!nextCandidateOccurrence || nextCandidateOccurrence.getTime() > now.getTime()) {
      break;
    }

    candidateDate = nextCandidateDate;
    candidateOccurrence = nextCandidateOccurrence;
  }

  return candidateOccurrence;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function sendExpoPushBatch(messages: Array<{
  to: string;
  title: string;
  body: string;
  data: { notificationId: number };
}>) {
  const expoAccessToken = process.env.EXPO_ACCESS_TOKEN ?? config.EXPO_ACCESS_TOKEN;
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(expoAccessToken
        ? { authorization: "Bearer " + expoAccessToken }
        : {}),
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    throw new Error(`Expo push request failed (${response.status})`);
  }

  return (await response.json()) as {
    data?: Array<{
      status?: string;
      details?: { error?: string };
      message?: string;
    }>;
  };
}

async function dispatchDueAppNotifications() {
  const now = new Date();
  const notifications = (await db.notification.findMany({
    where: { deliveryMethods: { has: "APP" } },
    include: {
      user: {
        select: {
          pushDevices: {
            select: {
              id: true,
              expoPushToken: true,
              platform: true,
            },
          },
        },
      },
    },
    orderBy: [{ date: "asc" }, { time: "asc" }, { id: "asc" }],
  })) as NotificationWithDevices[];

  const dueNotifications = notifications
    .map((notification) => ({
      notification,
      dueAt: getLatestDueOccurrence(notification, now),
    }))
    .filter(
      (entry): entry is { notification: NotificationWithDevices; dueAt: Date } =>
        entry.dueAt !== null &&
        entry.notification.user.pushDevices.length > 0 &&
        (!entry.notification.appPushLastSentAt ||
          entry.notification.appPushLastSentAt.getTime() < entry.dueAt.getTime()),
    );

  const invalidTokens = new Set<string>();
  let sentCount = 0;

  for (const { notification, dueAt } of dueNotifications) {
    const messages = notification.user.pushDevices.map((pushDevice) => ({
      to: pushDevice.expoPushToken,
      title: "Unicorn Recipes",
      body: notification.message,
      data: { notificationId: notification.id },
    }));

    let successfulDeliveries = 0;
    for (const chunk of chunkArray(messages, 100)) {
      const payload = await sendExpoPushBatch(chunk);
      const results = payload.data ?? [];
      results.forEach((result, index) => {
        if (result.status === "ok") {
          successfulDeliveries += 1;
          return;
        }

        const token = chunk[index]?.to;
        if (token && result.details?.error === "DeviceNotRegistered") {
          invalidTokens.add(token);
        }
      });
    }

    if (successfulDeliveries > 0) {
      sentCount += successfulDeliveries;
      await db.notification.update({
        where: { id: notification.id },
        data: { appPushLastSentAt: dueAt },
      });
    }
  }

  if (invalidTokens.size > 0) {
    await db.pushDevice.deleteMany({
      where: { expoPushToken: { in: Array.from(invalidTokens) } },
    });
  }

  return {
    checkedCount: notifications.length,
    dueCount: dueNotifications.length,
    sentCount,
    invalidTokenCount: invalidTokens.size,
  };
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

  app.post<{ Body: PushTokenBody }>("/push-token", async (req, reply) => {
    const userId = await getUserIdFromRequest(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!userId) return;

    const parsedBody = pushTokenBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.badRequest(parsedBody.error.issues[0]?.message);
    }

    const pushDevice = await db.pushDevice.upsert({
      where: { expoPushToken: parsedBody.data.expoPushToken },
      update: {
        userId,
        platform: parsedBody.data.platform,
      },
      create: {
        userId,
        expoPushToken: parsedBody.data.expoPushToken,
        platform: parsedBody.data.platform,
      },
    });

    return reply.status(201).send(pushDevice);
  });

  app.delete<{ Body: PushTokenBody }>("/push-token", async (req, reply) => {
    const userId = await getUserIdFromRequest(
      req.headers as Record<string, string | string[] | undefined>,
    );
    if (!userId) return;

    const parsedBody = pushTokenBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.badRequest(parsedBody.error.issues[0]?.message);
    }

    await db.pushDevice.deleteMany({
      where: {
        userId,
        expoPushToken: parsedBody.data.expoPushToken,
      },
    });

    return reply.status(204).send();
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
        timeZone: parsedBody.data.timeZone,
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
          ...(parsedBody.data.timeZone !== undefined
            ? { timeZone: parsedBody.data.timeZone }
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
          appPushLastSentAt: null,
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

export async function internalNotificationRoutes(app: FastifyInstance) {
  app.post(
    "/dispatch-due",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsedHeaders = dispatchHeaderSchema.safeParse(req.headers ?? {});
      if (!parsedHeaders.success) {
        return reply.unauthorized("Missing dispatch secret");
      }

      const dispatchSecret =
        process.env.NOTIFICATION_DISPATCH_SECRET ??
        config.NOTIFICATION_DISPATCH_SECRET;

      if (!dispatchSecret) {
        return reply.serviceUnavailable("Dispatch secret is not configured");
      }

      if (
        parsedHeaders.data["x-notification-dispatch-secret"] !==
        dispatchSecret
      ) {
        return reply.unauthorized("Invalid dispatch secret");
      }

      try {
        const result = await dispatchDueAppNotifications();
        return reply.send(result);
      } catch (error) {
        req.log.error(error);
        return reply.internalServerError("Failed to dispatch notifications");
      }
    },
  );
}
