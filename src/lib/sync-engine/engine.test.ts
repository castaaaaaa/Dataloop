/**
 * Sync Engine Unit Tests
 * Verifies Acceptance Criteria 5, 6, 7 (conflict rules, loop prevention, idempotency, transforms)
 */

import { describe, it, expect } from 'vitest';
import { executeSyncRun, transformRecordValues } from './engine';
import { computeStableHash } from './hasher';
import { applyTransformation } from './transformer';
import { evaluateFilterGroup } from './filter';
import { sanitizeForCsvExport } from '../connectors/csv';
import { SyncConfig, FieldMapping, RecordLink, UniversalRecord, PlanLimits } from './types';

const defaultPlanLimits: PlanLimits = {
  maxRecords: 1000,
  maxActiveSyncs: 10,
  minIntervalMinutes: 5,
  premiumConnectors: true,
  teamSeats: 5,
  logRetentionDays: 30,
  realtime: true
};

const baseConfig: SyncConfig = {
  id: 'test_sync_01',
  workspaceId: 'ws_test',
  name: 'Test Two-Way Sync',
  endpointAId: 'ep_a',
  endpointBId: 'ep_b',
  direction: 'two_way',
  conflictRule: 'manual',
  triggerMode: 'manual',
  intervalMinutes: 15,
  deleteBehavior: 'ignore',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z'
};

const mappings: FieldMapping[] = [
  {
    id: 'm1',
    sourceFieldKey: 'email',
    destinationFieldKey: 'email_address',
    isKey: true,
    required: true
  },
  {
    id: 'm2',
    sourceFieldKey: 'name',
    destinationFieldKey: 'full_name',
    isKey: false,
    required: true
  },
  {
    id: 'm3',
    sourceFieldKey: 'status',
    destinationFieldKey: 'stage',
    isKey: false,
    required: false
  }
];

describe('Sync Engine - Conflict Rules (Acceptance Criterion 5)', () => {
  const srcRecord: UniversalRecord = {
    externalId: 'src_1',
    values: { email: 'test@example.com', name: 'Alice from A', status: 'Active' },
    updatedAt: '2026-10-24T10:00:00Z',
    hash: 'hash_a_new'
  };

  const destRecord: UniversalRecord = {
    externalId: 'dst_1',
    values: { email_address: 'test@example.com', full_name: 'Alice from B', stage: 'Pending' },
    updatedAt: '2026-10-24T11:00:00Z', // newer
    hash: 'hash_b_new'
  };

  const existingLink: RecordLink = {
    id: 'link_1',
    syncConfigId: baseConfig.id,
    aExternalId: 'src_1',
    bExternalId: 'dst_1',
    lastSyncedHashA: 'hash_a_old', // both changed since last sync
    lastSyncedHashB: 'hash_b_old',
    lastSyncedAt: '2026-10-20T00:00:00Z'
  };

  it('Manual Conflict Rule creates a conflict item in review queue', () => {
    const result = executeSyncRun({
      config: { ...baseConfig, conflictRule: 'manual' },
      mappings,
      recordLinks: [existingLink],
      sourceRecords: [srcRecord],
      destinationRecords: [destRecord],
      planLimits: defaultPlanLimits,
      currentLinkedRecordsCount: 1,
      runId: 'run_test_conflict_manual'
    });

    expect(result.newConflicts.length).toBe(1);
    expect(result.run.conflicts).toBe(1);
    // Should NOT write to either side in manual review mode
    expect(result.writesA.length).toBe(0);
    expect(result.writesB.length).toBe(0);
  });

  it('Source-Wins Conflict Rule overwrites destination with source values', () => {
    const result = executeSyncRun({
      config: { ...baseConfig, conflictRule: 'source_wins' },
      mappings,
      recordLinks: [existingLink],
      sourceRecords: [srcRecord],
      destinationRecords: [destRecord],
      planLimits: defaultPlanLimits,
      currentLinkedRecordsCount: 1,
      runId: 'run_test_conflict_source_wins'
    });

    expect(result.writesB.length).toBe(1);
    expect(result.writesB[0].record.values.full_name).toBe('Alice from A');
  });

  it('Destination-Wins Conflict Rule overwrites source with destination values', () => {
    const result = executeSyncRun({
      config: { ...baseConfig, conflictRule: 'destination_wins' },
      mappings,
      recordLinks: [existingLink],
      sourceRecords: [srcRecord],
      destinationRecords: [destRecord],
      planLimits: defaultPlanLimits,
      currentLinkedRecordsCount: 1,
      runId: 'run_test_conflict_dest_wins'
    });

    expect(result.writesA.length).toBe(1);
    expect(result.writesA[0].record.values.name).toBe('Alice from B');
  });

  it('Newest-Wins Conflict Rule honors the most recently updated side', () => {
    const result = executeSyncRun({
      config: { ...baseConfig, conflictRule: 'newest_wins' },
      mappings,
      recordLinks: [existingLink],
      sourceRecords: [srcRecord], // 10:00:00Z
      destinationRecords: [destRecord], // 11:00:00Z (newer)
      planLimits: defaultPlanLimits,
      currentLinkedRecordsCount: 1,
      runId: 'run_test_conflict_newest_wins'
    });

    // Destination is newer, so it should write to A
    expect(result.writesA.length).toBe(1);
    expect(result.writesA[0].record.values.name).toBe('Alice from B');
  });
});

