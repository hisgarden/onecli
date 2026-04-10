import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createMockDb, type MockDb } from "../helpers/mock-db";

let mockDb: MockDb;

mock.module("@onecli/db", () => {
  mockDb = createMockDb();
  return { db: mockDb };
});

import { getGatewayCounts } from "../../services/counts-service";

const ACCOUNT_ID = "acct_test123";

describe("counts-service", () => {
  beforeEach(() => {
    mockDb = createMockDb();
    const dbMod = require("@onecli/db");
    Object.assign(dbMod.db, mockDb);
  });

  describe("getGatewayCounts", () => {
    it("returns numeric counts for agents and secrets", async () => {
      // Order matters — service awaits agents then secrets via Promise.all,
      // and the mock returns results FIFO.
      mockDb.queueResult({ count: 3 });
      mockDb.queueResult({ count: 7 });

      const result = await getGatewayCounts(ACCOUNT_ID);

      expect(result).toEqual({ agents: 3, secrets: 7 });
    });

    it("coerces string counts (postgres bigint comes back as string) to numbers", async () => {
      // Postgres COUNT(*) returns bigint, which node-postgres serialises as
      // a string by default. The service must Number() it.
      mockDb.queueResult({ count: "12" });
      mockDb.queueResult({ count: "0" });

      const result = await getGatewayCounts(ACCOUNT_ID);

      expect(result.agents).toBe(12);
      expect(result.secrets).toBe(0);
      expect(typeof result.agents).toBe("number");
      expect(typeof result.secrets).toBe("number");
    });

    it("queries the agents and secrets tables", async () => {
      mockDb.queueResult({ count: 0 });
      mockDb.queueResult({ count: 0 });

      await getGatewayCounts(ACCOUNT_ID);

      const tables = mockDb
        .getCalls()
        .filter((c) => c.method === "selectFrom")
        .map((c) => c.table);

      expect(tables).toContain("agents");
      expect(tables).toContain("secrets");
    });

    it("propagates db errors (no silent fallback)", async () => {
      // Queue nothing — executeTakeFirstOrThrow rejects with "no result"
      try {
        await getGatewayCounts(ACCOUNT_ID);
        expect.unreachable("should have thrown");
      } catch (e) {
        expect((e as Error).message).toBe("no result");
      }
    });
  });
});
