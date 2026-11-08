/**
 * In-App Background Sync Job Runner
 * Executes sync pipelines asynchronously on the Node.js backend server.
 * Handles:
 * - Page-based reading from source and destination
 * - Record matching using record_links table
 * - Loop prevention and duplicate elimination via deterministic SHA-256 hashing
 * - Idempotency key per write: `${syncId}:${runId}:${recordLinkId}:${action}`
 * - Exponential backoff on HTTP 429 and 5xx errors
 * - Plain-English error reporting and per-record audit events
 * - "Retry failed" job targeting
 */

import { db } from '../db/store';
import { supabaseRepo } from '../db/supabase-repo';
import { getConnector } from '../connectors/registry';
import { getActiveAccessToken } from '../connectors/google-sheets';
import { computeStableHash } from './hasher';
import { transformRecordValues } from './engine';
import { UniversalRecord } from './types';
import { RecordLinkRow, SyncEventRow, SyncRunRow } from '../db/schema';

// Running jobs registry
const activeBackgroundJobs = new Map<string, { status: string; startedAt: string }>();

export function getActiveJobStatus(runId: string) {
  return activeBackgroundJobs.get(runId);
}

/**
 * Execute an operation with exponential backoff on 429 and 5xx errors
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  operationName = 'write operation'
): Promise<T> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('quota');
      const isServerError = msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504');

      if ((isRateLimit || isServerError) && attempt < maxRetries) {
        attempt++;
        const delayMs = Math.min(10000, 1000 * Math.pow(2, attempt - 1) + Math.random() * 250);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw new Error(`${operationName} failed: ${msg}`);
    }
  }
  throw new Error(`${operationName} failed after ${maxRetries} retry attempts.`);
}

/**
 * Queue and start a real background sync job
 */
export async function queueBackgroundSyncJob(
  syncConfigId: string,
  runId: string,
  options: {
    isDryRun?: boolean;
    retryFailedRunId?: string;
    workspaceId?: string;
    userId?: string;
    precreatedRun?: SyncRunRow;
  } = {}
): Promise<SyncRunRow> {
  // Load pipeline directly from public.sync_configurations by id using Supabase service role key!
  const sync = await supabaseRepo.getSyncConfigurationById(syncConfigId);
  if (!sync) {
    throw new Error(
      `Sync pipeline not found in table "public.sync_configurations" with id "${syncConfigId}" and workspace_id "${options.workspaceId || 'any'}".`
    );
  }

  const isDryRun = !!options.isDryRun;
  const now = new Date().toISOString();

  // Create initial queued/running run record in the database
  const runRow: SyncRunRow = options.precreatedRun || {
    id: runId,
    syncConfigId,
    trigger: isDryRun ? 'dry_run' : options.retryFailedRunId ? 'manual' : (sync.triggerMode === 'scheduled' ? 'schedule' : 'manual'),
    status: 'running',
    startedAt: now,
    recordsRead: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    skipped: 0,
    conflicts: 0,
    failed: 0,
    isDryRun,
    createdAt: now,
    updatedAt: now
  };

  // Add to db.runs immediately so callers can poll it
  const existingIdx = db.runs.findIndex((r) => r.id === runId);
  if (existingIdx >= 0) {
    db.runs[existingIdx] = runRow;
  } else {
    db.runs.unshift(runRow);
  }
  db.saveToStorage();

  // If not precreated and already inserted in endpoint, insert now
  if (!options.precreatedRun) {
    await supabaseRepo.upsertSyncRun(runRow, sync.workspaceId);
  }

  activeBackgroundJobs.set(runId, { status: 'running', startedAt: now });

  // Detached async execution in background on Node.js
  setTimeout(async () => {
    try {
      await runJobWorker(syncConfigId, runId, options);
    } catch (err: any) {
      console.error(`[Background Sync Job ${runId}] Uncaught fatal error:`, err);
    } finally {
      activeBackgroundJobs.delete(runId);
    }
  }, 0);

  return runRow;
}

/**
 * Core asynchronous background job worker
 */
