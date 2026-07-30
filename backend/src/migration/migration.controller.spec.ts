import { Test, TestingModule } from '@nestjs/testing';
import { MigrationController } from './migration.controller';
import { MigrationRunnerService } from './migration-runner.service';
import { MigrationRegistryService } from './migration-registry.service';

describe('MigrationController', () => {
  let controller: MigrationController;

  const mockRunner = {
    findAll: jest.fn(),
    findById: jest.fn(),
    run: jest.fn(),
    rollback: jest.fn(),
  };

  const mockRegistry = {
    list: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MigrationController],
      providers: [
        { provide: MigrationRunnerService, useValue: mockRunner },
        { provide: MigrationRegistryService, useValue: mockRegistry },
      ],
    }).compile();

    controller = module.get<MigrationController>(MigrationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('listDefinitions delegates to the registry', () => {
    mockRegistry.list.mockReturnValue([{ name: 'gigs-add-priority-column' }]);
    expect(controller.listDefinitions()).toEqual([{ name: 'gigs-add-priority-column' }]);
    expect(mockRegistry.list).toHaveBeenCalled();
  });

  it('listRuns delegates to the runner', () => {
    mockRunner.findAll.mockReturnValue([{ runId: 'mig-1' }]);
    expect(controller.listRuns()).toEqual([{ runId: 'mig-1' }]);
  });

  it('getRun delegates to the runner with the run id', () => {
    mockRunner.findById.mockReturnValue({ runId: 'mig-1' });
    expect(controller.getRun('mig-1')).toEqual({ runId: 'mig-1' });
    expect(mockRunner.findById).toHaveBeenCalledWith('mig-1');
  });

  it('run delegates to the runner with the migration name and options', async () => {
    const dto = { batchSize: 250 };
    mockRunner.run.mockResolvedValue({ runId: 'mig-1' });

    await controller.run('gigs-add-priority-column', dto);

    expect(mockRunner.run).toHaveBeenCalledWith('gigs-add-priority-column', dto);
  });

  it('rollback delegates to the runner with the run id', async () => {
    mockRunner.rollback.mockResolvedValue({ runId: 'mig-1', status: 'ROLLED_BACK' });

    const result = await controller.rollback('mig-1');

    expect(mockRunner.rollback).toHaveBeenCalledWith('mig-1');
    expect(result).toEqual({ runId: 'mig-1', status: 'ROLLED_BACK' });
  });
});
