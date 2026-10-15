import { Injectable, Logger } from '@nestjs/common';
import { OutboxEvent, OutboxEventState, OutboxEventType } from './outbox.entity';

export interface BatchApprovalResult {
  succeeded: string[];
  failed: Array<{ id: string; reason: string }>;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private events = new Map<string, OutboxEvent>();
  private readonly maxAttempts = 10;

  /**
   * Create a new outbox event
   */
  async createEvent(eventType: OutboxEventType, payload: string): Promise<OutboxEvent> {
    const id = `obx-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();
    const event: OutboxEvent = {
      id,
      eventType,
      payload,
      state: OutboxEventState.PENDING,
      attempts: 0,
      maxAttempts: this.maxAttempts,
      createdAt: now,
      updatedAt: now,
    };
    this.events.set(id, event);
    this.logger.log(`Created outbox event ${id} of type ${eventType}`);
    return event;
  }

  /**
   * Get all events, optionally filtered by state
   */
  async getEvents(filter?: { state?: OutboxEventState }): Promise<OutboxEvent[]> {
    let all = [...this.events.values()];
    if (filter?.state) {
      all = all.filter(e => e.state === filter.state);
    }
    return all;
  }

  /**
   * Get a single event by ID
   */
  async getEvent(id: string): Promise<OutboxEvent | undefined> {
    return this.events.get(id);
  }

  /**
   * Get all dead-lettered events
   */
  getDeadLetterEvents(): OutboxEvent[] {
    return [...this.events.values()].filter(e => e.state === OutboxEventState.DEAD_LETTER);
  }

  /**
   * Process a pending event (simulated delivery)
   */
  async processEvent(id: string): Promise<{ success: boolean; error?: string }> {
    const event = this.events.get(id);
    if (!event) throw new Error(`Outbox event ${id} not found`);
    if (event.state === OutboxEventState.DEAD_LETTER) {
      throw new Error(`Event ${id} is dead-lettered and must be replayed first`);
    }
    if (event.state === OutboxEventState.DELIVERED) {
      return { success: true };
    }

    event.state = OutboxEventState.PROCESSING;
    event.attempts += 1;
    event.updatedAt = new Date();

    try {
      // Simulate delivery attempt
      await this.attemptDelivery(event);

      event.state = OutboxEventState.DELIVERED;
      event.processedAt = new Date();
      event.lastError = undefined;
      this.logger.log(`Event ${id} delivered successfully on attempt ${event.attempts}`);
      return { success: true };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      event.lastError = errMsg;
      this.logger.warn(`Event ${id} delivery failed (attempt ${event.attempts}): ${errMsg}`);

      if (event.attempts >= event.maxAttempts) {
        event.state = OutboxEventState.DEAD_LETTER;
        event.deadLetteredAt = new Date();
        this.logger.error(
          `Event ${id} exceeded max attempts (${event.maxAttempts}). Moved to dead letter queue.`,
        );
      } else {
        event.state = OutboxEventState.FAILED;
      }
      return { success: false, error: errMsg };
    }
  }

  /**
   * Replay a dead-lettered event
   */
  async replayEvent(id: string): Promise<{ success: boolean; error?: string }> {
    const event = this.events.get(id);
    if (!event) throw new Error(`Outbox event ${id} not found`);
    if (event.state !== OutboxEventState.DEAD_LETTER) {
      throw new Error(`Event ${id} is not in dead-letter state (current: ${event.state})`);
    }

    // Reset for replay
    event.state = OutboxEventState.PENDING;
    event.attempts = 0;
    event.lastError = undefined;
    event.deadLetteredAt = undefined;
    event.updatedAt = new Date();

    this.logger.log(`Replaying dead-lettered event ${id}`);
    return this.processEvent(id);
  }

  async retry(event: OutboxEvent, error: unknown, isWebhook = false): Promise<void> {
    const pendingKey = isWebhook ? WEBHOOK_PENDING_KEY : PENDING_KEY;
    const processingKey = isWebhook ? WEBHOOK_PROCESSING_KEY : PROCESSING_KEY;
    event.attempts += 1;
    event.lastError = error instanceof Error ? error.message : String(error);
    const failed =
      event.attempts >= config.OUTBOX_MAX_ATTEMPTS;
    // Use 'retrying' status to distinguish retry attempts from initial pending state
    event.status = failed ? 'failed' : 'retrying';
    if (!failed) {
      // Exponential backoff with cap at 30 seconds
      event.nextAttemptAt =
        Date.now() + Math.min(1000 * 2 ** Math.min(event.attempts - 1, 5), 30_000);
    }

    if (this.redis) {
      const transaction = this.redis
        .multi()
        .set(this.eventKey(event.id), JSON.stringify(event))
        .zrem(processingKey, event.id);
      if (!failed) transaction.zadd(pendingKey, event.nextAttemptAt, event.id);
      const results = await transaction.exec();
      this.assertTransactionOk(results);
      if (failed)
        this.logger.error(
          `Outbox event ${event.id} failed after ${event.attempts} attempts: ${event.lastError}`,
        );
      return;
    }

    this.memory.set(event.id, event);
    const processingMap = isWebhook ? this.webhookProcessing : this.processing;
    const pendingSet = isWebhook ? this.webhookPending : this.pending;
    processingMap.delete(event.id);
    if (failed) {
      this.logger.error(
        `Outbox event ${event.id} failed after ${event.attempts} attempts: ${event.lastError}`,
      );
    } else {
      pendingSet.add(event.id);
    }

    this.logger.log(
      `Replay all complete: ${result.succeeded.length} succeeded, ${result.failed.length} failed`,
    );
    return result;
  }

  /**
   * Simulate delivery attempt — can fail based on payload content for testing
   */
  private async attemptDelivery(event: OutboxEvent): Promise<void> {
    // Simulate network call
    await new Promise(r => setTimeout(r, 10));

    // Events with shouldFail flag will fail until manually resolved
    if (event.payload.includes('"shouldFail":true')) {
      throw new Error('Simulated delivery failure');
    }
  }
}
