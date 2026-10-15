export enum RateTier {
  ANONYMOUS = 'ANONYMOUS',
  AUTHENTICATED = 'AUTHENTICATED',
  HIGH_REPUTATION = 'HIGH_REPUTATION',
}

export const RATE_LIMIT_TIERS = {
  [RateTier.ANONYMOUS]: { points: 60, duration: 60 },      // 60 req/min
  [RateTier.AUTHENTICATED]: { points: 300, duration: 60 },   // 300 req/min
  [RateTier.HIGH_REPUTATION]: { points: 1000, duration: 60 }, // 1000 req/min
} as const;

export const HIGH_REPUTATION_THRESHOLD = 100; // reputation score threshold