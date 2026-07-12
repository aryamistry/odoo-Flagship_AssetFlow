import { describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const url = process.env.TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;
integration("PostgreSQL integrity baseline", () => {
  const db = url ? new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) }) : null;
  it("installs the allocation and booking race protections", async () => {
    const indexes = await db!.$queryRaw<Array<{ indexname: string }>>`SELECT indexname FROM pg_indexes WHERE indexname = 'one_active_allocation_per_asset'`;
    const constraints = await db!.$queryRaw<Array<{ conname: string }>>`SELECT conname FROM pg_constraint WHERE conname = 'booking_no_overlap'`;
    expect(indexes).toHaveLength(1); expect(constraints).toHaveLength(1);
  });
});

