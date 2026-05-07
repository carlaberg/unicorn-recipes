import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import db from "../db";
import { getUserIdFromRequest } from "../utils/auth";

const execFileAsync = promisify(execFile);

const recipeIngredientInputSchema = z.object({
  name: z.string().trim().min(1),
  amount: z.coerce.number().positive(),
  unit: z.string().trim().min(1),
});

const createRecipeBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
    image: z.string().trim().url(),
    video: z.string().trim().url().optional(),
    instructions: z.string().trim().min(1),
    ingredients: z.array(recipeIngredientInputSchema).default([]),
  })
  .refine((value) => Boolean(value.name || value.title), {
    message: "name or title is required",
    path: ["title"],
  });

const updateRecipeBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  ingredients: z.array(recipeIngredientInputSchema).optional(),
});

type CreateRecipeBody = z.infer<typeof createRecipeBodySchema>;
type UpdateRecipeBody = z.infer<typeof updateRecipeBodySchema>;

const cleanupAssetsBodySchema = z.object({
  urls: z.array(z.string().trim().url()).min(1),
});

type CleanupAssetsBody = z.infer<typeof cleanupAssetsBodySchema>;

const proxyAssetQuerySchema = z.object({
  url: z.string().trim().url(),
});

type ProxyAssetQuery = z.infer<typeof proxyAssetQuerySchema>;

interface RecipeParams {
  recipeId: string;
}

function getCloudinaryAssetDetails(assetUrl: string) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

  if (!cloudName) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(assetUrl);
  } catch {
    return null;
  }

  if (parsedUrl.hostname !== "res.cloudinary.com") {
    return null;
  }

  const pathnameParts = parsedUrl.pathname.split("/").filter(Boolean);
  if (pathnameParts[0] !== cloudName) {
    return null;
  }

  const uploadIndex = pathnameParts.indexOf("upload");
  if (uploadIndex < 2 || uploadIndex >= pathnameParts.length - 1) {
    return null;
  }

  const resourceType = pathnameParts[uploadIndex - 1];
  const publicIdParts = pathnameParts.slice(uploadIndex + 1);

  if (publicIdParts.length === 0) {
    return null;
  }

  // Cloudinary version segments look like v1714763456 and should not be part of public_id.
  if (/^v\d+$/.test(publicIdParts[0])) {
    publicIdParts.shift();
  }

  if (publicIdParts.length === 0) {
    return null;
  }

  const lastPart = publicIdParts[publicIdParts.length - 1];
  const extensionIndex = lastPart.lastIndexOf(".");
  publicIdParts[publicIdParts.length - 1] =
    extensionIndex > 0 ? lastPart.slice(0, extensionIndex) : lastPart;

  const publicId = publicIdParts.join("/");
  if (!publicId) {
    return null;
  }

  return {
    resourceType,
    publicId,
  };
}

function signCloudinaryDestroyRequest(
  publicId: string,
  timestamp: number,
  apiSecret: string,
) {
  const toSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  return createHash("sha1").update(toSign).digest("hex");
}

