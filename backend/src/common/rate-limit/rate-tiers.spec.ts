import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitGuard } from './rate-limit.guard';
import { RateTier, RATE_LIMIT_TIERS, HIGH_REPUTATION_THRESHOLD } from './rate-tiers';

describe('rate-tiers', () => {
  describe('RateTier enum', () => {
    it('should have three tiers', () => {
      expect(RateTier.ANONYMOUS).toBeDefined();
      expect(RateTier.AUTHENTICATED).toBeDefined();
      expect(RateTier.HIGH_REPUTATION).toBeDefined();
    });

    it('tier constants have correct point values', () => {
      expect(RATE_LIMIT_TIERS[RateTier.ANONYMOUS].points).toBe(60);
      expect(RATE_LIMIT_TIERS[RateTier.AUTHENTICATED].points).toBe(300);
      expect(RATE_LIMIT_TIERS[RateTier.HIGH_REPUTATION].points).toBe(1000);
    });

    it('tier constants have correct duration', () => {
      expect(RATE_LIMIT_TIERS[RateTier.ANONYMOUS].duration).toBe(60);
      expect(RATE_LIMIT_TIERS[RateTier.AUTHENTICATED].duration).toBe(60);
      expect(RATE_LIMIT_TIERS[RateTier.HIGH_REPUTATION].duration).toBe(60);
    });
  });

  describe('HIGH_REPUTATION_THRESHOLD', () => {
    it('should be a positive number', () => {
      expect(HIGH_REPUTATION_THRESHOLD).toBeGreaterThan(0);
    });
  });
});

describe('RateLimitGuard with dynamic tiers', () => {
  let guard: RateLimitGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RateLimitGuard],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('determineTier', () => {
    it('should return ANONYMOUS for unauthenticated requests', () => {
      const request: any = {
        ip: '127.0.0.1',
        method: 'GET',
        url: '/api/test',
        route: { path: '/api/test' },
        headers: {},
        connection: { remoteAddress: '127.0.0.1' },
        user: undefined,
      };

      const tier = guard['determineTier'](request);
      expect(tier).toBe(RateTier.ANONYMOUS);
    });

    it('should return AUTHENTICATED for authenticated user with low reputation', () => {
      const request: any = {
        ip: '127.0.0.1',
        method: 'GET',
        url: '/api/test',
        route: { path: '/api/test' },
        headers: {},
        connection: { remoteAddress: '127.0.0.1' },
        user: { address: 'WALLET_ADDRESS_LOW_REP' },
      };

      const tier = guard['determineTier'](request);
      expect(tier).toBe(RateTier.AUTHENTICATED);
    });

    it('should return HIGH_REPUTATION for authenticated user with high reputation', () => {
      const request: any = {
        ip: '127.0.0.1',
        method: 'GET',
        url: '/api/test',
        route: { path: '/api/test' },
        headers: {},
        connection: { remoteAddress: '127.0.0.1' },
        user: { address: 'WALLET_ADDRESS_HIGH_REP' },
      };

      const tier = guard['determineTier'](request);
      expect(tier).toBe(RateTier.HIGH_REPUTATION);
    });
  });

  describe('setRateLimitHeaders', () => {
    it('should set RateLimit-* headers on response', () => {
      const mockResponse = {
        setHeader: jest.fn(),
      };

      const decisions: Array<[number, number]> = [[1, 0]];

      guard['setRateLimitHeaders'](mockResponse, RateTier.AUTHENTICATED, decisions);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '300');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '299');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('RateLimit-Reset', '0');
    });

    it('should handle rate limit exceeded case', () => {
      const mockResponse = {
        setHeader: jest.fn(),
      };

      const decisions: Array<[number, number]> = [[0, 30]]; // denied, retry after 30s

      guard['setRateLimitHeaders'](mockResponse, RateTier.ANONYMOUS, decisions);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('RateLimit-Limit', '60');
      // When denied, remaining should be 0
      const remainingCall = mockResponse.setHeader.mock.calls.find(
        ([key]) => key === 'RateLimit-Remaining'
      );
      if (remainingCall) {
        expect(remainingCall[1]).toBe('0');
      }
    });
  });
});