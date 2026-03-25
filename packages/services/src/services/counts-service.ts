import { db } from "@onecli/db";

export const getGatewayCounts = async (accountId: string) => {
  const [agentResult, secretResult] = await Promise.all([
    db
      .selectFrom("agents")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("accountId", "=", accountId)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("secrets")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("accountId", "=", accountId)
      .executeTakeFirstOrThrow(),
  ]);

  return {
    agents: Number(agentResult.count),
    secrets: Number(secretResult.count),
  };
};
