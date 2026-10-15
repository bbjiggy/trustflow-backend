import { Test, TestingModule } from '@nestjs/testing';
import { ProviderHealthService } from './provider-health.service';
import { Redis } from 'ioredis';

describe('ProviderHealthService', () => {
  let service: ProviderHealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProviderHealthService],
    }).compile();

    service = module.get<ProviderHealthService>(ProviderHealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProviderHealth', () => {
    it('should return default health when Redis is unavailable', async () => {
      // ProviderHealthService handles the case when redis is null
      const result = await service.getProviderHealth('pinata');
      expect(result.provider).toBe('pinata');
      expect(result.status).toBeDefined();
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
    });
  });

  describe('recordPinSuccess and recordPinFailure', () => {
    it('should not throw when Redis is unavailable', async () => {
      // These methods should gracefully handle null Redis
      await expect(
        service.recordPinSuccess('pinata', 100),
      ).not.toThrow();
      await expect(
        service.recordPinFailure('pinata', 100),
      ).not.toThrow();
    });
  });

  describe('getAllProviderHealth', () => {
    it('should return health for all providers', async () => {
      const result = await service.getAllProviderHealth(['pinata', 'infura', 'web3storage']);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});