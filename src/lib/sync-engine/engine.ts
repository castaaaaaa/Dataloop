/**
 * Core Sync Engine
 * Implements Section 4.4 and Section 4.5 of the Build Brief
 */

import {
  SyncConfig,
  FieldMapping,
  RecordLink,
  UniversalRecord,
  SyncRun,
  SyncEvent,
  SyncError,
  ConflictItem,
  PlanLimits,
  ActionType,
  UniversalField
} from './types';
import { computeStableHash } from './hasher';
import { applyTransformation } from './transformer';
import { evaluateFilterGroup } from './filter';

export interface SyncEngineContext {
  config: SyncConfig;
  mappings: FieldMapping[];
  recordLinks: RecordLink[];
  sourceRecords: UniversalRecord[];
  destinationRecords: UniversalRecord[];
  planLimits: PlanLimits;
  currentLinkedRecordsCount: number;
  isDryRun?: boolean;
  runId: string;
}

export interface SyncEngineResult {
  run: SyncRun;
  events: SyncEvent[];
  updatedRecordLinks: RecordLink[];
  newConflicts: ConflictItem[];
  errors: SyncError[];
  writesA: Array<{ action: 'create' | 'update' | 'delete'; record: UniversalRecord; idempotencyKey: string; recordLinkId: string }>;
  writesB: Array<{ action: 'create' | 'update' | 'delete'; record: UniversalRecord; idempotencyKey: string; recordLinkId: string }>;
  hitRecordLimit: boolean;
  dryRunReport?: {
    summary: {
      wouldCreate: number;
      wouldUpdate: number;
      wouldDelete: number;
      wouldSkip: number;
      conflicts: number;
      warnings: string[];
    };
    diffs: Array<{
      externalId: string;
      action: ActionType;
      keyIdentifier: string;
      before: Record<string, unknown>;
      after: Record<string, unknown>;
      warnings?: string[];
    }>;
  };
}

/**
 * Maps and transforms fields from source to target schema
 */
export function transformRecordValues(
  sourceValues: Record<string, unknown>,
  mappings: FieldMapping[],
  direction: 'a_to_b' | 'b_to_a'
): { values: Record<string, unknown>; warnings: string[] } {
  const transformed: Record<string, unknown> = {};
  const warnings: string[] = [];

  for (const mapping of mappings) {
    const srcKey = direction === 'a_to_b' ? mapping.sourceFieldKey : mapping.destinationFieldKey;
    const dstKey = direction === 'a_to_b' ? mapping.destinationFieldKey : mapping.sourceFieldKey;

    let val = sourceValues[srcKey];

    // Apply transformation
    if (mapping.transform) {
      val = applyTransformation(val, sourceValues, mapping.transform);
    }

    // Default value fallback
    if ((val === null || val === undefined || val === '') && mapping.defaultValue !== undefined) {
      val = mapping.defaultValue;
    }

    // Check required flag
    if (mapping.required && (val === null || val === undefined || val === '')) {
      warnings.push(`Missing required field '${dstKey}' mapped from '${srcKey}'`);
    }

    transformed[dstKey] = val;
  }

  return { values: transformed, warnings };
}

/**
 * Execute Sync Simulation / Real Engine Run
 */
