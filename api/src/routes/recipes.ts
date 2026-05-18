import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { z } from "zod";
import { config } from "../config";
import db from "../db";
import { getUserIdFromRequest } from "../utils/auth";

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

const updateRecipeBodySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).optional(),
    image: z.string().trim().url().optional(),
    video: z.string().trim().url().nullable().optional(),
    instructions: z.string().trim().min(1).optional(),
    ingredients: z.array(recipeIngredientInputSchema).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.title !== undefined ||
      value.image !== undefined ||
      value.video !== undefined ||
      value.instructions !== undefined ||
      value.ingredients !== undefined,
    {
      message: "At least one field is required",
      path: ["name"],
    },
  );

type CreateRecipeBody = z.infer<typeof createRecipeBodySchema>;
type UpdateRecipeBody = z.infer<typeof updateRecipeBodySchema>;

const cleanupAssetsBodySchema = z.object({
  urls: z.array(z.string().trim().url()).min(1),
});

type CleanupAssetsBody = z.infer<typeof cleanupAssetsBodySchema>;

const scanRecipeBodySchema = z.object({
  rawText: z.string().trim().min(1),
});

const allowedIngredientUnits = [
  "cups",
  "tbsp",
  "tsp",
  "g",
  "kg",
  "ml",
  "l",
  "pieces",
  "pinches",
] as const;

const scanRecipeResponseSchema = z.object({
  title: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  ingredients: z.array(
    z.object({
      name: z.string().trim().min(1),
      amount: z.coerce.number().nonnegative(),
      unit: z.enum(allowedIngredientUnits),
    }),
  ),
});

type ScanRecipeBody = z.infer<typeof scanRecipeBodySchema>;

const proxyAssetQuerySchema = z.object({
  url: z.string().trim().url(),
});

type ProxyAssetQuery = z.infer<typeof proxyAssetQuerySchema>;

interface RecipeParams {
  recipeId: string;
}

const geminiGenerateContentSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({
          parts: z.array(
            z.object({
              text: z.string(),
            }),
          ),
        }),
      }),
    )
    .min(1),
});

function stripCodeFences(text: string) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractStructuredRecipe(
  geminiResponse: z.infer<typeof geminiGenerateContentSchema>,
  log?: { warn: (obj: unknown, msg: string) => void },
) {
  const text = geminiResponse.candidates
    .flatMap((candidate) => candidate.content.parts)
    .map((part) => part.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response");
  }

  const stripped = stripCodeFences(text);
  const parsedJson = JSON.parse(stripped);
  const parsedRecipe = scanRecipeResponseSchema.safeParse(parsedJson);
  if (!parsedRecipe.success) {
    log?.warn(
      { geminiText: stripped, issues: parsedRecipe.error.issues },
      "Gemini response did not match recipe schema",
    );
    throw new Error("Gemini response did not match recipe schema");
  }

  return parsedRecipe.data;
}

function buildScanPrompt(rawText: string) {
  const units = allowedIngredientUnits.join(" | ");
  return [
    "Extract recipe data from OCR text.",
    "Return only valid minified JSON with this exact shape:",
    '{"title":"string","instructions":"string","ingredients":[{"name":"string","amount":1.5,"unit":"cups"}]}',
    `Allowed ingredient units: ${units}.`,
    "IMPORTANT unit conversion rules — always convert to an allowed unit:",
    "  msk/tbsp/matsked → tbsp",
    "  tsk/tesked → tsp",
    "  dl → ml (multiply amount by 100, e.g. 0.5 dl = 50 ml)",
    "  cl → ml (multiply amount by 10)",
    "  liter/litre → l",
    "  st/stycken/pieces/pcs → pieces",
    "  krm/kryddmått/nypa/pinch → pinches",
    "  gram → g",
    "  kilo/kilogram → kg",
    "  If no unit is given, use 'pieces'.",
    "Always use a dot (.) as the decimal separator, never a comma.",
    "If an ingredient has no stated amount, use 1.",
    "Do not include markdown, comments, or extra keys.",
    "If the recipe title or instructions are missing, use empty strings and an empty ingredients array.",
    "OCR text:",
    rawText,
  ].join("\n");
}

function getCloudinaryCleanupConfig() {
  const cloudName =
    process.env.CLOUDINARY_CLOUD_NAME ??
    process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  return {
    cloudName,
    apiKey,
    apiSecret,
  };
}