describe('Sync Engine - Loop Prevention (Acceptance Criterion 6)', () => {
  it('Produces zero writes on stabilized two-way sync', () => {
    const valuesA = { email: 'steady@work.io', name: 'Steady State', status: 'Active' };
    const valuesB = { email_address: 'steady@work.io', full_name: 'Steady State', stage: 'Active' };

    const hashA = computeStableHash(valuesA);
    const hashB = computeStableHash(valuesB);

    const stabilizedLink: RecordLink = {
      id: 'link_stabilized',
      syncConfigId: baseConfig.id,
      aExternalId: 'src_steady',
      bExternalId: 'dst_steady',
      lastSyncedHashA: hashA,
      lastSyncedHashB: hashB,
      lastSyncedAt: '2026-10-24T12:00:00Z'
    };

    const recordA: UniversalRecord = {
      externalId: 'src_steady',
      values: valuesA,
      updatedAt: '2026-10-24T12:00:00Z',
      hash: hashA
    };

    const recordB: UniversalRecord = {
      externalId: 'dst_steady',
      values: valuesB,
      updatedAt: '2026-10-24T12:00:00Z',
      hash: hashB
    };

    const result = executeSyncRun({
      config: baseConfig,
      mappings,
      recordLinks: [stabilizedLink],
      sourceRecords: [recordA],
      destinationRecords: [recordB],
      planLimits: defaultPlanLimits,
      currentLinkedRecordsCount: 1,
      runId: 'run_test_loop_prevention'
    });

    // Both sides unchanged -> zero writes, zero conflicts, skipped count = 1
    expect(result.writesA.length).toBe(0);
    expect(result.writesB.length).toBe(0);
    expect(result.run.skipped).toBe(1);
  });
});

describe('Sync Engine - Idempotency (Acceptance Criterion 7)', () => {
  it('Generates deterministic idempotency keys and prevents double writes on retry', () => {
    const newRecord: UniversalRecord = {
      externalId: 'src_new_99',
      values: { email: 'idempotent@test.com', name: 'Fresh Lead', status: 'New' },
      hash: ''
    };

    // First execution
    const run1 = executeSyncRun({
      config: baseConfig,
      mappings,
      recordLinks: [],
      sourceRecords: [newRecord],
      destinationRecords: [],
      planLimits: defaultPlanLimits,
      currentLinkedRecordsCount: 0,
      runId: 'run_batch_001'
    });

    expect(run1.writesB.length).toBe(1);
    const generatedKey = run1.writesB[0].idempotencyKey;
    expect(generatedKey).toContain('run_batch_001');
    expect(generatedKey).toContain('create_b');

    // Simulated subsequent execution with updated record links
    const run2 = executeSyncRun({
      config: baseConfig,
      mappings,
      recordLinks: run1.updatedRecordLinks,
      sourceRecords: [newRecord],
      destinationRecords: [
        {
          externalId: run1.writesB[0].record.externalId,
          values: run1.writesB[0].record.values,
          hash: computeStableHash(run1.writesB[0].record.values)
        }
      ],
      planLimits: defaultPlanLimits,
      currentLinkedRecordsCount: 1,
      runId: 'run_batch_002'
    });

    // Zero writes on retry
    expect(run2.writesB.length).toBe(0);
    expect(run2.run.created).toBe(0);
  });
});

