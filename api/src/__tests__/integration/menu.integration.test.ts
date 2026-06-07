import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app";

vi.mock("../../db", () => ({
  default: {
    weeklyMenu: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    recipe: {
      findFirst: vi.fn(),
    },
    menuEntry: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

import db from "../../db";

describe("Menu API Integration Tests", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();

    vi.mocked(db.weeklyMenu.findFirst).mockResolvedValue({
      id: 1,
      userId: 1,
    } as any);
  });

  afterEach(async () => {
    await app.close();
  });

  it("upserts a note-only menu entry", async () => {
    vi.mocked(db.menuEntry.upsert).mockResolvedValue({
      id: 123,
      weeklyMenuId: 1,
      dayOffset: 2,
      mealType: "DINNER",
      recipeId: null,
      note: "Rester",
      recipe: null,
    } as any);

    const response = await app.inject({
      method: "PUT",
      url: "/me/menus/1/2/DINNER",
      headers: { "x-user-id": "1", "content-type": "application/json" },
      body: JSON.stringify({ note: "Rester" }),
    });

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(db.menuEntry.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          recipeId: null,
          note: "Rester",
        }),
        update: expect.objectContaining({
          recipeId: null,
          note: "Rester",
        }),
      }),
    );
  });

  it("rejects payload with both recipeId and note", async () => {
    const response = await app.inject({
      method: "PUT",
      url: "/me/menus/1/2/LUNCH",
      headers: { "x-user-id": "1", "content-type": "application/json" },
      body: JSON.stringify({ recipeId: 1, note: "Rester" }),
    });

    expect(response.statusCode).toBe(400);
    expect(vi.mocked(db.menuEntry.upsert)).not.toHaveBeenCalled();
  });

  it("creates a planned menu from a template menu", async () => {
    vi.mocked(db.weeklyMenu.findFirst)
      .mockResolvedValueOnce({
        id: 10,
        userId: 1,
        name: "Meny Mall",
        menuEntries: [
          {
            dayOffset: 0,
            mealType: "LUNCH",
            recipeId: 22,
            note: null,
          },
        ],
      } as any)
      .mockResolvedValueOnce({
        id: 11,
        userId: 1,
        name: "Meny Mall",
        startDate: new Date("2026-06-15"),
        menuEntries: [],
      } as any);

    vi.mocked(db.weeklyMenu.create).mockResolvedValue({
      id: 11,
      userId: 1,
      name: "Meny Mall",
      startDate: new Date("2026-06-15"),
    } as any);

    vi.mocked(db.menuEntry.createMany).mockResolvedValue({ count: 1 } as any);

    const response = await app.inject({
      method: "POST",
      url: "/me/menus/plan",
      headers: { "x-user-id": "1", "content-type": "application/json" },
      body: JSON.stringify({
        templateMenuId: 10,
        startDate: "2026-06-15",
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(vi.mocked(db.weeklyMenu.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 1,
          startDate: new Date("2026-06-15"),
        }),
      }),
    );
    expect(vi.mocked(db.menuEntry.createMany)).toHaveBeenCalled();
  });
});