function getCloudinaryAssetDetails(assetUrl: string) {
  const { cloudName } = getCloudinaryCleanupConfig();

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
  const toSign = `invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  return createHash("sha1").update(toSign).digest("hex");
}

async function deleteCloudinaryAssetByUrl(url: string) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryCleanupConfig();

  if (!cloudName || !apiKey || !apiSecret) {
    const missingVars = [
      !cloudName
        ? "CLOUDINARY_CLOUD_NAME or EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME"
        : null,
      !apiKey ? "CLOUDINARY_API_KEY" : null,
      !apiSecret ? "CLOUDINARY_API_SECRET" : null,
    ].filter(Boolean);

    throw new Error(
      `Cloudinary cleanup is not configured on the API server. Missing: ${missingVars.join(", ")}`,
    );
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

async function fetchImageBuffer(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      accept: "image/avif,image/webp,image/*,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image (status ${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const contentType =
    response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";

  if (!contentType.startsWith("image/")) {
    throw new Error(`Upstream returned non-image content-type: ${contentType}`);
  }

  return {
    imageBuffer: Buffer.from(arrayBuffer),
    contentType,
  };
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

  // POST /me/recipes/scan
  app.post<{ Body: ScanRecipeBody }>(
    "/scan",
    async (
      request: FastifyRequest<{ Body: ScanRecipeBody }>,
      reply: FastifyReply,
    ) => {
      await getUserIdFromRequest(
        request.headers as Record<string, string | string[] | undefined>,
      );

      const parsedBody = scanRecipeBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          message: "Invalid request body",
          errors: parsedBody.error.flatten(),
        });
      }

      if (!config.GEMINI_API_KEY) {
        return reply.status(503).send({
          message: "Recipe scan is not configured",
        });
      }

      try {
        const prompt = buildScanPrompt(parsedBody.data.rawText);
        request.log.info(
          { rawTextLength: parsedBody.data.rawText.length },
          "[Gemini] OCR input received",
        );
        request.log.info(
          { prompt },
          "[Gemini] Full prompt being sent to model",
        );

        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": config.GEMINI_API_KEY,
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [{ text: prompt }],
                },
              ],
              generationConfig: {
                responseMimeType: "application/json",
              },
            }),
            signal: AbortSignal.timeout(20_000),
          },
        );

        if (!response.ok) {
          request.log.error(
            {
              status: response.status,
              body: await response.text().catch(() => ""),
            },
            "Gemini scan request failed",
          );
          return reply.status(502).send({ message: "Failed to scan recipe" });
        }

        const responseJson = await response.json();
        const parsedGeminiResponse =
          geminiGenerateContentSchema.safeParse(responseJson);
        if (!parsedGeminiResponse.success) {
          request.log.error(
            { errors: parsedGeminiResponse.error.flatten() },
            "Gemini response did not include candidates",
          );
          return reply
            .status(502)
            .send({ message: "Failed to parse scan response" });
        }

        try {
          const scanResult = extractStructuredRecipe(
            parsedGeminiResponse.data,
            request.log,
          );
          return reply.status(200).send(scanResult);
        } catch (error) {
          request.log.warn(
            {
              reason: error instanceof Error ? error.message : String(error),
            },
            "Gemini response failed recipe schema validation",
          );
          return reply.status(422).send({
            message: "Could not parse recipe from OCR text",
          });
        }
      } catch (error) {
        request.log.error(
          { reason: error instanceof Error ? error.message : String(error) },
          "Recipe scan failed",
        );
        return reply.status(502).send({ message: "Failed to scan recipe" });
      }
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
        request.log.error({ failed }, "Cloudinary asset cleanup failed");
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
      let contentType: string;
      try {
        const fetchedAsset = await fetchImageBuffer(url);
        imageBuffer = fetchedAsset.imageBuffer;
        contentType = fetchedAsset.contentType;
      } catch (error) {
        request.log.error(
          {
            assetUrl: url,
            reason: error instanceof Error ? error.message : String(error),
            err: error,
          },
          "Asset proxy upstream fetch failed",
        );

        return reply
          .status(502)
          .send({ message: "Failed to fetch remote asset" });
      }

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

      const { name, title, image, video, instructions, ingredients } =
        parsedBody.data;
      const nextName = title ?? name;

      if (ingredients !== undefined) {
        await db.recipeIngredient.deleteMany({ where: { recipeId } });
      }

      const recipe = await db.recipe.update({
        where: { id: recipeId },
        data: {
          ...(nextName !== undefined && { name: nextName }),
          ...(image !== undefined && { image }),
          ...(video !== undefined && { video }),
          ...(instructions !== undefined && { instructions }),
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
