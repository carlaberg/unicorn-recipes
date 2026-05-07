import { describe, expect, it } from "vitest";
import { getUserIdFromRequest } from "../../utils/auth";

describe("getUserIdFromRequest", () => {
  it("returns parsed userId from x-user-id header", async () => {
    await expect(getUserIdFromRequest({ "x-user-id": "42" })).resolves.toBe(42);
  });

  it("defaults to 1 when header is not present", async () => {
    await expect(getUserIdFromRequest({})).resolves.toBe(1);
  });

  it("handles array header value by taking first element", async () => {
    await expect(
      getUserIdFromRequest({ "x-user-id": ["99", "100"] }),
    ).resolves.toBe(99);
  });

  it("returns NaN for non-numeric header value (parseInt behavior)", async () => {
    const result = await getUserIdFromRequest({ "x-user-id": "abc" });
    expect(isNaN(result)).toBe(true);
  });
});
