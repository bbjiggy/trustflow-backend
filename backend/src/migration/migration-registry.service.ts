import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { SchemaMigration } from './migration.types';

export const MIGRATION_DEFINITIONS = 'MIGRATION_DEFINITIONS';

export interface MigrationDefinitionSummary {
  name: string;
  targetTable: string;
  description: string;
}

@Injectable()
export class MigrationRegistryService {
  private readonly byName: Map<string, SchemaMigration> = new Map();

  constructor(@Inject(MIGRATION_DEFINITIONS) definitions: SchemaMigration[]) {
    for (const definition of definitions) {
      if (this.byName.has(definition.name)) {
        throw new Error(`Duplicate migration name registered: ${definition.name}`);
      }
      this.byName.set(definition.name, definition);
    }
  }

  get(name: string): SchemaMigration {
    const definition = this.byName.get(name);
    if (!definition) throw new NotFoundException(`Migration "${name}" is not registered`);
    return definition;
  }

  list(): MigrationDefinitionSummary[] {
    return [...this.byName.values()].map(m => ({
      name: m.name,
      targetTable: m.targetTable,
      description: m.description,
    }));
  }
}