async function runJobWorker(
  syncConfigId: string,
  runId: string,
  options: { isDryRun?: boolean; retryFailedRunId?: string; workspaceId?: string; userId?: string }
) {
  let run: SyncRunRow | null = null;
  let syncWorkspaceId = options.workspaceId || '';

  try {
    // 1. Step: start
    console.log(`[SyncJob ${runId}] Step 1/6 (start): Job started for pipeline "${syncConfigId}" (dryRun: ${!!options.isDryRun})`);

    // 2. Step: pipeline loaded
    const sync = await supabaseRepo.getSyncConfigurationById(syncConfigId);
    if (!sync) {
      throw new Error(`Sync pipeline "${syncConfigId}" not found in table "public.sync_configurations".`);
    }
    syncWorkspaceId = sync.workspaceId;
    console.log(`[SyncJob ${runId}] Step 2/6 (pipeline loaded): Pipeline "${sync.name}" loaded (id: ${sync.id}, workspace: ${sync.workspaceId})`);

    run = (await supabaseRepo.getSyncRunById(runId)) || db.runs.find((r) => r.id === runId) || null;
    if (!run) {
      const now = new Date().toISOString();
      run = {
        id: runId,
        syncConfigId,
        trigger: options.isDryRun ? 'dry_run' : options.retryFailedRunId ? 'manual' : (sync.triggerMode === 'scheduled' ? 'schedule' : 'manual'),
        status: 'running',
        startedAt: now,
        recordsRead: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        skipped: 0,
        conflicts: 0,
        failed: 0,
        isDryRun: !!options.isDryRun,
        createdAt: now,
        updatedAt: now
      };
      await supabaseRepo.upsertSyncRun(run, sync.workspaceId);
    }

    // Resolve source endpoint A (CSV dataset)
    let endpointA = db.endpoints.find((e) => e.id === sync.endpointAId);
    if (sync.sourceDatasetId) {
      let ds = db.getCsvDatasetById(sync.sourceDatasetId);
      if (!ds) {
        ds = (await supabaseRepo.getCsvDatasetById(sync.sourceDatasetId)) || undefined;
        if (ds) {
          db.addCsvDataset(ds);
        }
      }
      if (ds && !endpointA) {
        endpointA = {
          id: sync.endpointAId || `ep_csv_${ds.id}`,
          workspaceId: sync.workspaceId,
          connectorId: 'csv',
          role: 'source',
          objectRef: {
            id: ds.id,
            name: ds.name,
            type: 'csv_dataset',
            recordCount: ds.rowCount
          },
          schemaSnapshot: {
            objectId: ds.id,
            name: ds.name,
            fields: ds.columns.map((c) => ({
              key: c.key,
              label: c.label,
              type: c.type as any,
              required: false,
              readOnly: false
            }))
          },
          createdAt: ds.createdAt,
          updatedAt: ds.updatedAt
        };
        db.endpoints.push(endpointA);
      }
    }

    // Resolve destination endpoint B (Google Sheets)
    let endpointB = db.endpoints.find((e) => e.id === sync.endpointBId);
    if (!endpointB && (sync.destinationResourceId || sync.endpointBId)) {
      endpointB = {
        id: sync.endpointBId || `ep_sheets_${sync.id}`,
        workspaceId: sync.workspaceId,
        connectedAccountId: sync.destinationAccountId,
        connectorId: 'google_sheets',
        role: 'destination',
        objectRef: {
          id: sync.destinationResourceId || sync.endpointBId,
          name: sync.destinationResourceName || sync.destinationResourceId || 'Google Sheet',
          type: 'spreadsheet'
        },
        createdAt: sync.createdAt,
        updatedAt: sync.updatedAt
      };
      db.endpoints.push(endpointB);
    }

    if (!endpointA || !endpointB) {
      throw new Error(`Endpoints could not be resolved. Source: ${endpointA ? 'OK' : 'Missing'}, Destination: ${endpointB ? 'OK' : 'Missing'}`);
    }

    const connA = getConnector(endpointA.connectorId);
    const connB = getConnector(endpointB.connectorId);

    // Resolve connected account for destination (Google Sheets)
    let accountB = db.accounts.find((a) => a.id === endpointB!.connectedAccountId || (a.connectorKey === 'google_sheets' && a.workspaceId === sync.workspaceId));
    if (!accountB || !accountB.encryptedAccessToken) {
      const accounts = await supabaseRepo.getConnectedAccounts(sync.workspaceId);
      const foundAcc = accounts.find((a) => a.id === endpointB!.connectedAccountId || a.connectorKey === 'google_sheets');
      if (foundAcc) {
        accountB = foundAcc as any;
        const existIdx = db.accounts.findIndex((a) => a.id === foundAcc.id);
        if (existIdx >= 0) db.accounts[existIdx] = foundAcc;
        else db.accounts.push(foundAcc);
      }
    }

    if (!accountB) {
      throw new Error(`No connected Google Sheets account found in workspace "${sync.workspaceId}".`);
    }

    // 4. Step: Google token ready
    await getActiveAccessToken(accountB as any);
    console.log(`[SyncJob ${runId}] Step 4/6 (Google token ready): Google access token ready for destination account "${accountB.displayName || accountB.id}"`);

    const accountA = db.accounts.find((a) => a.id === endpointA!.connectedAccountId) || {
      id: 'default_csv',
      workspaceId: sync.workspaceId,
      connectorKey: 'csv',
      displayName: 'CSV',
      accessToken: '',
      scopes: []
    };

    // Field mappings directly from Supabase Postgres
    let mappings = await supabaseRepo.getFieldMappings(syncConfigId, sync.workspaceId);
    if (!mappings || mappings.length === 0) {
      mappings = db.getFieldMappings(syncConfigId);
    }
    if (!mappings || mappings.length === 0) {
      throw new Error(`No field mappings configured for sync pipeline "${syncConfigId}".`);
    }
    const keyMapping = mappings.find((m) => m.isKey) || mappings[0];

    // 3. Step: CSV rows read (with count)
    let srcCursor: string | undefined = undefined;
    const allSourceRecords: UniversalRecord[] = [];
    do {
      const srcPage = await connA.readRecords(accountA as any, endpointA.objectRef, {
        pageSize: 100,
        cursor: srcCursor
      });
      allSourceRecords.push(...srcPage.records);
      srcCursor = srcPage.nextCursor;
    } while (srcCursor);

    console.log(`[SyncJob ${runId}] Step 3/6 (CSV rows read): Read ${allSourceRecords.length} rows from source CSV dataset "${endpointA.objectRef.name}" (dataset id: ${endpointA.objectRef.id})`);

    // Read destination records to establish current state and index by key
    const destById = new Map<string, UniversalRecord>();
    const destByKey = new Map<string, UniversalRecord>();

    let destCursor: string | undefined = undefined;
    do {
      const page = await connB.readRecords(accountB as any, endpointB.objectRef, {
        pageSize: 100,
        cursor: destCursor
      });
      for (const r of page.records) {
        destById.set(r.externalId, r);
        if (keyMapping) {
          const keyVal = String(r.values[keyMapping.destinationFieldKey] || '').toLowerCase().trim();
          if (keyVal) {
            destByKey.set(keyVal, r);
          }
        }
      }
      destCursor = page.nextCursor;
    } while (destCursor);

    // Fetch and index existing record links from Supabase Postgres
    const linksByA = new Map<string, RecordLinkRow>();
    let existingLinks = await supabaseRepo.getRecordLinks(syncConfigId);
    if (!existingLinks || existingLinks.length === 0) {
      existingLinks = db.getRecordLinks(syncConfigId);
    }
    for (const l of existingLinks) {
      linksByA.set(l.aExternalId, l);
    }

    // If retrying failed records only, get the external IDs of records that failed in that run
    let failedSourceIdsToRetry: Set<string> | null = null;
    if (options.retryFailedRunId) {
      const failedEvents = (await supabaseRepo.getSyncEvents(options.retryFailedRunId)).filter((e) => e.status === 'failed');
      failedSourceIdsToRetry = new Set(
        failedEvents.map((e) => e.recordLinkId ? e.recordLinkId.replace(/^link-/, '').split('-')[0] : '').filter(Boolean)
      );
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let recordsRead = 0;

    for (const srcRec of allSourceRecords) {
      recordsRead++;
      const now = new Date().toISOString();

      // If targeted retry, skip records that didn't fail
      if (failedSourceIdsToRetry && !failedSourceIdsToRetry.has(srcRec.externalId)) {
        continue;
      }

      // Transform values for Destination (B)
      const { values: transformedValues } = transformRecordValues(srcRec.values, mappings, 'a_to_b');
      const transformedHashB = computeStableHash(transformedValues);
      const currentSrcHash = computeStableHash(srcRec.values);

      // Check record links
      let link = linksByA.get(srcRec.externalId);

      // If not linked yet, check if destination already contains a row with matching unique key
      let matchedDestRec: UniversalRecord | undefined = undefined;
      if (!link && keyMapping) {
        const keyVal = String(srcRec.values[keyMapping.sourceFieldKey] || '').toLowerCase().trim();
        if (keyVal && destByKey.has(keyVal)) {
          matchedDestRec = destByKey.get(keyVal);
        }
      }

      const keyIdentifier = String(
        (keyMapping && srcRec.values[keyMapping.sourceFieldKey]) || srcRec.externalId
      );

      // CASE 1: UNLINKED AND NOT FOUND IN DESTINATION => CREATE NEW ROW
      if (!link && !matchedDestRec) {
        const newLinkId = `link-${srcRec.externalId}-b-${Date.now()}`;
        const idempotencyKey = `${sync.id}:${runId}:${newLinkId}:create`;

        if (options.isDryRun) {
          createdCount++;
          continue;
        }

        try {
          const writeRes = await executeWithRetry(
            () => connB.createRecord(accountB as any, endpointB.objectRef, {
              values: transformedValues,
              hash: transformedHashB,
              updatedAt: now
            }, idempotencyKey),
            3,
            `Create row for '${keyIdentifier}'`
          );

          const destExtId = writeRes.externalId || `dest_${srcRec.externalId}`;
          const newLink: RecordLinkRow = {
            id: newLinkId,
            syncConfigId: sync.id,
            aExternalId: srcRec.externalId,
            bExternalId: destExtId,
            lastSyncedHashA: currentSrcHash,
            lastSyncedHashB: transformedHashB,
            lastSyncedAt: now,
            createdAt: now,
            updatedAt: now
          };

          linksByA.set(srcRec.externalId, newLink);
          db.recordLinks.push(newLink);
          await supabaseRepo.upsertRecordLink(newLink, sync.workspaceId).catch(() => {});

          const event: SyncEventRow = {
            id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            syncRunId: runId,
            recordLinkId: newLinkId,
            action: 'create',
            side: 'B',
            status: 'succeeded',
            idempotencyKey,
            after: transformedValues,
            message: `Created row for key "${keyIdentifier}" in sheet.`,
            createdAt: now
          };
          db.events.push(event);
          await supabaseRepo.createSyncEvent(event, sync.id, sync.workspaceId).catch(() => {});

          createdCount++;
        } catch (err: any) {
          failedCount++;
          console.error(`[SyncJob ${runId}] Failed to create row for "${keyIdentifier}":`, err);
          const event: SyncEventRow = {
            id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            syncRunId: runId,
            recordLinkId: newLinkId,
            action: 'create',
            side: 'B',
            status: 'failed',
            idempotencyKey,
            after: transformedValues,
            message: `Failed creating row for "${keyIdentifier}": ${err.message || String(err)}`,
            createdAt: now
          };
          db.events.push(event);
          await supabaseRepo.createSyncEvent(event, sync.id, sync.workspaceId).catch(() => {});
        }
        continue;
      }

      // CASE 2: MATCHED BY KEY BUT NOT YET LINKED => LINK AND UPDATE
      if (!link && matchedDestRec) {
        const newLinkId = `link-${srcRec.externalId}-${matchedDestRec.externalId}`;
        const newLink: RecordLinkRow = {
          id: newLinkId,
          syncConfigId: sync.id,
          aExternalId: srcRec.externalId,
          bExternalId: matchedDestRec.externalId,
          lastSyncedHashA: currentSrcHash,
          lastSyncedHashB: matchedDestRec.hash || '',
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now
        };
        link = newLink;
        linksByA.set(srcRec.externalId, newLink);
        db.recordLinks.push(newLink);
        await supabaseRepo.upsertRecordLink(newLink, sync.workspaceId).catch(() => {});
      }

      // CASE 3: LINKED RECORD => CHECK CHANGE HASH
      if (link) {
        const destRec = destById.get(link.bExternalId);
        const hasSourceChanged = currentSrcHash !== link.lastSyncedHashA;
        const currentDestHash = destRec ? computeStableHash(destRec.values) : link.lastSyncedHashB;
        const hasDestChanged = destRec && link.lastSyncedHashB && currentDestHash !== link.lastSyncedHashB;

        // SUBCASE 3A: NEITHER CHANGED => SKIP
        if (!hasSourceChanged && !hasDestChanged) {
          skippedCount++;
          continue;
        }

        // SUBCASE 3B: SOURCE CHANGED, DEST UNCHANGED => UPDATE DESTINATION
        if (hasSourceChanged && !hasDestChanged) {
          const idempotencyKey = `${sync.id}:${runId}:${link.id}:update`;

          if (options.isDryRun) {
            updatedCount++;
            continue;
          }

          try {
            await executeWithRetry(
              () => connB.updateRecord(accountB as any, endpointB.objectRef, link!.bExternalId, {
                values: transformedValues,
                hash: transformedHashB,
                updatedAt: now
              }, idempotencyKey),
              3,
              `Update row for '${keyIdentifier}'`
            );

            link.lastSyncedHashA = currentSrcHash;
            link.lastSyncedHashB = transformedHashB;
            link.lastSyncedAt = now;
            link.updatedAt = now;
            await supabaseRepo.upsertRecordLink(link, sync.workspaceId).catch(() => {});

            const event: SyncEventRow = {
              id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              syncRunId: runId,
              recordLinkId: link.id,
              action: 'update',
              side: 'B',
              status: 'succeeded',
              idempotencyKey,
              before: destRec?.values,
              after: transformedValues,
              message: `Updated row for key "${keyIdentifier}" in sheet.`,
              createdAt: now
            };
            db.events.push(event);
            await supabaseRepo.createSyncEvent(event, sync.id, sync.workspaceId).catch(() => {});

            updatedCount++;
          } catch (err: any) {
            failedCount++;
            console.error(`[SyncJob ${runId}] Failed to update row for "${keyIdentifier}":`, err);
            const event: SyncEventRow = {
              id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              syncRunId: runId,
              recordLinkId: link.id,
              action: 'update',
              side: 'B',
              status: 'failed',
              idempotencyKey,
              after: transformedValues,
              message: `Failed updating row for "${keyIdentifier}": ${err.message || String(err)}`,
              createdAt: now
            };
            db.events.push(event);
            await supabaseRepo.createSyncEvent(event, sync.id, sync.workspaceId).catch(() => {});
          }
        }
      }
    }

    // 5. Step: rows written to the sheet
    console.log(`[SyncJob ${runId}] Step 5/6 (rows written to the sheet): Written to sheet "${endpointB.objectRef.name}" (${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped, ${failedCount} failed)`);

    // 4. Update run final state & counts
    const finishedNow = new Date().toISOString();
    run.status = failedCount === 0 ? 'succeeded' : (createdCount > 0 || updatedCount > 0 ? 'partial' : 'failed');
    run.finishedAt = finishedNow;
    run.updatedAt = finishedNow;
    run.recordsRead = recordsRead;
    run.created = createdCount;
    run.updated = updatedCount;
    run.skipped = skippedCount;
    run.failed = failedCount;

    sync.lastRunAt = finishedNow;
    sync.status = run.status === 'failed' ? 'error' : 'active';
    sync.updatedAt = finishedNow;

    db.saveToStorage();

    // Persist completed sync run, sync config status, usage counter, and audit log to Supabase Postgres
    await Promise.all([
      supabaseRepo.upsertSyncRun(run, sync.workspaceId),
      supabaseRepo.updateSyncConfigurationRunStatus(sync.id, finishedNow, sync.status),
      supabaseRepo.incrementUsageCounter(sync.workspaceId, createdCount + updatedCount, 1),
      supabaseRepo.createAuditLog({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        workspaceId: sync.workspaceId,
        action: 'sync.executed',
        targetType: 'sync_config',
        targetId: sync.id,
        metadata: {
          runId,
          created: createdCount,
          updated: updatedCount,
          skipped: skippedCount,
          failed: failedCount,
          isDryRun: options.isDryRun
        },
        createdAt: finishedNow
      })
    ]).catch((e) => console.error(`[SyncJob ${runId}] Error persisting final run stats:`, e));

    // 6. Step: finished
    console.log(`[SyncJob ${runId}] Step 6/6 (finished): Job completed with status "${run.status}" (read: ${recordsRead}, created: ${createdCount}, updated: ${updatedCount}, skipped: ${skippedCount}, failed: ${failedCount})`);

  } catch (err: any) {
    const errorMsg = err.message || String(err);
    console.error(`[SyncJob ${runId}] Fatal error during sync job execution:`, errorMsg, err);
    const finishedNow = new Date().toISOString();
    if (run) {
      run.status = 'failed';
      run.finishedAt = finishedNow;
      run.updatedAt = finishedNow;
      const existIdx = db.runs.findIndex((r) => r.id === runId);
      if (existIdx >= 0) db.runs[existIdx] = run;
      else db.runs.unshift(run);
      db.saveToStorage();
      if (syncWorkspaceId) {
        await supabaseRepo.upsertSyncRun(run, syncWorkspaceId).catch(() => {});
        await supabaseRepo.createSyncError({
          id: `err_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          syncRunId: runId,
          category: 'execution',
          code: 'SYNC_JOB_FAILED',
          userMessage: errorMsg,
          raw: { error: errorMsg, stack: err.stack },
          isResolved: false,
          createdAt: finishedNow,
          updatedAt: finishedNow
        }, syncWorkspaceId).catch(() => {});
        await supabaseRepo.updateSyncConfigurationRunStatus(syncConfigId, finishedNow, 'error').catch(() => {});
      }
    }
  }
}
