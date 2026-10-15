import { Injectable, Inject, Optional } from '@nestjs/common';
import { SanitizedLogger } from '../common/logging/sanitized-logger';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { Redis } from 'ioredis';
import { MetricsService } from '../monitoring/metrics.service';
import { config } from '../config/env.config';

@Injectable()
export class ProviderHealthService {
  private readonly logger = new SanitizedLogger(ProviderHealthService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
  ) {}

  /**
   * Record a successful pin operation for a provider.
   * Updates health metrics: increments success count, updates last success timestamp,
   * resets failure count, and calculates new average latency.
   */
  async recordPinSuccess(providerName: string, latencyMs: number): Promise<void> {
    if (!this.redis) return;

    const key = `provider-health:${providerName}`;
    const now = new Date().toISOString();

    try {
      const results = await this.redis.multi()
        .hincrby(key, 'successCount', 1)
        .hset(key, 'lastSuccessAt', now)
        .hincrby(key, 'totalLatencyMs', latencyMs)
        .hincrby(key, 'totalRequests', 1)
        .exec();

      this.metrics?.increment('provider_health_success_total', { provider: providerName });
      this.logger.debug(`Recorded pin success for provider ${providerName}`);
    } catch (error) {
      this.logger.error(`Failed to record pin success for provider ${providerName}`, error);
    }
  }

  /**
   * Record a failed pin operation for a provider.
   * Increments failure count, updates last failure timestamp, and marks provider as degraded.
   */
  async recordPinFailure(providerName: string, latencyMs: number, error?: Error): Promise<void> {
    if (!this.redis) return;

    const key = `provider-health:${providerName}`;
    const now = new Date().toISOString();

    try {
      const results = await this.redis.multi()
        .hincrby(key, 'failureCount', 1)
        .hset(key, 'lastFailureAt', now)
        .hincrby(key, 'totalLatencyMs', latencyMs)
        .hincrby(key, 'totalRequests', 1)
        .exec();

      this.metrics?.increment('provider_health_failure_total', { provider: providerName });
      this.logger.warn(`Recorded pin failure for provider ${providerName}`);
    } catch (error) {
      this.logger.error(`Failed to record pin failure for provider ${providerName}`, error);
    }
  }

  /**
   * Get the health status for a specific provider.
   * Returns per-provider metrics including success/failure counts, latency, and overall status.
   */
  async getProviderHealth(providerName: string): Promise<{
    provider: string;
    status: 'HEALTHY' | 'DEGRADED' | 'FAILED';
    successCount: number;
    failureCount: number;
    averageLatencyMs: number;
    totalRequests: number;
    lastSuccessAt?: string;
    lastFailureAt?: string;
  }> {
    if (!this.redis) {
      return {
        provider: providerName,
        status: 'HEALTHY',
        successCount: 0,
        failureCount: 0,
        averageLatencyMs: 0,
        totalRequests: 0,
      };
    }

    try {
      const key = `provider-health:${providerName}`;
      const raw = await this.redis.hgetall(key);

      const successCount = parseInt(raw.successCount ?? '0', 10);
      const failureCount = parseInt(raw.failureCount ?? '0', 10);
      const totalLatencyMs = parseInt(raw.totalLatencyMs ?? '0', 10);
      const totalRequests = parseInt(raw.totalRequests ?? '0', 10);
      const averageLatencyMs = totalRequests > 0 ? Math.round(totalLatencyMs / totalRequests) : 0;

      // Determine overall status
      let status: 'HEALTHY' | 'DEGRADED' | 'FAILED';
      if (failureCount === 0) {
        status = 'HEALTHY';
      } else if (successCount === 0 || failureCount > successCount) {
        status = 'FAILED';
      } else {
        status = 'DEGRADED';
      }

      return {
        provider: providerName,
        status,
        successCount,
        failureCount,
        averageLatencyMs,
        totalRequests,
        lastSuccessAt: raw.lastSuccessAt,
        lastFailureAt: raw.lastFailureAt,
      };
    } catch (error) {
      this.logger.error(`Failed to get health for provider ${providerName}`, error);
      return {
        provider: providerName,
        status: 'FAILED',
        successCount: 0,
        failureCount: 0,
        averageLatencyMs: 0,
        totalRequests: 0,
      };
    }
  }

  /**
   * Get health status for all registered providers.
   */
  async getAllProviderHealth(
    providerNames: string[],
  ): Promise<Array<{
    provider: string;
    status: 'HEALTHY' | 'DEGRADED' | 'FAILED';
    successCount: number;
    failureCount: number;
    averageLatencyMs: number;
    totalRequests: number;
  }>> {
    const results = await Promise.all(
      providerNames.map((name) => this.getProviderHealth(name)),
    );
    return results;
  }

  /**
   * Reset a provider's health metrics (e.g., after manual recovery).
   */
  async resetProviderHealth(providerName: string): Promise<void> {
    if (!this.redis) return;

    try {
      await this.redis.del(`provider-health:${providerName}`);
      this.logger.log(`Reset health metrics for provider ${providerName}`);
    } catch (error) {
      this.logger.error(`Failed to reset health for provider ${providerName}`, error);
    }
  }
}