async function deleteCloudinaryAssetByUrl(url: string) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary cleanup is not configured on the API server");
  }

  const details = getCloudinaryAssetDetails(url);

  if (!details) {
    throw new Error("Unsupported or invalid Cloudinary URL");
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signCloudinaryDestroyRequest(
    details.publicId,
    timestamp,
    apiSecret,
  );

  const body = new URLSearchParams({
    public_id: details.publicId,
    api_key: apiKey,
    timestamp: timestamp.toString(),
    signature,
    invalidate: "true",
  });

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${details.resourceType}/destroy`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  const responseJson = (await response.json().catch(() => ({}))) as {
    result?: string;
    error?: { message?: string };
  };

  if (!response.ok || responseJson.result === "not found") {
    const message =
      responseJson.error?.message ||
      `Failed to delete Cloudinary asset (status ${response.status})`;
    throw new Error(message);
  }
}

function isAllowedCloudinaryUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return false;
    }

    if (parsed.hostname !== "res.cloudinary.com") {
      return false;
    }

    const pathnameParts = parsed.pathname.split("/").filter(Boolean);
    if (pathnameParts.length < 4) {
      return false;
    }

    // Expected: /<cloud-name>/image/upload/<asset>
    return pathnameParts[1] === "image" && pathnameParts[2] === "upload";
  } catch {
    return false;
  }
}

function inferImageContentType(url: string) {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes(".png")) {
    return "image/png";
  }
  if (lowerUrl.includes(".webp")) {
    return "image/webp";
  }
  if (lowerUrl.includes(".gif")) {
    return "image/gif";
  }
  return "image/jpeg";
}

async function fetchImageBufferWithCurl(url: string) {
  const { stdout } = await execFileAsync(
    "curl",
    ["-sSL", "--fail", "--max-time", "20", url],
    {
      encoding: "buffer",
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  return Buffer.from(stdout as Buffer);
}

export async function recipeRoutes(app: FastifyInstance) {
  // GET /me/recipes
  app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = await getUserIdFromRequest(
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
      const userId = await getUserIdFromRequest(
        request.headers as Record<string, string | string[] | undefined>,
      );
      const parsedBody = createRecipeBodySchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply.status(400).send({
          message: "Invalid request body",
          errors: parsedBody.error.flatten(),
        });
      }

      const {
        name,
        title,
        image,
        video,
        instructions,
        ingredients = [],
      } = parsedBody.data;

      const recipe = await db.recipe.create({
        data: {
          name: (title ?? name) as string,
          image,
          video,
          instructions,
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

  // POST /me/recipes/assets/cleanup
  app.post<{ Body: CleanupAssetsBody }>(
    "/assets/cleanup",
    async (
      request: FastifyRequest<{ Body: CleanupAssetsBody }>,
      reply: FastifyReply,
    ) => {
      // Ensure the request is authenticated similarly to recipe mutations.
      await getUserIdFromRequest(
        request.headers as Record<string, string | string[] | undefined>,
      );

      const parsedBody = cleanupAssetsBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          message: "Invalid request body",
          errors: parsedBody.error.flatten(),
        });
      }

      const cleanupResults = await Promise.allSettled(
        parsedBody.data.urls.map((url) => deleteCloudinaryAssetByUrl(url)),
      );

      const failed = cleanupResults
        .map((result, index) => ({ result, url: parsedBody.data.urls[index] }))
        .filter(
          (entry): entry is { result: PromiseRejectedResult; url: string } =>
            entry.result.status === "rejected",
        )
        .map((entry) => ({
          url: entry.url,
          reason:
            entry.result.reason instanceof Error
              ? entry.result.reason.message
              : "Unknown cleanup error",
        }));

      if (failed.length > 0) {
        return reply.status(502).send({
          message: "Failed to clean up some Cloudinary assets",
          failed,
        });
      }

      return reply.status(204).send();
    },
  );

  // GET /me/recipes/assets/proxy?url=https://res.cloudinary.com/...
  app.get<{ Querystring: ProxyAssetQuery }>(
    "/assets/proxy",
    async (
      request: FastifyRequest<{ Querystring: ProxyAssetQuery }>,
      reply: FastifyReply,
    ) => {
      const parsedQuery = proxyAssetQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          message: "Invalid query",
          errors: parsedQuery.error.flatten(),
        });
      }

      const { url } = parsedQuery.data;
      if (!isAllowedCloudinaryUrl(url)) {
        return reply.status(400).send({
          message: "Only Cloudinary image URLs for this project are supported",
        });
      }

      let imageBuffer: Buffer;
      try {
        imageBuffer = await fetchImageBufferWithCurl(url);
      } catch {
        return reply
          .status(502)
          .send({ message: "Failed to fetch remote asset" });
      }

      const contentType = inferImageContentType(url);

      reply.header("content-type", contentType);
      reply.header("cache-control", "public, max-age=3600");
      return reply.send(imageBuffer);
    },
  );

  // GET /me/recipes/:recipeId
  app.get(
    "/:recipeId",
    async (
      request: FastifyRequest<{ Params: RecipeParams }>,
      reply: FastifyReply,
    ) => {
      const userId = await getUserIdFromRequest(
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
      const userId = await getUserIdFromRequest(
        request.headers as Record<string, string | string[] | undefined>,
      );
      const recipeId = parseInt(request.params.recipeId, 10);

      const existing = await db.recipe.findFirst({
        where: { id: recipeId, userId },
      });

      if (!existing) {
        return reply.notFound();
      }

      const parsedBody = updateRecipeBodySchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply.status(400).send({
          message: "Invalid request body",
          errors: parsedBody.error.flatten(),
        });
      }

      const { name, ingredients } = parsedBody.data;

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
      const userId = await getUserIdFromRequest(
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