describe('Matching logic: running the same input twice produces zero writes the second time (Stage 2 Requirement 7)', () => {
  const oneWayConfig: SyncConfig = {
    id: 'sync_csv_to_sheets',
    workspaceId: 'ws_prod',
    name: 'CSV to Google Sheets One-Way Sync',
    endpointAId: 'ep_csv',
    endpointBId: 'ep_sheets',
    direction: 'a_to_b',
    conflictRule: 'source_wins',
    triggerMode: 'manual',
    intervalMinutes: 15,
    deleteBehavior: 'ignore',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z'
  };

  const syncMappings: FieldMapping[] = [
    {
      id: 'm_email',
      sourceFieldKey: 'email',
      destinationFieldKey: 'email_address',
      isKey: true,
      required: true
    },
    {
      id: 'm_name',
      sourceFieldKey: 'name',
      destinationFieldKey: 'full_name',
      isKey: false,
      required: true
    },
    {
      id: 'm_role',
      sourceFieldKey: 'role',
      destinationFieldKey: 'job_title',
      isKey: false,
      required: false
    }
  ];

  const sourceDataset: UniversalRecord[] = [
    {
      externalId: 'row-1',
      values: { email: 'alice@acme.com', name: 'Alice Smith', role: 'Engineer' },
      hash: computeStableHash({ email_address: 'alice@acme.com', full_name: 'Alice Smith', job_title: 'Engineer' }),
      updatedAt: '2026-10-25T10:00:00Z'
    },
    {
      externalId: 'row-2',
      values: { email: 'bob@acme.com', name: 'Bob Jones', role: 'Designer' },
      hash: computeStableHash({ email_address: 'bob@acme.com', full_name: 'Bob Jones', job_title: 'Designer' }),
      updatedAt: '2026-10-25T10:00:00Z'
    },
    {
      externalId: 'row-3',
      values: { email: 'carol@acme.com', name: 'Carol Danvers', role: 'Product Manager' },
      hash: computeStableHash({ email_address: 'carol@acme.com', full_name: 'Carol Danvers', job_title: 'Product Manager' }),
      updatedAt: '2026-10-25T10:00:00Z'
    }
  ];

  it('Running the same input twice produces zero writes the second time', () => {
    // RUN 1: Initial Sync
    const run1 = executeSyncRun({
      config: oneWayConfig,
      mappings: syncMappings,
      recordLinks: [],
      sourceRecords: sourceDataset,
      destinationRecords: [],
      planLimits: defaultPlanLimits,
      currentLinkedRecordsCount: 0,
      runId: 'run_initial_001'
    });

    // Verification of Run 1: 3 rows created in destination
    expect(run1.writesB.length).toBe(3);
    expect(run1.run.created).toBe(3);
    expect(run1.run.updated).toBe(0);
    expect(run1.run.skipped).toBe(0);
    expect(run1.run.failed).toBe(0);
    expect(run1.updatedRecordLinks.length).toBe(3);

    // Simulate destination records after Run 1 writes are committed
    const destRecordsAfterRun1: UniversalRecord[] = run1.writesB.map((w, idx) => ({
      externalId: `dest-row-${idx + 1}`,
      values: w.record.values,
      hash: computeStableHash(w.record.values),
      updatedAt: new Date().toISOString()
    }));

    // Update record links with destination external IDs
    const persistedLinks: RecordLink[] = run1.updatedRecordLinks.map((link, idx) => ({
      ...link,
      bExternalId: `dest-row-${idx + 1}`
    }));

    // RUN 2: Executing exactly the same input dataset again
    const run2 = executeSyncRun({
      config: oneWayConfig,
      mappings: syncMappings,
      recordLinks: persistedLinks,
      sourceRecords: sourceDataset,
      destinationRecords: destRecordsAfterRun1,
      planLimits: defaultPlanLimits,
      currentLinkedRecordsCount: 3,
      runId: 'run_idempotent_002'
    });

    // CRITICAL REQUIREMENT: Second run MUST produce zero writes and skip all unchanged records
    expect(run2.writesB.length).toBe(0);
    expect(run2.run.created).toBe(0);
    expect(run2.run.updated).toBe(0);
    expect(run2.run.skipped).toBe(3);
    expect(run2.run.failed).toBe(0);

    // RUN 3: When 1 record is changed (Bob gets promoted)
    const modifiedDataset: UniversalRecord[] = [
      sourceDataset[0], // Alice unchanged
      {
        externalId: 'row-2',
        values: { email: 'bob@acme.com', name: 'Bob Jones', role: 'Staff Designer' }, // changed
        hash: computeStableHash({ email_address: 'bob@acme.com', full_name: 'Bob Jones', job_title: 'Staff Designer' }),
        updatedAt: '2026-10-25T11:00:00Z'
      },
      sourceDataset[2] // Carol unchanged
    ];

    const run3 = executeSyncRun({
      config: oneWayConfig,
      mappings: syncMappings,
      recordLinks: persistedLinks,
      sourceRecords: modifiedDataset,
      destinationRecords: destRecordsAfterRun1,
      planLimits: defaultPlanLimits,
      currentLinkedRecordsCount: 3,
      runId: 'run_modified_003'
    });

    // Verification of Run 3: exactly 1 update, 0 creates, 2 skips
    expect(run3.writesB.length).toBe(1);
    expect(run3.writesB[0].action).toBe('update');
    expect(run3.writesB[0].record.values.job_title).toBe('Staff Designer');
    expect(run3.run.created).toBe(0);
    expect(run3.run.updated).toBe(1);
    expect(run3.run.skipped).toBe(2);
    expect(run3.run.failed).toBe(0);
  });
});