export function executeSyncRun(ctx: SyncEngineContext): SyncEngineResult {
  const {
    config,
    mappings,
    recordLinks,
    sourceRecords,
    destinationRecords,
    planLimits,
    currentLinkedRecordsCount,
    isDryRun = false,
    runId
  } = ctx;

  const now = new Date().toISOString();

  // Find key mapping for cross-system correlation
  const keyMapping = mappings.find((m) => m.isKey) || mappings[0];

  // Index existing record links by A and B external IDs
  const linksByA = new Map<string, RecordLink>();
  const linksByB = new Map<string, RecordLink>();
  const allRecordLinks: RecordLink[] = recordLinks.map((l) => ({ ...l }));

  for (const link of allRecordLinks) {
    linksByA.set(link.aExternalId, link);
    linksByB.set(link.bExternalId, link);
  }

  // Index destination records by externalId and by key field
  const destById = new Map<string, UniversalRecord>();
  const destByKey = new Map<string, UniversalRecord>();
  for (const r of destinationRecords) {
    destById.set(r.externalId, r);
    if (keyMapping) {
      const keyVal = String(r.values[keyMapping.destinationFieldKey] || '').toLowerCase().trim();
      if (keyVal) destByKey.set(keyVal, r);
    }
  }

  // Index source records by externalId and by key field
  const srcById = new Map<string, UniversalRecord>();
  const srcByKey = new Map<string, UniversalRecord>();
  for (const r of sourceRecords) {
    srcById.set(r.externalId, r);
    if (keyMapping) {
      const keyVal = String(r.values[keyMapping.sourceFieldKey] || '').toLowerCase().trim();
      if (keyVal) srcByKey.set(keyVal, r);
    }
  }

  const events: SyncEvent[] = [];
  const errors: SyncError[] = [];
  const newConflicts: ConflictItem[] = [];
  const writesA: SyncEngineResult['writesA'] = [];
  const writesB: SyncEngineResult['writesB'] = [];
  const diffs: NonNullable<SyncEngineResult['dryRunReport']>['diffs'] = [];
  const generalWarnings: string[] = [];

  let createdCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;
  let skippedCount = 0;
  let conflictCount = 0;
  let failedCount = 0;
  let hitRecordLimit = false;

  let projectedLinkedCount = currentLinkedRecordsCount;

  // Process A -> B records (One-way A->B or Two-Way)
  if (config.direction === 'a_to_b' || config.direction === 'two_way') {
    for (const srcRec of sourceRecords) {
      // 1. Filter evaluation
      if (config.filters && !evaluateFilterGroup(srcRec.values, config.filters)) {
        skippedCount++;
        continue;
      }

      // Compute hash of source values
      const currentSrcHash = computeStableHash(srcRec.values);

      // Check existing link
      let link = linksByA.get(srcRec.externalId);

      // If not linked yet, check matching key in destination
      let matchedDestRec: UniversalRecord | undefined;
      if (!link && keyMapping) {
        const keyVal = String(srcRec.values[keyMapping.sourceFieldKey] || '').toLowerCase().trim();
        if (keyVal && destByKey.has(keyVal)) {
          matchedDestRec = destByKey.get(keyVal);
          if (matchedDestRec && linksByB.has(matchedDestRec.externalId)) {
            // Already linked to someone else
            matchedDestRec = undefined;
          }
        }
      }

      // Transform values for B
      const { values: transformedForB, warnings } = transformRecordValues(srcRec.values, mappings, 'a_to_b');
      if (warnings.length > 0) {
        generalWarnings.push(...warnings);
      }

      const transformedHashB = computeStableHash(transformedForB);

      if (!link && !matchedDestRec) {
        // ACTION: CREATE IN DESTINATION (B)
        if (projectedLinkedCount >= planLimits.maxRecords) {
          hitRecordLimit = true;
          skippedCount++;
          errors.push({
            id: `err-limit-${srcRec.externalId}`,
            syncRunId: runId,
            category: 'validation',
            code: 'PLAN_RECORD_LIMIT_EXCEEDED',
            userMessage: `Plan limit reached (${planLimits.maxRecords.toLocaleString()} records per month on Free (testing)). Remaining new records skipped.`,
            fixHint: 'The Free (testing) plan limit is 1,000 records per month.',
            isResolved: false,
            createdAt: now
          });
          continue;
        }

        const newLinkId = `link-${srcRec.externalId}-b-${Date.now()}`;
        const idempotencyKey = `${config.id}:${runId}:${newLinkId}:create_b`;

        writesB.push({
          action: 'create',
          record: {
            externalId: `pending_b_${srcRec.externalId}`,
            values: transformedForB,
            hash: transformedHashB,
            updatedAt: now
          },
          idempotencyKey,
          recordLinkId: newLinkId
        });

        const newLink: RecordLink = {
          id: newLinkId,
          syncConfigId: config.id,
          aExternalId: srcRec.externalId,
          bExternalId: `pending_b_${srcRec.externalId}`,
          lastSyncedHashA: currentSrcHash,
          lastSyncedHashB: transformedHashB,
          lastSyncedAt: now
        };
        allRecordLinks.push(newLink);
        linksByA.set(srcRec.externalId, newLink);

        createdCount++;
        projectedLinkedCount++;

        events.push({
          id: `evt-${events.length + 1}`,
          syncRunId: runId,
          recordLinkId: newLinkId,
          action: 'create',
          side: 'B',
          status: 'succeeded',
          idempotencyKey,
          before: {},
          after: transformedForB,
          message: `Created record in destination for source #${srcRec.externalId}`,
          timestamp: now
        });

        diffs.push({
          externalId: srcRec.externalId,
          action: 'create',
          keyIdentifier: String(srcRec.values[keyMapping?.sourceFieldKey || 'id'] || srcRec.externalId),
          before: {},
          after: transformedForB,
          warnings
        });
      } else {
        // EXISTING RECORD LINK OR MATCHED KEY
        const activeLink = link || {
          id: `link-${srcRec.externalId}-${matchedDestRec!.externalId}`,
          syncConfigId: config.id,
          aExternalId: srcRec.externalId,
          bExternalId: matchedDestRec!.externalId,
          lastSyncedHashA: '',
          lastSyncedHashB: computeStableHash(matchedDestRec!.values),
          lastSyncedAt: now
        };

        if (!link && matchedDestRec) {
          allRecordLinks.push(activeLink);
          linksByA.set(srcRec.externalId, activeLink);
          linksByB.set(matchedDestRec.externalId, activeLink);
        }

        const destRec = destById.get(activeLink.bExternalId) || matchedDestRec;
        const currentDestHash = destRec ? computeStableHash(destRec.values) : activeLink.lastSyncedHashB;

        // Check Loop Prevention: Did A change since last sync?
        const aChanged = currentSrcHash !== activeLink.lastSyncedHashA;
        // Did B change since last sync?
        const bChanged = currentDestHash !== activeLink.lastSyncedHashB;

        // LOOP PREVENTION: If values match our own last write, skip!
        if (!aChanged && !bChanged) {
          skippedCount++;
          continue;
        }

        if (config.direction === 'two_way' && aChanged && bChanged) {
          // CONFLICT DETECTED!
          conflictCount++;

          if (config.conflictRule === 'source_wins') {
            // Overwrite B
            const idempotencyKey = `${config.id}:${runId}:${activeLink.id}:update_b`;
            writesB.push({
              action: 'update',
              record: {
                externalId: activeLink.bExternalId,
                values: transformedForB,
                hash: transformedHashB,
                updatedAt: now
              },
              idempotencyKey,
              recordLinkId: activeLink.id
            });
            activeLink.lastSyncedHashA = currentSrcHash;
            activeLink.lastSyncedHashB = transformedHashB;
            activeLink.lastSyncedAt = now;
            updatedCount++;
          } else if (config.conflictRule === 'destination_wins') {
            // Overwrite A
            if (destRec) {
              const { values: transformedForA } = transformRecordValues(destRec.values, mappings, 'b_to_a');
              const transformedHashA = computeStableHash(transformedForA);
              const idempotencyKey = `${config.id}:${runId}:${activeLink.id}:update_a`;
              writesA.push({
                action: 'update',
                record: {
                  externalId: activeLink.aExternalId,
                  values: transformedForA,
                  hash: transformedHashA,
                  updatedAt: now
                },
                idempotencyKey,
                recordLinkId: activeLink.id
              });
              activeLink.lastSyncedHashA = transformedHashA;
              activeLink.lastSyncedHashB = currentDestHash;
              activeLink.lastSyncedAt = now;
              updatedCount++;
            }
          } else if (config.conflictRule === 'newest_wins') {
            // Check updatedAt timestamps
            const timeA = srcRec.updatedAt ? new Date(srcRec.updatedAt).getTime() : 0;
            const timeB = destRec?.updatedAt ? new Date(destRec.updatedAt).getTime() : 0;
            if (timeB > timeA && destRec) {
              // B is newer
              const { values: transformedForA } = transformRecordValues(destRec.values, mappings, 'b_to_a');
              writesA.push({
                action: 'update',
                record: {
                  externalId: activeLink.aExternalId,
                  values: transformedForA,
                  hash: computeStableHash(transformedForA),
                  updatedAt: now
                },
                idempotencyKey: `${config.id}:${runId}:${activeLink.id}:update_a`,
                recordLinkId: activeLink.id
              });
              updatedCount++;
            } else {
              // A is newer
              writesB.push({
                action: 'update',
                record: {
                  externalId: activeLink.bExternalId,
                  values: transformedForB,
                  hash: transformedHashB,
                  updatedAt: now
                },
                idempotencyKey: `${config.id}:${runId}:${activeLink.id}:update_b`,
                recordLinkId: activeLink.id
              });
              updatedCount++;
            }
          } else {
            // MANUAL REVIEW RULE: Write conflict item, pause this record
            const conflictItem: ConflictItem = {
              id: `conflict-${activeLink.id}-${Date.now()}`,
              syncConfigId: config.id,
              recordLinkId: activeLink.id,
              aValue: srcRec.values,
              bValue: destRec?.values || {},
              status: 'open',
              createdAt: now
            };
            newConflicts.push(conflictItem);

            events.push({
              id: `evt-${events.length + 1}`,
              syncRunId: runId,
              recordLinkId: activeLink.id,
              action: 'conflict',
              side: 'B',
              status: 'pending',
              idempotencyKey: `${config.id}:${runId}:${activeLink.id}:conflict`,
              before: destRec?.values || {},
              after: transformedForB,
              message: `Conflicting changes on both sides. Sent to Review Queue.`,
              timestamp: now
            });
            continue;
          }
        } else if (aChanged) {
          // A changed -> update B
          const idempotencyKey = `${config.id}:${runId}:${activeLink.id}:update_b`;
          writesB.push({
            action: 'update',
            record: {
              externalId: activeLink.bExternalId,
              values: transformedForB,
              hash: transformedHashB,
              updatedAt: now
            },
            idempotencyKey,
            recordLinkId: activeLink.id
          });
          activeLink.lastSyncedHashA = currentSrcHash;
          activeLink.lastSyncedHashB = transformedHashB;
          activeLink.lastSyncedAt = now;
          updatedCount++;

          events.push({
            id: `evt-${events.length + 1}`,
            syncRunId: runId,
            recordLinkId: activeLink.id,
            action: 'update',
            side: 'B',
            status: 'succeeded',
            idempotencyKey,
            before: destRec?.values || {},
            after: transformedForB,
            message: `Updated destination record #${activeLink.bExternalId}`,
            timestamp: now
          });

          diffs.push({
            externalId: activeLink.bExternalId,
            action: 'update',
            keyIdentifier: String(srcRec.values[keyMapping?.sourceFieldKey || 'id'] || activeLink.bExternalId),
            before: destRec?.values || {},
            after: transformedForB,
            warnings
          });
        } else if (bChanged && config.direction === 'two_way') {
          // B changed in two-way -> update A
          if (destRec) {
            const { values: transformedForA } = transformRecordValues(destRec.values, mappings, 'b_to_a');
            const transformedHashA = computeStableHash(transformedForA);
            const idempotencyKey = `${config.id}:${runId}:${activeLink.id}:update_a`;
            writesA.push({
              action: 'update',
              record: {
                externalId: activeLink.aExternalId,
                values: transformedForA,
                hash: transformedHashA,
                updatedAt: now
              },
              idempotencyKey,
              recordLinkId: activeLink.id
            });
            activeLink.lastSyncedHashA = transformedHashA;
            activeLink.lastSyncedHashB = currentDestHash;
            activeLink.lastSyncedAt = now;
            updatedCount++;

            events.push({
              id: `evt-${events.length + 1}`,
              syncRunId: runId,
              recordLinkId: activeLink.id,
              action: 'update',
              side: 'A',
              status: 'succeeded',
              idempotencyKey,
              before: srcRec.values,
              after: transformedForA,
              message: `Updated source record #${activeLink.aExternalId} from destination`,
              timestamp: now
            });
          }
        } else {
          skippedCount++;
        }
      }
    }
  }

  // Handle Deletions if enabled
  if (config.deleteBehavior !== 'ignore') {
    for (const link of allRecordLinks) {
      const srcExists = srcById.has(link.aExternalId);
      if (!srcExists && !link.aDeleted) {
        if (config.deleteBehavior === 'hard_delete') {
          deletedCount++;
          writesB.push({
            action: 'delete',
            record: { externalId: link.bExternalId, values: {}, hash: '' },
            idempotencyKey: `${config.id}:${runId}:${link.id}:delete_b`,
            recordLinkId: link.id
          });
          link.bDeleted = true;
          link.aDeleted = true;
        } else if (config.deleteBehavior === 'soft_delete') {
          updatedCount++;
          writesB.push({
            action: 'update',
            record: { externalId: link.bExternalId, values: { _status: 'archived', is_archived: true }, hash: '' },
            idempotencyKey: `${config.id}:${runId}:${link.id}:soft_delete_b`,
            recordLinkId: link.id
          });
          link.aDeleted = true;
        }
      }
    }
  }

  const recordsRead = sourceRecords.length + (config.direction === 'two_way' ? destinationRecords.length : 0);
  let status: SyncRun['status'] = 'succeeded';
  if (hitRecordLimit) status = 'partial';
  if (failedCount > 0 && createdCount === 0 && updatedCount === 0) status = 'failed';

  const run: SyncRun = {
    id: runId,
    syncConfigId: config.id,
    trigger: isDryRun ? 'dry_run' : 'manual',
    status,
    startedAt: now,
    finishedAt: new Date().toISOString(),
    recordsRead,
    created: createdCount,
    updated: updatedCount,
    deleted: deletedCount,
    skipped: skippedCount,
    conflicts: conflictCount,
    failed: failedCount,
    isDryRun
  };

  return {
    run,
    events,
    updatedRecordLinks: allRecordLinks,
    newConflicts,
    errors,
    writesA: isDryRun ? [] : writesA,
    writesB: isDryRun ? [] : writesB,
    hitRecordLimit,
    dryRunReport: isDryRun
      ? {
          summary: {
            wouldCreate: createdCount,
            wouldUpdate: updatedCount,
            wouldDelete: deletedCount,
            wouldSkip: skippedCount,
            conflicts: conflictCount,
            warnings: Array.from(new Set(generalWarnings))
          },
          diffs
        }
      : undefined
  };
}
