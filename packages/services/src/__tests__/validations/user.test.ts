import { describe, it, expect } from "bun:test";
import { updateProfileSchema } from "../../validations/user";

describe("updateProfileSchema", () => {
  it("accepts a normal name", () => {
    const result = updateProfileSchema.parse({ name: "Alice" });
    expect(result.name).toBe("Alice");
  });

  it("trims surrounding whitespace", () => {
    const result = updateProfileSchema.parse({ name: "  Alice  " });
    expect(result.name).toBe("Alice");
  });

  it("rejects an empty string", () => {
    expect(() => updateProfileSchema.parse({ name: "" })).toThrow();
  });

  it("rejects a whitespace-only string (treated as empty after trim)", () => {
    expect(() => updateProfileSchema.parse({ name: "   " })).toThrow();
  });

  it("rejects a missing name field", () => {
    expect(() => updateProfileSchema.parse({})).toThrow();
  });

  it("rejects a non-string name", () => {
    expect(() => updateProfileSchema.parse({ name: 42 })).toThrow();
  });

  it("accepts a name at the maximum length (255 chars)", () => {
    const name = "a".repeat(255);
    const result = updateProfileSchema.parse({ name });
    expect(result.name).toBe(name);
  });

  it("rejects a name longer than 255 chars", () => {
    const name = "a".repeat(256);
    expect(() => updateProfileSchema.parse({ name })).toThrow();
  });

  it("rejects a name that becomes too long only because of leading whitespace (trim happens first)", () => {
    // 254 spaces + 254 letters = 508 total, but trims to 254 → valid
    const name = " ".repeat(254) + "a".repeat(254);
    const result = updateProfileSchema.parse({ name });
    expect(result.name).toBe("a".repeat(254));
  });
});