describe('Transformations & Filters Engine', () => {
  it('Applies date formatting transformation', () => {
    const res = applyTransformation('2026-10-24T15:30:00Z', {}, {
      type: 'date_format',
      params: { toFormat: 'YYYY-MM-DD' }
    });
    expect(res).toBe('2026-10-24');
  });

  it('Applies number to currency formatting', () => {
    const res = applyTransformation(12500, {}, {
      type: 'number_to_currency',
      params: { currencySymbol: '$' }
    });
    expect(res).toBe('$12500.00');
  });

  it('Applies name splitting', () => {
    const first = applyTransformation('Elena Rostova', {}, {
      type: 'split_name',
      params: { targetPart: 'first' }
    });
    const last = applyTransformation('Elena Rostova', {}, {
      type: 'split_name',
      params: { targetPart: 'last' }
    });
    expect(first).toBe('Elena');
    expect(last).toBe('Rostova');
  });

  it('Applies select value mapping table', () => {
    const res = applyTransformation('Todo', {}, {
      type: 'map_select_values',
      params: {
        valueMap: { Todo: 'Lead', Doing: 'Active' },
        fallbackValue: 'Unknown'
      }
    });
    expect(res).toBe('Lead');
  });

  it('Evaluates AND/OR filters correctly', () => {
    const pass = evaluateFilterGroup(
      { status: 'Active', value: 500 },
      {
        logic: 'AND',
        conditions: [
          { id: 'c1', field: 'status', operator: 'equals', value: 'Active' },
          { id: 'c2', field: 'value', operator: 'greater_than', value: 100 }
        ]
      }
    );
    expect(pass).toBe(true);
  });

  it('Protects against CSV Formula Injection (CWE-1236)', () => {
    const safeFormula = sanitizeForCsvExport('=SUM(A1:A10)');
    const safeCmd = sanitizeForCsvExport('@calc');
    const normalText = sanitizeForCsvExport('Normal Text');

    expect(safeFormula).toBe("'=SUM(A1:A10)");
    expect(safeCmd).toBe("'@calc");
    expect(normalText).toBe('Normal Text');
  });
});
