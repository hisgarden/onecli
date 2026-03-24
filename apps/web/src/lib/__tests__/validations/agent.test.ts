import { describe, it, expect } from "bun:test";
import {
  IDENTIFIER_REGEX,
  createAgentSchema,
  renameAgentSchema,
  secretModeSchema,
  updateAgentSecretsSchema,
} from "@/lib/validations/agent";

describe("IDENTIFIER_REGEX", () => {
  it("should accept valid identifiers", () => {
    expect(IDENTIFIER_REGEX.test("my-agent")).toBe(true);
    expect(IDENTIFIER_REGEX.test("a")).toBe(true);
    expect(IDENTIFIER_REGEX.test("agent1")).toBe(true);
    expect(IDENTIFIER_REGEX.test("my-agent-v2")).toBe(true);
    expect(IDENTIFIER_REGEX.test("a".repeat(50))).toBe(true);
  });

  it("should reject invalid identifiers", () => {
    expect(IDENTIFIER_REGEX.test("")).toBe(false);
    expect(IDENTIFIER_REGEX.test("1agent")).toBe(false); // starts with number
    expect(IDENTIFIER_REGEX.test("-agent")).toBe(false); // starts with hyphen
    expect(IDENTIFIER_REGEX.test("Agent")).toBe(false); // uppercase
    expect(IDENTIFIER_REGEX.test("my_agent")).toBe(false); // underscore
    expect(IDENTIFIER_REGEX.test("my agent")).toBe(false); // space
    expect(IDENTIFIER_REGEX.test("a".repeat(51))).toBe(false); // too long
  });
});

describe("createAgentSchema", () => {
  it("should accept valid input", () => {
    const result = createAgentSchema.safeParse({
      name: "My Agent",
      identifier: "my-agent",
    });
    expect(result.success).toBe(true);
  });

  it("should trim name", () => {
    const result = createAgentSchema.safeParse({
      name: "  My Agent  ",
      identifier: "my-agent",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("My Agent");
    }
  });

  it("should reject empty name", () => {
    const result = createAgentSchema.safeParse({
      name: "",
      identifier: "my-agent",
    });
    expect(result.success).toBe(false);
  });

  it("should reject name > 255 chars", () => {
    const result = createAgentSchema.safeParse({
      name: "a".repeat(256),
      identifier: "my-agent",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid identifier", () => {
    const result = createAgentSchema.safeParse({
      name: "My Agent",
      identifier: "Invalid!",
    });
    expect(result.success).toBe(false);
  });
});

describe("renameAgentSchema", () => {
  it("should accept valid name", () => {
    const result = renameAgentSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("should reject empty name", () => {
    const result = renameAgentSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("secretModeSchema", () => {
  it("should accept 'all'", () => {
    expect(secretModeSchema.safeParse({ mode: "all" }).success).toBe(true);
  });

  it("should accept 'selective'", () => {
    expect(secretModeSchema.safeParse({ mode: "selective" }).success).toBe(
      true,
    );
  });

  it("should reject invalid mode", () => {
    expect(secretModeSchema.safeParse({ mode: "invalid" }).success).toBe(false);
  });
});

describe("updateAgentSecretsSchema", () => {
  it("should accept array of strings", () => {
    const result = updateAgentSecretsSchema.safeParse({
      secretIds: ["id1", "id2"],
    });
    expect(result.success).toBe(true);
  });

  it("should accept empty array", () => {
    const result = updateAgentSecretsSchema.safeParse({ secretIds: [] });
    expect(result.success).toBe(true);
  });

  it("should reject non-string array elements", () => {
    const result = updateAgentSecretsSchema.safeParse({ secretIds: [123] });
    expect(result.success).toBe(false);
  });
});
