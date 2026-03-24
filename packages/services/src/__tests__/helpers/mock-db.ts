import { mock } from "bun:test";

/**
 * Creates a mock Prisma db object with chainable model methods.
 * Each model (agent, secret, policyRule, user, apiKey, agentSecret, accountMember)
 * gets findMany, findFirst, findUnique, create, update, delete, deleteMany mocks.
 */
function createMockModel() {
  return {
    findMany: mock(() => Promise.resolve([])),
    findFirst: mock(() => Promise.resolve(null)),
    findUnique: mock(() => Promise.resolve(null)),
    create: mock(() => Promise.resolve({})),
    update: mock(() => Promise.resolve({})),
    delete: mock(() => Promise.resolve({})),
    deleteMany: mock(() => Promise.resolve({ count: 0 })),
    count: mock(() => Promise.resolve(0)),
  };
}

export function createMockDb() {
  return {
    agent: createMockModel(),
    secret: createMockModel(),
    policyRule: createMockModel(),
    user: createMockModel(),
    apiKey: createMockModel(),
    agentSecret: createMockModel(),
    accountMember: createMockModel(),
    $transaction: mock((args: unknown[]) => Promise.resolve(args)),
  };
}

export type MockDb = ReturnType<typeof createMockDb>;
