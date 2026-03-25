import { mock } from "bun:test";

/**
 * Creates a mock Kysely db object with chainable builder methods.
 *
 * Usage:
 *   mockDb.queueResult({ id: "1", name: "Test" }); // for executeTakeFirst
 *   mockDb.queueResult([{ id: "1" }, { id: "2" }]); // for execute
 *   mockDb.queueResult(undefined); // for executeTakeFirst returning nothing
 *
 * Results are consumed FIFO — queue them in the order your service calls the DB.
 */
export function createMockDb() {
  const results: unknown[] = [];
  const calls: { method: string; table?: string }[] = [];

  function queueResult(value: unknown) {
    results.push(value);
  }

  function createBuilder(method: string, table?: string): any {
    calls.push({ method, table });

    const chain: Record<string, any> = {};
    const chainMethods = [
      "select",
      "where",
      "whereRef",
      "orderBy",
      "limit",
      "values",
      "set",
      "returning",
      "innerJoin",
      "onConflict",
      "as",
      "column",
      "doUpdateSet",
    ];

    for (const m of chainMethods) {
      chain[m] = (..._args: unknown[]) => chain;
    }

    // Subquery builder for select((eb) => ...)
    chain.select = (...args: unknown[]) => {
      if (typeof args[0] === "function") {
        // Expression builder callback — call it with a fake eb and return chain
        try {
          args[0]({
            selectFrom: () => chain,
            fn: { countAll: () => ({ as: () => "count" }) },
            lit: () => ({ as: () => "one" }),
            exists: () => chain,
          });
        } catch {
          // ignore errors in mock eb callbacks
        }
      }
      return chain;
    };

    // where can take a callback too (for EXISTS subqueries)
    const originalWhere = chain.where;
    chain.where = (...args: unknown[]) => {
      if (typeof args[0] === "function") {
        try {
          args[0]({
            exists: () => chain,
            selectFrom: () => chain,
          });
        } catch {
          // ignore
        }
        return chain;
      }
      return chain;
    };

    chain.execute = mock(() => {
      const val = results.shift();
      return Promise.resolve(val ?? []);
    });

    chain.executeTakeFirst = mock(() => {
      const val = results.shift();
      return Promise.resolve(val === undefined ? undefined : val);
    });

    chain.executeTakeFirstOrThrow = mock(() => {
      const val = results.shift();
      if (val === undefined || val === null) {
        return Promise.reject(new Error("no result"));
      }
      return Promise.resolve(val);
    });

    return chain;
  }

  const mockTrx = {
    insertInto: (_table: string) => createBuilder("insertInto", _table),
    deleteFrom: (_table: string) => createBuilder("deleteFrom", _table),
    updateTable: (_table: string) => createBuilder("updateTable", _table),
    selectFrom: (_table: string) => createBuilder("selectFrom", _table),
  };

  const db = {
    selectFrom: (table: string) => createBuilder("selectFrom", table),
    insertInto: (table: string) => createBuilder("insertInto", table),
    updateTable: (table: string) => createBuilder("updateTable", table),
    deleteFrom: (table: string) => createBuilder("deleteFrom", table),
    transaction: () => ({
      execute: mock((fn: (trx: typeof mockTrx) => Promise<void>) =>
        fn(mockTrx),
      ),
    }),
    // Test helpers
    queueResult,
    getCalls: () => calls,
    resetCalls: () => {
      calls.length = 0;
    },
  };

  return db;
}

export type MockDb = ReturnType<typeof createMockDb>;
