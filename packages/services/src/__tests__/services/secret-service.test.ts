import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb, type MockDb } from "../helpers/mock-db";

let mockDb: MockDb;

mock.module("@onecli/db", () => {
  mockDb = createMockDb();
  return {
    db: mockDb,
    Prisma: {
      JsonNull: "DbNull",
      InputJsonValue: {},
    },
  };
});

// Mock crypto service
const mockEncrypt = mock((plaintext: string) =>
  Promise.resolve(`encrypted:${plaintext}`),
);

mock.module("../../crypto", () => ({
  cryptoService: {
    encrypt: mockEncrypt,
    decrypt: mock((encrypted: string) =>
      Promise.resolve(encrypted.replace("encrypted:", "")),
    ),
  },
}));

import {
  listSecrets,
  createSecret,
  deleteSecret,
  updateSecret,
} from "../../services/secret-service";
import { ServiceError } from "../../services/errors";

const ACCOUNT_ID = "acc_test123";
const SECRET_ID = "secret_test456";

describe("secret-service", () => {
  beforeEach(() => {
    mockDb = createMockDb();
    const dbMod = require("@onecli/db");
    Object.assign(dbMod.db, mockDb);
    mockEncrypt.mockClear();
  });

  describe("listSecrets", () => {
    it("should return secrets with type labels", async () => {
      mockDb.secret.findMany.mockResolvedValueOnce([
        {
          id: "1",
          name: "Anthropic Key",
          type: "anthropic",
          hostPattern: "api.anthropic.com",
          pathPattern: null,
          injectionConfig: null,
          createdAt: new Date(),
        },
        {
          id: "2",
          name: "Custom API",
          type: "generic",
          hostPattern: "api.example.com",
          pathPattern: "/v1/*",
          injectionConfig: { headerName: "x-api-key" },
          createdAt: new Date(),
        },
      ]);

      const result = await listSecrets(ACCOUNT_ID);
      expect(result).toHaveLength(2);
      expect(result[0]!.typeLabel).toBe("Anthropic API Key");
      expect(result[1]!.typeLabel).toBe("Generic Secret");
    });

    it("should return raw type if no label mapping", async () => {
      mockDb.secret.findMany.mockResolvedValueOnce([
        {
          id: "1",
          name: "Unknown",
          type: "custom_type",
          hostPattern: "example.com",
          pathPattern: null,
          injectionConfig: null,
          createdAt: new Date(),
        },
      ]);

      const result = await listSecrets(ACCOUNT_ID);
      expect(result[0]!.typeLabel).toBe("custom_type");
    });
  });

  describe("createSecret", () => {
    it("should reject empty name", async () => {
      try {
        await createSecret(ACCOUNT_ID, {
          name: "   ",
          type: "anthropic",
          value: "sk-ant-key123",
          hostPattern: "api.anthropic.com",
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
      }
    });

    it("should reject empty value", async () => {
      try {
        await createSecret(ACCOUNT_ID, {
          name: "My Key",
          type: "anthropic",
          value: "   ",
          hostPattern: "api.anthropic.com",
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
      }
    });

    it("should reject empty host pattern", async () => {
      try {
        await createSecret(ACCOUNT_ID, {
          name: "My Key",
          type: "anthropic",
          value: "sk-ant-key123",
          hostPattern: "   ",
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
      }
    });

    it("should require headerName for generic secrets", async () => {
      try {
        await createSecret(ACCOUNT_ID, {
          name: "My Key",
          type: "generic",
          value: "my-secret-value",
          hostPattern: "api.example.com",
          injectionConfig: null,
        });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
        expect((e as ServiceError).message).toContain("Header name");
      }
    });

    it("should create anthropic secret with metadata", async () => {
      mockDb.secret.create.mockResolvedValueOnce({
        id: "new-secret",
        name: "Anthropic Key",
        type: "anthropic",
        hostPattern: "api.anthropic.com",
        pathPattern: null,
        createdAt: new Date(),
      });

      const result = await createSecret(ACCOUNT_ID, {
        name: "Anthropic Key",
        type: "anthropic",
        value: "sk-ant-api03-mysecret",
        hostPattern: "api.anthropic.com",
      });

      expect(result.id).toBe("new-secret");
      expect(result.preview).toBe(
        "sk-a\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022cret",
      );
      expect(mockEncrypt).toHaveBeenCalledWith("sk-ant-api03-mysecret");
    });

    it("should detect oauth auth mode for sk-ant-oat prefix", async () => {
      mockDb.secret.create.mockResolvedValueOnce({
        id: "new-secret",
        name: "OAuth Key",
        type: "anthropic",
        hostPattern: "api.anthropic.com",
        pathPattern: null,
        createdAt: new Date(),
      });

      await createSecret(ACCOUNT_ID, {
        name: "OAuth Key",
        type: "anthropic",
        value: "sk-ant-oat-mysecret",
        hostPattern: "api.anthropic.com",
      });

      // Verify the metadata was set (check the create call args)
      const createCall = mockDb.secret.create.mock.calls[0]![0] as {
        data: { metadata: { authMode: string } };
      };
      expect(createCall.data.metadata.authMode).toBe("oauth");
    });

    it("should create generic secret with injection config", async () => {
      mockDb.secret.create.mockResolvedValueOnce({
        id: "new-secret",
        name: "Custom API",
        type: "generic",
        hostPattern: "api.example.com",
        pathPattern: "/v1/*",
        createdAt: new Date(),
      });

      await createSecret(ACCOUNT_ID, {
        name: "Custom API",
        type: "generic",
        value: "my-api-key",
        hostPattern: "api.example.com",
        pathPattern: "/v1/*",
        injectionConfig: {
          headerName: "x-api-key",
          valueFormat: "Bearer {value}",
        },
      });

      const createCall = mockDb.secret.create.mock.calls[0]![0] as {
        data: { injectionConfig: { headerName: string; valueFormat: string } };
      };
      expect(createCall.data.injectionConfig.headerName).toBe("x-api-key");
      expect(createCall.data.injectionConfig.valueFormat).toBe(
        "Bearer {value}",
      );
    });
  });

  describe("deleteSecret", () => {
    it("should throw NOT_FOUND for missing secret", async () => {
      mockDb.secret.findFirst.mockResolvedValueOnce(null);

      try {
        await deleteSecret(ACCOUNT_ID, SECRET_ID);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should delete existing secret", async () => {
      mockDb.secret.findFirst.mockResolvedValueOnce({ id: SECRET_ID });

      await deleteSecret(ACCOUNT_ID, SECRET_ID);
      expect(mockDb.secret.delete).toHaveBeenCalled();
    });
  });

  describe("updateSecret", () => {
    it("should throw NOT_FOUND for missing secret", async () => {
      mockDb.secret.findFirst.mockResolvedValueOnce(null);

      try {
        await updateSecret(ACCOUNT_ID, SECRET_ID, { value: "new-value" });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("NOT_FOUND");
      }
    });

    it("should reject empty value", async () => {
      mockDb.secret.findFirst.mockResolvedValueOnce({
        id: SECRET_ID,
        type: "anthropic",
      });

      try {
        await updateSecret(ACCOUNT_ID, SECRET_ID, { value: "   " });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
      }
    });

    it("should reject empty host pattern", async () => {
      mockDb.secret.findFirst.mockResolvedValueOnce({
        id: SECRET_ID,
        type: "generic",
      });

      try {
        await updateSecret(ACCOUNT_ID, SECRET_ID, { hostPattern: "   " });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
      }
    });

    it("should throw BAD_REQUEST if no fields to update", async () => {
      mockDb.secret.findFirst.mockResolvedValueOnce({
        id: SECRET_ID,
        type: "generic",
      });

      try {
        await updateSecret(ACCOUNT_ID, SECRET_ID, {});
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as ServiceError).code).toBe("BAD_REQUEST");
        expect((e as ServiceError).message).toContain("No fields");
      }
    });

    it("should re-encrypt and re-detect auth mode when value changes for anthropic", async () => {
      mockDb.secret.findFirst.mockResolvedValueOnce({
        id: SECRET_ID,
        type: "anthropic",
      });

      await updateSecret(ACCOUNT_ID, SECRET_ID, { value: "sk-ant-oat-newkey" });

      expect(mockEncrypt).toHaveBeenCalledWith("sk-ant-oat-newkey");
      expect(mockDb.secret.update).toHaveBeenCalled();
    });

    it("should update host pattern", async () => {
      mockDb.secret.findFirst.mockResolvedValueOnce({
        id: SECRET_ID,
        type: "generic",
      });

      await updateSecret(ACCOUNT_ID, SECRET_ID, {
        hostPattern: "new-api.example.com",
      });

      expect(mockDb.secret.update).toHaveBeenCalled();
    });
  });
});
