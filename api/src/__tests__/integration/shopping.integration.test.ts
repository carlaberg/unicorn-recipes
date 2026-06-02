import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app";

vi.mock("../../db", () => ({
  default: {
    weeklyMenu: {
      findMany: vi.fn(),
    },
  },
}));

import db from "../../db";

describe("Shopping API Integration Tests", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  it("aggregates ingredients across entries in date range and reports unit conflicts", async () => {
    vi.mocked(db.weeklyMenu.findMany).mockResolvedValue([
      {
        id: 1,
        userId: 1,
        name: "Week 21",
        startDate: new Date("2026-05-18T00:00:00.000Z"),
        menuEntries: [
          {
            id: 100,
            dayOffset: 1,
            recipeId: 10,
            recipe: {
              ingredients: [
                {
                  amount: 1,
                  unit: "cup",
                  ingredient: { name: "Sugar" },
                },
                {
                  amount: 1,
                  unit: "tsk",
                  ingredient: { name: "salt" },
                },
              ],
            },
          },
          {
            id: 101,
            dayOffset: 2,
            recipeId: 11,
            recipe: {
              ingredients: [
                {
                  amount: 2,
                  unit: "dl",
                  ingredient: { name: "sugar" },
                },
                {
                  amount: 5,
                  unit: "g",
                  ingredient: { name: "salt" },
                },
              ],
            },
          },
          {
            id: 102,
            dayOffset: 6,
            recipeId: 12,
            recipe: {
              ingredients: [
                {
                  amount: 10,
                  unit: "dl",
                  ingredient: { name: "flour" },
                },
              ],
            },
          },
          {
            id: 103,
            dayOffset: 2,
            recipeId: null,
            note: "Restmiddag",
            recipe: null,
          },
        ],
      },
    ] as any);

    const response = await app.inject({
      method: "GET",
      url: "/me/menus/shopping?startDate=2026-05-19&endDate=2026-05-20",
      headers: { "x-user-id": "1" },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as {
      items: Array<{
        ingredientName: string;
        unit: string;
        totalAmount: number;
        recipeCount: number;
        entryCount: number;
      }>;
      conflicts: Array<{ ingredientName: string; units: string[] }>;
    };

    expect(body.items).toEqual([
      {
        ingredientName: "salt",
        unit: "g",
        totalAmount: 5,
        recipeCount: 1,
        entryCount: 1,
      },
      {
        ingredientName: "salt",
        unit: "tsk",
        totalAmount: 1,
        recipeCount: 1,
        entryCount: 1,
      },
      {
        ingredientName: "sugar",
        unit: "dl",
        totalAmount: 4.4,
        recipeCount: 2,
        entryCount: 2,
      },
    ]);

    expect(body.conflicts).toEqual([
      {
        ingredientName: "salt",
        units: ["g", "tsk"],
      },
    ]);
  });

  it("returns 400 for invalid date range", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/me/menus/shopping?startDate=2026-05-21&endDate=2026-05-20",
      headers: { "x-user-id": "1" },
    });

    expect(response.statusCode).toBe(400);
  });
});
