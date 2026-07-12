import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("password hashing", () => {
  it("verifies only the original password", async () => {
    const envelope = await hashPassword("AssetFlow123!", "test-pepper-at-least-sixteen");
    expect(await verifyPassword("AssetFlow123!", envelope, "test-pepper-at-least-sixteen")).toBe(true);
    expect(await verifyPassword("wrong-password", envelope, "test-pepper-at-least-sixteen")).toBe(false);
  });
});

