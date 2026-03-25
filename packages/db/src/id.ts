/**
 * ID generation — replaces Prisma's @default(cuid()).
 *
 * Uses cuid2 which is the successor to cuid (what Prisma uses internally).
 * Generated IDs are compatible with existing data.
 */
import { createId } from "@paralleldrive/cuid2";

export const generateId = createId;
