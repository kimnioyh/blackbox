import { Prisma } from '../generated/prisma/client.js';

/** Prisma Decimal serializes 50.00 as "50" by default; preserve API money scale. */
export function serializePolicy<T extends { maxAmount: Prisma.Decimal | null }>(policy: T) {
  return { ...policy, maxAmount: policy.maxAmount?.toFixed(2) ?? null };
}
