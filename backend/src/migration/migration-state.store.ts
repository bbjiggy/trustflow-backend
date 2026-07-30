import { Injectable } from '@nestjs/common';
import { MigrationRun } from './migration.types';

@Injectable()
export class MigrationStateStore {
  private readonly runs: Map<string, MigrationRun> = new Map();
  /** migrationName -> runId of the run currently in progress, if any. */
  private readonly activeRunByName: Map<string, string> = new Map();

  create(run: MigrationRun): void {
    this.runs.set(run.runId, run);
  }

  save(run: MigrationRun): void {
    run.updatedAt = new Date().toISOString();
    this.runs.set(run.runId, run);
  }

  findById(runId: string): MigrationRun | undefined {
    return this.runs.get(runId);
  }

  findAll(): MigrationRun[] {
    return [...this.runs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findActiveByName(migrationName: string): MigrationRun | undefined {
    const runId = this.activeRunByName.get(migrationName);
    return runId ? this.runs.get(runId) : undefined;
  }

  markActive(migrationName: string, runId: string): void {
    this.activeRunByName.set(migrationName, runId);
  }

  clearActive(migrationName: string): void {
    this.activeRunByName.delete(migrationName);
  }
}
