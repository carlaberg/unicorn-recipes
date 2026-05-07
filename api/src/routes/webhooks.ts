import { verifyWebhook } from "@clerk/backend/webhooks";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config";
import db from "../db";

type ClerkEmailAddress = {
  id?: string;
  email_address?: string;
};

type ClerkUserPayload = {
  id?: string;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  primary_email_address_id?: string | null;
  email_addresses?: ClerkEmailAddress[];
};

function getPreferredEmail(payload: ClerkUserPayload) {
  const primary = payload.email_addresses?.find(
    (email) => email.id === payload.primary_email_address_id,
  );

  return primary?.email_address ?? payload.email_addresses?.[0]?.email_address;
}

function toUsername(
  payload: ClerkUserPayload,
  fallbackEmail: string,
  clerkId: string,
) {
  const nameCandidate =
    payload.username ??
    [payload.first_name, payload.last_name].filter(Boolean).join("_") ??
    fallbackEmail.split("@")[0] ??
    clerkId.slice(-12);

  const normalized = nameCandidate.replace(/[^a-zA-Z0-9_]/g, "_");
  return `${normalized}_${clerkId.slice(-6)}`;
}

async function deleteUserAndRecipes(clerkId: string) {
  const user = await db.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });

  if (!user) {
    return;
  }

  const recipes = await db.recipe.findMany({
    where: { userId: user.id },
    select: { id: true },
  });

  const recipeIds = recipes.map((recipe) => recipe.id);

  if (recipeIds.length > 0) {
    await db.recipeIngredient.deleteMany({
      where: { recipeId: { in: recipeIds } },
    });

    await db.recipe.deleteMany({ where: { id: { in: recipeIds } } });
  }

  await db.user.delete({ where: { id: user.id } });
}

export async function clerkWebhookRoutes(app: FastifyInstance) {
  app.post(
    "/clerk",
    {
      config: {
        rawBody: true,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!config.CLERK_WEBHOOK_SIGNING_SECRET) {
        request.log.error(
          "Missing CLERK_WEBHOOK_SIGNING_SECRET; Clerk webhooks cannot be verified.",
        );
        return reply.status(500).send({
          message: "Webhook signing secret is not configured",
        });
      }

      if (!request.rawBody || typeof request.rawBody !== "string") {
        return reply.status(400).send({ message: "Missing raw webhook body" });
      }

      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]) => {
        if (typeof value === "string") {
          headers.set(key, value);
          return;
        }

        if (Array.isArray(value)) {
          headers.set(key, value.join(","));
        }
      });

      let event;
      try {
        event = await verifyWebhook(
          new Request("http://localhost/webhooks/clerk", {
            method: "POST",
            headers,
            body: request.rawBody,
          }),
          { signingSecret: config.CLERK_WEBHOOK_SIGNING_SECRET },
        );
      } catch (error) {
        request.log.warn({ error }, "Failed to verify Clerk webhook");
        return reply.status(400).send({ message: "Invalid webhook signature" });
      }

      if (event.type === "user.deleted") {
        const payload = event.data as { id?: string | null };
        if (!payload.id) {
          return reply.status(200).send({ received: true, ignored: true });
        }

        await deleteUserAndRecipes(payload.id);
        return reply.status(200).send({ received: true });
      }

      if (event.type === "user.created" || event.type === "user.updated") {
        const payload = event.data as ClerkUserPayload;
        const clerkId = payload.id;

        if (!clerkId) {
          return reply
            .status(400)
            .send({ message: "Webhook missing Clerk user id" });
        }

        const email = getPreferredEmail(payload) ?? `${clerkId}@clerk.local`;
        const username = toUsername(payload, email, clerkId);

        await db.user.upsert({
          where: { clerkId },
          create: {
            clerkId,
            email,
            username,
          },
          update: {
            email,
            username,
          },
        });

        return reply.status(200).send({ received: true });
      }

      return reply.status(200).send({ received: true, ignored: true });
    },
  );
}
