import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app";

vi.mock("../../db", () => ({
  default: {
    notification: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import db from "../../db";

const mockNotification = {
  id: 1,
  userId: 1,
  date: new Date("2026-10-01T00:00:00.000Z"),
  time: "18:30",
  message: "Hämta ingredienser",
  repeatsWeekly: true,
  deliveryMethods: ["APP", "SMS"],
  createdAt: new Date("2026-09-23T18:00:00.000Z"),
  updatedAt: new Date("2026-09-23T18:05:00.000Z"),
};

describe("Notification API Integration Tests", () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  it("lists notifications for the authenticated user", async () => {
    vi.mocked(db.notification.findMany).mockResolvedValue([mockNotification] as any);

    const response = await app.inject({
      method: "GET",
      url: "/me/notifications",
      headers: { "x-user-id": "1" },
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual([
      expect.objectContaining({
        id: 1,
        date: "2026-10-01",
        time: "18:30",
        message: "Hämta ingredienser",
      }),
    ]);
  });

  it("creates a notification", async () => {
    vi.mocked(db.notification.create).mockResolvedValue(mockNotification as any);

    const response = await app.inject({
      method: "POST",
      url: "/me/notifications",
      headers: { "x-user-id": "1", "content-type": "application/json" },
      body: JSON.stringify({
        date: "2026-10-01",
        time: "18:30",
        message: "Hämta ingredienser",
        repeatsWeekly: true,
        deliveryMethods: ["APP", "APP", "SMS"],
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(vi.mocked(db.notification.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 1,
          deliveryMethods: ["APP", "SMS"],
        }),
      }),
    );
  });

  it("updates a notification", async () => {
    vi.mocked(db.notification.findFirst).mockResolvedValueOnce(mockNotification as any);
    vi.mocked(db.notification.update).mockResolvedValue({
      ...mockNotification,
      message: "Ny text",
      repeatsWeekly: false,
      deliveryMethods: ["CALENDAR"],
    } as any);

    const response = await app.inject({
      method: "PATCH",
      url: "/me/notifications/1",
      headers: { "x-user-id": "1", "content-type": "application/json" },
      body: JSON.stringify({
        message: "Ny text",
        repeatsWeekly: false,
        deliveryMethods: ["CALENDAR"],
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(db.notification.update)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          message: "Ny text",
          repeatsWeekly: false,
          deliveryMethods: ["CALENDAR"],
        }),
      }),
    );
  });

  it("deletes a notification", async () => {
    vi.mocked(db.notification.findFirst).mockResolvedValueOnce({ id: 1 } as any);

    const response = await app.inject({
      method: "DELETE",
      url: "/me/notifications/1",
      headers: { "x-user-id": "1" },
    });

    expect(response.statusCode).toBe(204);
    expect(vi.mocked(db.notification.delete)).toHaveBeenCalledWith({
      where: { id: 1 },
    });
  });

  it("rejects invalid notification payloads", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/me/notifications",
      headers: { "x-user-id": "1", "content-type": "application/json" },
      body: JSON.stringify({
        date: "2026-10-01",
        time: "25:61",
        message: "",
        deliveryMethods: [],
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(vi.mocked(db.notification.create)).not.toHaveBeenCalled();
  });
});
