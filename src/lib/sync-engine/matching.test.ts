/**
 * Unit Test: Record Matching Logic & Deduplication
 * Verifies the core sync engine guarantee:
 * "running the same input twice produces zero writes the second time"
 * using the record_links table (sync_config_id, source_external_id, destination_external_id, last_synced_hash, last_synced_at).
 */

import { describe, it, expect } from 'vitest';
import { executeSyncRun } from './engine';
import { computeStableHash } from './hasher';
import { SyncConfig, FieldMapping, RecordLink, UniversalRecord, PlanLimits } from './types';

const testLimits: PlanLimits = {
  maxRecords: 10000,
  maxActiveSyncs: 10,
  minIntervalMinutes: 1,
  premiumConnectors: true,
  teamSeats: 5,
  logRetentionDays: 30,
  realtime: true
};

const pipelineConfig: SyncConfig = {
  id: 'sync_csv_to_sheets_test',
  workspaceId: 'ws_test_stage2',
  name: 'CSV to Google Sheets One-Way Sync',
  endpointAId: 'ep_csv_source',
  endpointBId: 'ep_sheets_dest',
  direction: 'a_to_b',
  conflictRule: 'source_wins',
  triggerMode: 'manual',
  intervalMinutes: 15,
  deleteBehavior: 'ignore',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const mappings: FieldMapping[] = [
  {
    id: 'map_email',
    sourceFieldKey: 'email',
    destinationFieldKey: 'email_address',
    isKey: true,
    required: true
  },
  {
    id: 'map_full_name',
    sourceFieldKey: 'name',
    destinationFieldKey: 'customer_name',
    isKey: false,
    required: true
  },
  {
    id: 'map_plan',
    sourceFieldKey: 'plan',
    destinationFieldKey: 'subscription_tier',
    isKey: false,
    required: false
  }
];

describe('Record Matching Logic (Stage 2 Requirement)', () => {
  const initialSourceRecords: UniversalRecord[] = [
    {
      externalId: 'row_1',
      values: { email: 'sarah.connor@sky.net', name: 'Sarah Connor', plan: 'Enterprise' },
      hash: computeStableHash({ email: 'sarah.connor@sky.net', name: 'Sarah Connor', plan: 'Enterprise' })
    },
    {
      externalId: 'row_2',
      values: { email: 'john.reese@mit.edu', name: 'John Reese', plan: 'Starter' },
      hash: computeStableHash({ email: 'john.reese@mit.edu', name: 'John Reese', plan: 'Starter' })
    },
    {
      externalId: 'row_3',
      values: { email: 'elena.rostova@global.io', name: 'Elena Rostova', plan: 'Pro' },
      hash: computeStableHash({ email: 'elena.rostova@global.io', name: 'Elena Rostova', plan: 'Pro' })
    }
  ];

  it('Running the same input twice produces zero writes the second time', () => {
    // --- RUN 1: Initial Sync on Empty Destination ---
    const run1 = executeSyncRun({
      config: pipelineConfig,
      mappings,
      recordLinks: [],
      sourceRecords: initialSourceRecords,
      destinationRecords: [],
      planLimits: testLimits,
      currentLinkedRecordsCount: 0,
      runId: 'run_stage2_001'
    });

    // Run 1 must create 3 destination records and generate 3 record links
    expect(run1.run.created).toBe(3);
    expect(run1.run.updated).toBe(0);
    expect(run1.run.skipped).toBe(0);
    expect(run1.writesB.length).toBe(3);
    expect(run1.updatedRecordLinks.length).toBe(3);

    // Verify record link properties
    const link1 = run1.updatedRecordLinks.find((l) => l.aExternalId === 'row_1');
    expect(link1).toBeDefined();
    expect(link1?.syncConfigId).toBe(pipelineConfig.id);
    expect(link1?.bExternalId).toBeTruthy();
    expect(link1?.lastSyncedHashA).toBe(initialSourceRecords[0].hash);

    // Build destination state after Run 1 writes succeed
    const destinationRecordsAfterRun1: UniversalRecord[] = run1.writesB.map((w) => ({
      externalId: w.record.externalId,
      values: w.record.values,
      hash: computeStableHash(w.record.values)
    }));

    // --- RUN 2: Re-run with the exact same input ---
    const run2 = executeSyncRun({
      config: pipelineConfig,
      mappings,
      recordLinks: run1.updatedRecordLinks,
      sourceRecords: initialSourceRecords, // EXACT SAME INPUT
      destinationRecords: destinationRecordsAfterRun1,
      planLimits: testLimits,
      currentLinkedRecordsCount: run1.updatedRecordLinks.length,
      runId: 'run_stage2_002'
    });

    // ZERO WRITES THE SECOND TIME
    expect(run2.writesA.length).toBe(0);
    expect(run2.writesB.length).toBe(0);
    expect(run2.run.created).toBe(0);
    expect(run2.run.updated).toBe(0);
    expect(run2.run.skipped).toBe(3);
    expect(run2.run.failed).toBe(0);
    expect(run2.run.conflicts).toBe(0);
  });

  it('Modifying one record on subsequent run produces exactly 1 update and 0 creates', () => {
    // Start with established links from run 1
    const establishedLinks: RecordLink[] = initialSourceRecords.map((src, idx) => ({
      id: `link_${idx + 1}`,
      syncConfigId: pipelineConfig.id,
      aExternalId: src.externalId,
      bExternalId: `dest_row_${idx + 1}`,
      lastSyncedHashA: src.hash,
      lastSyncedHashB: computeStableHash({
        email_address: src.values.email,
        customer_name: src.values.name,
        subscription_tier: src.values.plan
      }),
      lastSyncedAt: new Date().toISOString()
    }));

    const destinationRecords: UniversalRecord[] = initialSourceRecords.map((src, idx) => ({
      externalId: `dest_row_${idx + 1}`,
      values: {
        email_address: src.values.email,
        customer_name: src.values.name,
        subscription_tier: src.values.plan
      },
      hash: computeStableHash({
        email_address: src.values.email,
        customer_name: src.values.name,
        subscription_tier: src.values.plan
      })
    }));

    // Modify row_2's plan in the source CSV
    const modifiedSourceRecords: UniversalRecord[] = [
      initialSourceRecords[0], // Unchanged
      {
        externalId: 'row_2',
        values: { email: 'john.reese@mit.edu', name: 'John Reese', plan: 'Enterprise' }, // Changed Starter -> Enterprise
        hash: computeStableHash({ email: 'john.reese@mit.edu', name: 'John Reese', plan: 'Enterprise' })
      },
      initialSourceRecords[2] // Unchanged
    ];

    const run3 = executeSyncRun({
      config: pipelineConfig,
      mappings,
      recordLinks: establishedLinks,
      sourceRecords: modifiedSourceRecords,
      destinationRecords,
      planLimits: testLimits,
      currentLinkedRecordsCount: 3,
      runId: 'run_stage2_003'
    });

    expect(run3.run.created).toBe(0);
    expect(run3.run.updated).toBe(1);
    expect(run3.run.skipped).toBe(2);
    expect(run3.writesB.length).toBe(1);
    expect(run3.writesB[0].action).toBe('update');
    expect(run3.writesB[0].record.values.subscription_tier).toBe('Enterprise');
  });

  it('Adding a new record creates only the new record without affecting unchanged ones', () => {
    const establishedLinks: RecordLink[] = [
      {
        id: 'link_1',
        syncConfigId: pipelineConfig.id,
        aExternalId: 'row_1',
        bExternalId: 'dest_row_1',
        lastSyncedHashA: initialSourceRecords[0].hash,
        lastSyncedHashB: computeStableHash({
          email_address: initialSourceRecords[0].values.email,
          customer_name: initialSourceRecords[0].values.name,
          subscription_tier: initialSourceRecords[0].values.plan
        }),
        lastSyncedAt: new Date().toISOString()
      }
    ];

    const sourceWithNewRow: UniversalRecord[] = [
      initialSourceRecords[0], // existing
      {
        externalId: 'row_4',
        values: { email: 'marcus.wright@resistance.org', name: 'Marcus Wright', plan: 'Starter' },
        hash: computeStableHash({ email: 'marcus.wright@resistance.org', name: 'Marcus Wright', plan: 'Starter' })
      }
    ];

    const destinationRecords: UniversalRecord[] = [
      {
        externalId: 'dest_row_1',
        values: {
          email_address: initialSourceRecords[0].values.email,
          customer_name: initialSourceRecords[0].values.name,
          subscription_tier: initialSourceRecords[0].values.plan
        },
        hash: computeStableHash({
          email_address: initialSourceRecords[0].values.email,
          customer_name: initialSourceRecords[0].values.name,
          subscription_tier: initialSourceRecords[0].values.plan
        })
      }
    ];

    const run4 = executeSyncRun({
      config: pipelineConfig,
      mappings,
      recordLinks: establishedLinks,
      sourceRecords: sourceWithNewRow,
      destinationRecords,
      planLimits: testLimits,
      currentLinkedRecordsCount: 1,
      runId: 'run_stage2_004'
    });

    expect(run4.run.created).toBe(1);
    expect(run4.run.updated).toBe(0);
    expect(run4.run.skipped).toBe(1);
    expect(run4.writesB.length).toBe(1);
    expect(run4.writesB[0].action).toBe('create');
    expect(run4.writesB[0].record.values.email_address).toBe('marcus.wright@resistance.org');
  });
});
