import { describe, it, expect } from "bun:test";
import {
  createPolicyRuleSchema,
  updatePolicyRuleSchema,
} from "@/lib/validations/policy-rule";

describe("createPolicyRuleSchema", () => {
  const validBlockInput = {
    name: "Block OpenAI",
    hostPattern: "api.openai.com",
    action: "block" as const,
    enabled: true,
  };

  const validRateLimitInput = {
    name: "Rate Limit API",
    hostPattern: "api.example.com",
    action: "rate_limit" as const,
    enabled: true,
    rateLimit: 100,
    rateLimitWindow: "minute" as const,
  };

  it("should accept valid block rule", () => {
    const result = createPolicyRuleSchema.safeParse(validBlockInput);
    expect(result.success).toBe(true);
  });

  it("should accept valid rate_limit rule", () => {
    const result = createPolicyRuleSchema.safeParse(validRateLimitInput);
    expect(result.success).toBe(true);
  });

  it("should accept rule with all optional fields", () => {
    const result = createPolicyRuleSchema.safeParse({
      ...validRateLimitInput,
      pathPattern: "/v1/*",
      method: "POST",
      agentId: "agent-123",
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty name", () => {
    const result = createPolicyRuleSchema.safeParse({
      ...validBlockInput,
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject name > 255 chars", () => {
    const result = createPolicyRuleSchema.safeParse({
      ...validBlockInput,
      name: "a".repeat(256),
    });
    expect(result.success).toBe(false);
  });

  it("should reject empty host pattern", () => {
    const result = createPolicyRuleSchema.safeParse({
      ...validBlockInput,
      hostPattern: "",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid action", () => {
    const result = createPolicyRuleSchema.safeParse({
      ...validBlockInput,
      action: "allow",
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid method", () => {
    const result = createPolicyRuleSchema.safeParse({
      ...validBlockInput,
      method: "INVALID",
    });
    expect(result.success).toBe(false);
  });

  it("should accept all valid HTTP methods", () => {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const result = createPolicyRuleSchema.safeParse({
        ...validBlockInput,
        method,
      });
      expect(result.success).toBe(true);
    }
  });

  describe("rate_limit refinement", () => {
    it("should require rateLimit when action is rate_limit", () => {
      const result = createPolicyRuleSchema.safeParse({
        ...validBlockInput,
        action: "rate_limit",
        rateLimitWindow: "minute",
      });
      expect(result.success).toBe(false);
    });

    it("should require rateLimitWindow when action is rate_limit", () => {
      const result = createPolicyRuleSchema.safeParse({
        ...validBlockInput,
        action: "rate_limit",
        rateLimit: 100,
      });
      expect(result.success).toBe(false);
    });

    it("should reject rateLimit < 1", () => {
      const result = createPolicyRuleSchema.safeParse({
        ...validRateLimitInput,
        rateLimit: 0,
      });
      expect(result.success).toBe(false);
    });

    it("should reject rateLimit > 1,000,000", () => {
      const result = createPolicyRuleSchema.safeParse({
        ...validRateLimitInput,
        rateLimit: 1_000_001,
      });
      expect(result.success).toBe(false);
    });

    it("should accept all valid rate limit windows", () => {
      for (const window of ["minute", "hour", "day"]) {
        const result = createPolicyRuleSchema.safeParse({
          ...validRateLimitInput,
          rateLimitWindow: window,
        });
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid rate limit window", () => {
      const result = createPolicyRuleSchema.safeParse({
        ...validRateLimitInput,
        rateLimitWindow: "second",
      });
      expect(result.success).toBe(false);
    });
  });
});

describe("updatePolicyRuleSchema", () => {
  it("should accept partial update with name", () => {
    const result = updatePolicyRuleSchema.safeParse({ name: "Updated" });
    expect(result.success).toBe(true);
  });

  it("should accept partial update with enabled toggle", () => {
    const result = updatePolicyRuleSchema.safeParse({ enabled: false });
    expect(result.success).toBe(true);
  });

  it("should accept nullable fields", () => {
    const result = updatePolicyRuleSchema.safeParse({
      agentId: null,
      method: null,
      rateLimit: null,
      rateLimitWindow: null,
      pathPattern: null,
    });
    expect(result.success).toBe(true);
  });

  it("should reject empty object", () => {
    const result = updatePolicyRuleSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
