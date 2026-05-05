import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import db from "../db";
import {
    UserCreateInputSchema,
    UserUpdateInputSchema,
} from "../prisma/generated/zod";

type CreateUserBody = z.infer<typeof UserCreateInputSchema>;
type UpdateUserBody = z.infer<typeof UserUpdateInputSchema>;

interface UserParams {
  userId: string;
}

export async function userRoutes(app: FastifyInstance) {
  // GET /users
  app.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
    const users = await db.user.findMany();
    return reply.send(users);
  });

  // GET /users/:userId
  app.get(
    "/:userId",
    async (
      request: FastifyRequest<{ Params: UserParams }>,
      reply: FastifyReply,
    ) => {
      const userId = parseInt(request.params.userId, 10);
      const user = await db.user.findUnique({ where: { id: userId } });

      if (!user) {
        return reply.notFound();
      }

      return reply.send(user);
    },
  );

  // POST /users
  app.post<{ Body: CreateUserBody }>(
    "/",
    async (
      request: FastifyRequest<{ Body: CreateUserBody }>,
      reply: FastifyReply,
    ) => {
      const { email, username, clerkId } = request.body;

      const user = await db.user.create({
        data: { email, username, clerkId },
      });

      return reply.status(201).send(user);
    },
  );

  // PATCH /users/:userId
  app.patch<{ Params: UserParams; Body: UpdateUserBody }>(
    "/:userId",
    async (
      request: FastifyRequest<{ Params: UserParams; Body: UpdateUserBody }>,
      reply: FastifyReply,
    ) => {
      const userId = parseInt(request.params.userId, 10);

      const existing = await db.user.findUnique({ where: { id: userId } });
      if (!existing) {
        return reply.notFound();
      }

      const { email, username, clerkId } = request.body;

      const user = await db.user.update({
        where: { id: userId },
        data: {
          ...(email !== undefined && { email }),
          ...(username !== undefined && { username }),
          ...(clerkId !== undefined && { clerkId }),
        },
      });

      return reply.send(user);
    },
  );

  // DELETE /users/:userId
  app.delete(
    "/:userId",
    async (
      request: FastifyRequest<{ Params: UserParams }>,
      reply: FastifyReply,
    ) => {
      const userId = parseInt(request.params.userId, 10);

      const existing = await db.user.findUnique({ where: { id: userId } });
      if (!existing) {
        return reply.notFound();
      }

      await db.user.delete({ where: { id: userId } });

      return reply.status(204).send();
    },
  );
}
