import { describe, it, expect } from "bun:test";
import { ServiceError, type ServiceErrorCode } from "../../services/errors";

describe("ServiceError", () => {
  it("extends the built-in Error", () => {
    const err = new ServiceError("NOT_FOUND", "missing");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ServiceError);
  });

  it("preserves the message", () => {
    const err = new ServiceError("BAD_REQUEST", "field x is invalid");
    expect(err.message).toBe("field x is invalid");
  });

  it("exposes the code as a readonly field", () => {
    const err = new ServiceError("CONFLICT", "duplicate");
    expect(err.code).toBe("CONFLICT");
  });

  it("sets name to 'ServiceError' for log/serialization clarity", () => {
    const err = new ServiceError("FORBIDDEN", "nope");
    expect(err.name).toBe("ServiceError");
  });

  it("is throwable and catchable as a normal Error", () => {
    try {
      throw new ServiceError("NOT_FOUND", "missing");
    } catch (e) {
      expect(e).toBeInstanceOf(ServiceError);
      expect((e as ServiceError).code).toBe("NOT_FOUND");
      expect((e as Error).message).toBe("missing");
    }
  });

  it("supports every documented ServiceErrorCode", () => {
    const codes: ServiceErrorCode[] = [
      "NOT_FOUND",
      "BAD_REQUEST",
      "CONFLICT",
      "FORBIDDEN",
    ];
    for (const code of codes) {
      const err = new ServiceError(code, `code-${code}`);
      expect(err.code).toBe(code);
    }
  });

  it("captures a stack trace", () => {
    const err = new ServiceError("BAD_REQUEST", "boom");
    expect(typeof err.stack).toBe("string");
    expect(err.stack).toContain("ServiceError");
  });
});
