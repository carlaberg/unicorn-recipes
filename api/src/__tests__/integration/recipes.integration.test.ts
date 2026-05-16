import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { buildApp } from "../../app";

const mswServer = setupServer();
beforeAll(() => mswServer.listen());
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

vi.mock("../../db", () => ({
  default: {
    recipe: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    recipeIngredient: {
      deleteMany: vi.fn(),
    },
    ingredient: {
      upsert: vi.fn(),
    },
  },
}));

import db from "../../db";

const mockRecipe = {
  id: 1,
  name: "Test Recipe",
  image: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
  video: "https://res.cloudinary.com/demo/video/upload/sample.mp4",
  instructions: "Mix all ingredients and cook.",
  userId: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  ingredients: [],
};

describe("Recipe API Integration Tests", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /me/recipes", () => {
    it("returns 200 with list of recipes", async () => {
      vi.mocked(db.recipe.findMany).mockResolvedValue([mockRecipe] as any);

      const response = await app.inject({
        method: "GET",
        url: "/me/recipes",
        headers: { "x-user-id": "1" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe("Test Recipe");
    });
  });

  describe("POST /me/recipes/create", () => {
    it("returns 201 with created recipe", async () => {
      vi.mocked(db.recipe.create).mockResolvedValue(mockRecipe as any);
      const payload = {
        title: "Test Recipe",
        image: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        video: "https://res.cloudinary.com/demo/video/upload/sample.mp4",
        instructions: "Mix all ingredients and cook.",
        ingredients: [
          {
            name: "flour",
            amount: 2,
            unit: "cups",
          },
        ],
      };

      const response = await app.inject({
        method: "POST",
        url: "/me/recipes/create",
        headers: { "x-user-id": "1", "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.name).toBe("Test Recipe");
      expect(vi.mocked(db.recipe.create)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: payload.title,
            image: payload.image,
            video: payload.video,
            instructions: payload.instructions,
          }),
        }),
      );
    });
  });

  describe("GET /me/recipes/:recipeId", () => {
    it("returns 200 with recipe when found", async () => {
      vi.mocked(db.recipe.findFirst).mockResolvedValue(mockRecipe as any);

      const response = await app.inject({
        method: "GET",
        url: "/me/recipes/1",
        headers: { "x-user-id": "1" },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(1);
    });

    it("returns 404 when recipe not found", async () => {
      vi.mocked(db.recipe.findFirst).mockResolvedValue(null);

      const response = await app.inject({
        method: "GET",
        url: "/me/recipes/999",
        headers: { "x-user-id": "1" },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("PATCH /me/recipes/:recipeId", () => {
    it("returns 200 with updated recipe", async () => {
      vi.mocked(db.recipe.findFirst).mockResolvedValue(mockRecipe as any);
      vi.mocked(db.recipe.update).mockResolvedValue({
        ...mockRecipe,
        name: "Updated",
      } as any);

      const response = await app.inject({
        method: "PATCH",
        url: "/me/recipes/1",
        headers: { "x-user-id": "1", "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe("Updated");
    });

    it("updates image, video and instructions when provided", async () => {
      vi.mocked(db.recipe.findFirst).mockResolvedValue(mockRecipe as any);
      vi.mocked(db.recipe.update).mockResolvedValue({
        ...mockRecipe,
        image: "https://res.cloudinary.com/demo/image/upload/new.jpg",
        video: null,
        instructions: "New instructions",
      } as any);

      const payload = {
        image: "https://res.cloudinary.com/demo/image/upload/new.jpg",
        video: null,
        instructions: "New instructions",
      };

      const response = await app.inject({
        method: "PATCH",
        url: "/me/recipes/1",
        headers: { "x-user-id": "1", "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      expect(response.statusCode).toBe(200);
      expect(vi.mocked(db.recipe.update)).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            image: payload.image,
            video: payload.video,
            instructions: payload.instructions,
          }),
        }),
      );
    });

    it("replaces ingredients only when ingredients are provided", async () => {
      vi.mocked(db.recipe.findFirst).mockResolvedValue(mockRecipe as any);
      vi.mocked(db.recipeIngredient.deleteMany).mockResolvedValue({
        count: 1,
      } as any);
      vi.mocked(db.recipe.update).mockResolvedValue({
        ...mockRecipe,
        ingredients: [
          {
            amount: 1,
            unit: "cups",
            ingredient: { name: "flour" },
          },
        ],
      } as any);

      const payload = {
        ingredients: [{ name: "flour", amount: 1, unit: "cups" }],
      };

      const response = await app.inject({
        method: "PATCH",
        url: "/me/recipes/1",
        headers: { "x-user-id": "1", "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      expect(response.statusCode).toBe(200);
      expect(vi.mocked(db.recipeIngredient.deleteMany)).toHaveBeenCalledWith({
        where: { recipeId: 1 },
      });
    });

    it("returns 400 when no updatable fields are provided", async () => {
      vi.mocked(db.recipe.findFirst).mockResolvedValue(mockRecipe as any);

      const response = await app.inject({
        method: "PATCH",
        url: "/me/recipes/1",
        headers: { "x-user-id": "1", "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.statusCode).toBe(400);
      expect(vi.mocked(db.recipe.update)).not.toHaveBeenCalled();
    });

    it("returns 404 when recipe not found", async () => {
      vi.mocked(db.recipe.findFirst).mockResolvedValue(null);

      const response = await app.inject({
        method: "PATCH",
        url: "/me/recipes/999",
        headers: { "x-user-id": "1", "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("DELETE /me/recipes/:recipeId", () => {
    it("returns 204 when recipe deleted", async () => {
      vi.mocked(db.recipe.findFirst).mockResolvedValue(mockRecipe as any);
      vi.mocked(db.recipeIngredient.deleteMany).mockResolvedValue({
        count: 0,
      } as any);
      vi.mocked(db.recipe.delete).mockResolvedValue(mockRecipe as any);

      const response = await app.inject({
        method: "DELETE",
        url: "/me/recipes/1",
        headers: { "x-user-id": "1" },
      });

      expect(response.statusCode).toBe(204);
    });

    it("returns 404 when recipe not found", async () => {
      vi.mocked(db.recipe.findFirst).mockResolvedValue(null);

      const response = await app.inject({
        method: "DELETE",
        url: "/me/recipes/999",
        headers: { "x-user-id": "1" },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
