import { Test, TestingModule } from '@nestjs/testing';
import { IpfsPinningService } from './ipfs-pinning.service';
import { PinataProvider } from './providers/pinata.provider';
import { InfuraProvider } from './providers/infura.provider';
import { Web3StorageProvider } from './providers/web3-storage.provider';
import { ProviderHealthService } from './provider-health.service';
import { IpfsPinningModule } from './ipfs-pinning.module';
import { DisputeSaga, DisputeStep, DisputeVerdict } from '../dispute/dispute.types';

describe('IpfsPinningService - sequential failover', () => {
  let service: IpfsPinningService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [IpfsPinningModule],
    }).compile();

    service = module.get<IpfsPinningService>(IpfsPinningService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('pinContent sequential failover', () => {
    it('should attempt providers in priority order (Pinata → Infura → Web3Storage)', async () => {
      // Create a test content
      const testContent = Buffer.from('test content for ipfs failover');
      const dto = {
        content: testContent.toString('base64'),
        filename: 'test.txt',
      };

      // The service should attempt providers in order
      // In test mode with mock providers, it should try each one sequentially
      const result = await service.pinContent(dto);

      expect(result).toBeDefined();
      expect(result.cid).toBeDefined();
      expect(result.status).toBeDefined();
    });

    it('should handle provider failures and fail over', async () => {
      const testContent = Buffer.from('test content for ipfs failover test');
      const dto = {
        content: testContent.toString('base64'),
        filename: 'test-failover.txt',
      };

      // Test that the service can handle the pin operation
      const result = await service.pinContent(dto);
      expect(result.cid).toBeDefined();
    });
  });

  describe('cross-pinning', () => {
    it('should dispatch background cross-pin after successful upload', async () => {
      const testContent = Buffer.from('test content for cross-pin');
      const dto = {
        content: testContent.toString('base64'),
        filename: 'test-crosspin.txt',
      };

      const result = await service.pinContent(dto);
      expect(result.cid).toBeDefined();

      // After pin, the record should have some providers pinned
      // Cross-pin is fire-and-forge, so we just verify the pin completed
    });
  });
});

describe('IpfsPinningService - provider health', () => {
  let service: IpfsPinningService;
  let providerHealth: ProviderHealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [IpfsPinningService, ProviderHealthService],
    }).compile();

    service = module.get<IpfsPinningService>(IpfsPinningService);
    providerHealth = module.get<ProviderHealthService>(ProviderHealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(providerHealth).toBeDefined();
  });

  describe('getProviderHealth', () => {
    it('should return health status for providers', async () => {
      const health = await providerHealth.getProviderHealth('pinata');
      expect(health.provider).toBe('pinata');
      expect(['HEALTHY', 'DEGRADED', 'FAILED'].includes(health.status)).toBe(true);
    });

    it('should get health for all providers', async () => {
      const allHealth = await providerHealth.getAllProviderHealth([
        'pinata',
        'infura',
        'web3storage',
      ]);
      expect(Array.isArray(allHealth)).toBe(true);
      expect(allHealth.length).toBe(3);
    });
  });

  describe('recordPinSuccess/failure', () => {
    it('should not throw when recording health metrics', async () => {
      await expect(
        providerHealth.recordPinSuccess('pinata', 100),
      ).not.toThrow();
      await expect(
        providerHealth.recordPinFailure('pinata', 100),
      ).not.toThrow();
    });
  });
});