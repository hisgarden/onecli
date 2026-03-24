import { describe, it, expect } from "bun:test";
import {
  createSecretSchema,
  updateSecretSchema,
  detectAnthropicAuthMode,
  parseAnthropicMetadata,
} from "../../validations/secret";

describe("createSecretSchema", () => {
  const validAnthropicInput = {
    name: "My API Key",
    type: "anthropic" as const,
    value: "sk-ant-api03-secret",
    hostPattern: "api.anthropic.com",
  };

  it("should accept valid anthropic secret", () => {
    const result = createSecretSchema.safeParse(validAnthropicInput);
    expect(result.success).toBe(true);
  });

  it("should accept valid generic secret", () => {
    const result = createSecretSchema.safeParse({
      name: "Custom Key",
      type: "generic",
      value: "my-key-123",
      hostPattern: "api.example.com",
      pathPattern: "/v1/*",
      injectionConfig: { headerName: "x-api-key" },
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty name", () => {
    const result = createSecretSchema.safeParse({
      ...validAnthropicInput,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject name > 255 chars", () => {
    const result = createSecretSchema.safeParse({
      ...validAnthropicInput,
      name: "a".repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty value", () => {
    const result = createSecretSchema.safeParse({
      ...validAnthropicInput,
      value: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject value > 10000 chars", () => {
    const result = createSecretSchema.safeParse({
      ...validAnthropicInput,
      value: "a".repeat(10001),
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid type", () => {
    const result = createSecretSchema.safeParse({
      ...validAnthropicInput,
      type: "invalid",
    });
    expect(result.success).toBe(false);
  });

  describe("hostPattern validation", () => {
    it("should reject URL with protocol", () => {
      const result = createSecretSchema.safeParse({
        ...validAnthropicInput,
        hostPattern: "https://api.anthropic.com",
      });
      expect(result.success).toBe(false);
    });

    it("should reject host with path", () => {
      const result = createSecretSchema.safeParse({
        ...validAnthropicInput,
        hostPattern: "api.anthropic.com/v1",
      });
      expect(result.success).toBe(false);
    });

    it("should reject host with spaces", () => {
      const result = createSecretSchema.safeParse({
        ...validAnthropicInput,
        hostPattern: "api .anthropic.com",
      });
      expect(result.success).toBe(false);
    });

    it("should accept wildcard host pattern", () => {
      const result = createSecretSchema.safeParse({
        ...validAnthropicInput,
        hostPattern: "*.anthropic.com",
      });
      expect(result.success).toBe(true);
    });
  });
});

describe("updateSecretSchema", () => {
  it("should accept partial update with value", () => {
    const result = updateSecretSchema.safeParse({ value: "new-value" });
    expect(result.success).toBe(true);
  });

  it("should accept partial update with hostPattern", () => {
    const result = updateSecretSchema.safeParse({
      hostPattern: "new-api.example.com",
    });
    expect(result.success).toBe(true);
  });

  it("should accept nullable pathPattern", () => {
    const result = updateSecretSchema.safeParse({ pathPattern: null });
    expect(result.success).toBe(true);
  });

  it("should reject empty object", () => {
    const result = updateSecretSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("detectAnthropicAuthMode", () => {
  it("should detect oauth for sk-ant-oat prefix", () => {
    expect(detectAnthropicAuthMode("sk-ant-oat-abc123")).toBe("oauth");
  });

  it("should detect api-key for other prefixes", () => {
    expect(detectAnthropicAuthMode("sk-ant-api03-abc123")).toBe("api-key");
  });

  it("should detect api-key for arbitrary strings", () => {
    expect(detectAnthropicAuthMode("random-string")).toBe("api-key");
  });
});

describe("parseAnthropicMetadata", () => {
  it("should parse valid metadata", () => {
    const result = parseAnthropicMetadata({ authMode: "oauth" });
    expect(result).toEqual({ authMode: "oauth" });
  });

  it("should parse api-key metadata", () => {
    const result = parseAnthropicMetadata({ authMode: "api-key" });
    expect(result).toEqual({ authMode: "api-key" });
  });

  it("should return null for invalid authMode", () => {
    const result = parseAnthropicMetadata({ authMode: "invalid" });
    expect(result).toBeNull();
  });

  it("should return null for null input", () => {
    const result = parseAnthropicMetadata(null);
    expect(result).toBeNull();
  });

  it("should return null for missing authMode", () => {
    const result = parseAnthropicMetadata({ other: "field" });
    expect(result).toBeNull();
  });

  it("should return null for non-object input", () => {
    const result = parseAnthropicMetadata("string");
    expect(result).toBeNull();
  });
});
