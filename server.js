var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/lib/db/seed.ts
var SEED_PLANS, SEED_WORKSPACES;
var init_seed = __esm({
  "src/lib/db/seed.ts"() {
    SEED_PLANS = [
      {
        id: "plan_free",
        key: "free",
        name: "Free",
        priceMonthlyCents: 0,
        priceAnnualMonthlyCents: 0,
        limits: {
          maxRecords: 500,
          maxActiveSyncs: 2,
          minIntervalMinutes: 60,
          premiumConnectors: false,
          teamSeats: 1,
          logRetentionDays: 7,
          realtime: false
        },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
      },
      {
        id: "plan_starter",
        key: "starter",
        name: "Starter",
        priceMonthlyCents: 1900,
        priceAnnualMonthlyCents: 1500,
        limits: {
          maxRecords: 5e3,
          maxActiveSyncs: 5,
          minIntervalMinutes: 15,
          premiumConnectors: true,
          teamSeats: 2,
          logRetentionDays: 30,
          realtime: false
        },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
      },
      {
        id: "plan_pro",
        key: "pro",
        name: "Pro",
        priceMonthlyCents: 4900,
        priceAnnualMonthlyCents: 3900,
        limits: {
          maxRecords: 25e3,
          maxActiveSyncs: 20,
          minIntervalMinutes: 5,
          premiumConnectors: true,
          teamSeats: 5,
          logRetentionDays: 90,
          realtime: true
        },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
      },
      {
        id: "plan_business",
        key: "business",
        name: "Business",
        priceMonthlyCents: 12900,
        priceAnnualMonthlyCents: 9900,
        limits: {
          maxRecords: 1e5,
          maxActiveSyncs: 75,
          minIntervalMinutes: 1,
          premiumConnectors: true,
          teamSeats: 15,
          logRetentionDays: 180,
          realtime: true
        },
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z"
      }
    ];
    SEED_WORKSPACES = [
      {
        id: "ws_acme_agency",
        name: "Acme Growth Agency",
        slug: "acme-growth-agency",
        ownerId: "usr_owner_01",
        planId: "plan_pro",
        trialEndsAt: new Date(Date.now() + 11 * 86400 * 1e3).toISOString(),
        // 11 days remaining
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-01T00:00:00Z"
      },
      {
        id: "ws_solo_studio",
        name: "Solo Studio Works",
        slug: "solo-studio",
        ownerId: "usr_owner_01",
        planId: "plan_starter",
        trialEndsAt: new Date(Date.now() - 5 * 86400 * 1e3).toISOString(),
        createdAt: "2026-09-15T00:00:00Z",
        updatedAt: "2026-09-15T00:00:00Z"
      }
    ];
  }
});

// src/lib/sync-engine/hasher.ts
function normalizeValue(val) {
  if (val === null || val === void 0) {
    return null;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (Array.isArray(val)) {
    return val.map(normalizeValue);
  }
  if (typeof val === "object") {
    const sortedObj = {};
    const keys = Object.keys(val).sort();
    for (const key of keys) {
      const v = val[key];
      if (v !== void 0) {
        sortedObj[key] = normalizeValue(v);
      }
    }
    return sortedObj;
  }
  if (typeof val === "string") {
    return val.trim();
  }
  if (typeof val === "number") {
    return Number.isFinite(val) ? Number(val.toFixed(6)) : val;
  }
  return val;
}
function computeStableHash(obj) {
  const normalized = normalizeValue(obj);
  const jsonStr = JSON.stringify(normalized);
  let h1 = 3735928559 ^ 0;
  let h2 = 1103515245 ^ 0;
  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ h1 >>> 16, 2246822507) ^ Math.imul(h2 ^ h2 >>> 13, 3266489909);
  h2 = Math.imul(h2 ^ h2 >>> 16, 2246822507) ^ Math.imul(h1 ^ h1 >>> 13, 3266489909);
  const hash32 = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash32.toString(16).padStart(12, "0");
}
var init_hasher = __esm({
  "src/lib/sync-engine/hasher.ts"() {
  }
});

// src/lib/sync-engine/transformer.ts
function applyTransformation(value, recordValues, config) {
  if (!config) return value;
  const { type, params = {} } = config;
  switch (type) {
    case "default_value": {
      if (value === null || value === void 0 || value === "") {
        return params.defaultValue !== void 0 ? params.defaultValue : "";
      }
      return value;
    }
    case "trim_whitespace": {
      if (typeof value === "string") {
        return value.trim();
      }
      return value;
    }
    case "lowercase": {
      if (typeof value === "string") {
        return value.toLowerCase();
      }
      return value;
    }
    case "uppercase": {
      if (typeof value === "string") {
        return value.toUpperCase();
      }
      return value;
    }
    case "text_to_number": {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const cleaned = value.replace(/[^0-9.-]/g, "");
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    }
    case "number_to_currency": {
      const num = typeof value === "number" ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ""));
      if (isNaN(num)) return "$0.00";
      const symbol = params.currencySymbol || "$";
      return `${symbol}${num.toFixed(2)}`;
    }
    case "date_format": {
      if (!value) return "";
      const date = new Date(String(value));
      if (isNaN(date.getTime())) return String(value);
      const target = params.toFormat || "YYYY-MM-DD";
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, "0");
      const day = String(date.getUTCDate()).padStart(2, "0");
      if (target === "YYYY-MM-DD") return `${year}-${month}-${day}`;
      if (target === "MM/DD/YYYY") return `${month}/${day}/${year}`;
      if (target === "DD/MM/YYYY") return `${day}/${month}/${year}`;
      if (target === "ISO") return date.toISOString();
      return `${year}-${month}-${day}`;
    }
    case "split_name": {
      const str = String(value || "").trim();
      const parts = str.split(/\s+/);
      if (params.targetPart === "last") {
        return parts.length > 1 ? parts.slice(1).join(" ") : "";
      }
      return parts[0] || "";
    }
    case "combine_fields": {
      const first = String(value || "").trim();
      const secondaryVal = params.secondaryField ? recordValues[params.secondaryField] : "";
      const second = String(secondaryVal || "").trim();
      const sep = params.separator !== void 0 ? params.separator : " ";
      if (!first && !second) return "";
      if (!first) return second;
      if (!second) return first;
      return `${first}${sep}${second}`;
    }
    case "map_select_values": {
      const strVal = String(value || "").trim();
      const map = params.valueMap || {};
      if (strVal in map) {
        return map[strVal];
      }
      const lower = strVal.toLowerCase();
      for (const [k, v] of Object.entries(map)) {
        if (k.toLowerCase() === lower) {
          return v;
        }
      }
      return params.fallbackValue !== void 0 ? params.fallbackValue : strVal;
    }
    default:
      return value;
  }
}
var init_transformer = __esm({
  "src/lib/sync-engine/transformer.ts"() {
  }
});

// src/lib/sync-engine/filter.ts
function evaluateCondition(recordValues, condition) {
  const rawValue = recordValues[condition.field];
  const strVal = rawValue !== null && rawValue !== void 0 ? String(rawValue).trim() : "";
  const targetStr = String(condition.value).trim();
  switch (condition.operator) {
    case "equals":
      return strVal.toLowerCase() === targetStr.toLowerCase();
    case "not_equals":
      return strVal.toLowerCase() !== targetStr.toLowerCase();
    case "contains":
      return strVal.toLowerCase().includes(targetStr.toLowerCase());
    case "not_contains":
      return !strVal.toLowerCase().includes(targetStr.toLowerCase());
    case "is_empty":
      return rawValue === null || rawValue === void 0 || strVal === "";
    case "is_not_empty":
      return rawValue !== null && rawValue !== void 0 && strVal !== "";
    case "greater_than": {
      const numA = typeof rawValue === "number" ? rawValue : parseFloat(strVal);
      const numB = typeof condition.value === "number" ? condition.value : parseFloat(targetStr);
      if (isNaN(numA) || isNaN(numB)) return false;
      return numA > numB;
    }
    case "less_than": {
      const numA = typeof rawValue === "number" ? rawValue : parseFloat(strVal);
      const numB = typeof condition.value === "number" ? condition.value : parseFloat(targetStr);
      if (isNaN(numA) || isNaN(numB)) return false;
      return numA < numB;
    }
    default:
      return true;
  }
}
function evaluateFilterGroup(recordValues, group) {
  if (!group || !group.conditions || group.conditions.length === 0) {
    return true;
  }
  if (group.logic === "AND") {
    return group.conditions.every((c) => evaluateCondition(recordValues, c));
  } else {
    return group.conditions.some((c) => evaluateCondition(recordValues, c));
  }
}
var init_filter = __esm({
  "src/lib/sync-engine/filter.ts"() {
  }
});

// src/lib/sync-engine/engine.ts
function transformRecordValues(sourceValues, mappings, direction) {
  const transformed = {};
  const warnings = [];
  for (const mapping of mappings) {
    const srcKey = direction === "a_to_b" ? mapping.sourceFieldKey : mapping.destinationFieldKey;
    const dstKey = direction === "a_to_b" ? mapping.destinationFieldKey : mapping.sourceFieldKey;
    let val = sourceValues[srcKey];
    if (mapping.transform) {
      val = applyTransformation(val, sourceValues, mapping.transform);
    }
    if ((val === null || val === void 0 || val === "") && mapping.defaultValue !== void 0) {
      val = mapping.defaultValue;
    }
    if (mapping.required && (val === null || val === void 0 || val === "")) {
      warnings.push(`Missing required field '${dstKey}' mapped from '${srcKey}'`);
    }
    transformed[dstKey] = val;
  }
  return { values: transformed, warnings };
}
function executeSyncRun(ctx) {
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
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const keyMapping = mappings.find((m) => m.isKey) || mappings[0];
  const linksByA = /* @__PURE__ */ new Map();
  const linksByB = /* @__PURE__ */ new Map();
  const allRecordLinks = recordLinks.map((l) => ({ ...l }));
  for (const link of allRecordLinks) {
    linksByA.set(link.aExternalId, link);
    linksByB.set(link.bExternalId, link);
  }
  const destById = /* @__PURE__ */ new Map();
  const destByKey = /* @__PURE__ */ new Map();
  for (const r of destinationRecords) {
    destById.set(r.externalId, r);
    if (keyMapping) {
      const keyVal = String(r.values[keyMapping.destinationFieldKey] || "").toLowerCase().trim();
      if (keyVal) destByKey.set(keyVal, r);
    }
  }
  const srcById = /* @__PURE__ */ new Map();
  const srcByKey = /* @__PURE__ */ new Map();
  for (const r of sourceRecords) {
    srcById.set(r.externalId, r);
    if (keyMapping) {
      const keyVal = String(r.values[keyMapping.sourceFieldKey] || "").toLowerCase().trim();
      if (keyVal) srcByKey.set(keyVal, r);
    }
  }
  const events = [];
  const errors = [];
  const newConflicts = [];
  const writesA = [];
  const writesB = [];
  const diffs = [];
  const generalWarnings = [];
  let createdCount = 0;
  let updatedCount = 0;
  let deletedCount = 0;
  let skippedCount = 0;
  let conflictCount = 0;
  let failedCount = 0;
  let hitRecordLimit = false;
  let projectedLinkedCount = currentLinkedRecordsCount;
  if (config.direction === "a_to_b" || config.direction === "two_way") {
    for (const srcRec of sourceRecords) {
      if (config.filters && !evaluateFilterGroup(srcRec.values, config.filters)) {
        skippedCount++;
        continue;
      }
      const currentSrcHash = computeStableHash(srcRec.values);
      let link = linksByA.get(srcRec.externalId);
      let matchedDestRec;
      if (!link && keyMapping) {
        const keyVal = String(srcRec.values[keyMapping.sourceFieldKey] || "").toLowerCase().trim();
        if (keyVal && destByKey.has(keyVal)) {
          matchedDestRec = destByKey.get(keyVal);
          if (matchedDestRec && linksByB.has(matchedDestRec.externalId)) {
            matchedDestRec = void 0;
          }
        }
      }
      const { values: transformedForB, warnings } = transformRecordValues(srcRec.values, mappings, "a_to_b");
      if (warnings.length > 0) {
        generalWarnings.push(...warnings);
      }
      const transformedHashB = computeStableHash(transformedForB);
      if (!link && !matchedDestRec) {
        if (projectedLinkedCount >= planLimits.maxRecords) {
          hitRecordLimit = true;
          skippedCount++;
          errors.push({
            id: `err-limit-${srcRec.externalId}`,
            syncRunId: runId,
            category: "validation",
            code: "PLAN_RECORD_LIMIT_EXCEEDED",
            userMessage: `Plan limit reached (${planLimits.maxRecords} records). Remaining new records skipped.`,
            fixHint: "Upgrade to a higher plan to sync unlimited records.",
            isResolved: false,
            createdAt: now
          });
          continue;
        }
        const newLinkId = `link-${srcRec.externalId}-b-${Date.now()}`;
        const idempotencyKey = `${config.id}:${runId}:${newLinkId}:create_b`;
        writesB.push({
          action: "create",
          record: {
            externalId: `pending_b_${srcRec.externalId}`,
            values: transformedForB,
            hash: transformedHashB,
            updatedAt: now
          },
          idempotencyKey,
          recordLinkId: newLinkId
        });
        const newLink = {
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
          action: "create",
          side: "B",
          status: "succeeded",
          idempotencyKey,
          before: {},
          after: transformedForB,
          message: `Created record in destination for source #${srcRec.externalId}`,
          timestamp: now
        });
        diffs.push({
          externalId: srcRec.externalId,
          action: "create",
          keyIdentifier: String(srcRec.values[keyMapping?.sourceFieldKey || "id"] || srcRec.externalId),
          before: {},
          after: transformedForB,
          warnings
        });
      } else {
        const activeLink = link || {
          id: `link-${srcRec.externalId}-${matchedDestRec.externalId}`,
          syncConfigId: config.id,
          aExternalId: srcRec.externalId,
          bExternalId: matchedDestRec.externalId,
          lastSyncedHashA: "",
          lastSyncedHashB: computeStableHash(matchedDestRec.values),
          lastSyncedAt: now
        };
        if (!link && matchedDestRec) {
          allRecordLinks.push(activeLink);
          linksByA.set(srcRec.externalId, activeLink);
          linksByB.set(matchedDestRec.externalId, activeLink);
        }
        const destRec = destById.get(activeLink.bExternalId) || matchedDestRec;
        const currentDestHash = destRec ? computeStableHash(destRec.values) : activeLink.lastSyncedHashB;
        const aChanged = currentSrcHash !== activeLink.lastSyncedHashA;
        const bChanged = currentDestHash !== activeLink.lastSyncedHashB;
        if (!aChanged && !bChanged) {
          skippedCount++;
          continue;
        }
        if (config.direction === "two_way" && aChanged && bChanged) {
          conflictCount++;
          if (config.conflictRule === "source_wins") {
            const idempotencyKey = `${config.id}:${runId}:${activeLink.id}:update_b`;
            writesB.push({
              action: "update",
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
          } else if (config.conflictRule === "destination_wins") {
            if (destRec) {
              const { values: transformedForA } = transformRecordValues(destRec.values, mappings, "b_to_a");
              const transformedHashA = computeStableHash(transformedForA);
              const idempotencyKey = `${config.id}:${runId}:${activeLink.id}:update_a`;
              writesA.push({
                action: "update",
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
          } else if (config.conflictRule === "newest_wins") {
            const timeA = srcRec.updatedAt ? new Date(srcRec.updatedAt).getTime() : 0;
            const timeB = destRec?.updatedAt ? new Date(destRec.updatedAt).getTime() : 0;
            if (timeB > timeA && destRec) {
              const { values: transformedForA } = transformRecordValues(destRec.values, mappings, "b_to_a");
              writesA.push({
                action: "update",
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
              writesB.push({
                action: "update",
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
            const conflictItem = {
              id: `conflict-${activeLink.id}-${Date.now()}`,
              syncConfigId: config.id,
              recordLinkId: activeLink.id,
              aValue: srcRec.values,
              bValue: destRec?.values || {},
              status: "open",
              createdAt: now
            };
            newConflicts.push(conflictItem);
            events.push({
              id: `evt-${events.length + 1}`,
              syncRunId: runId,
              recordLinkId: activeLink.id,
              action: "conflict",
              side: "B",
              status: "pending",
              idempotencyKey: `${config.id}:${runId}:${activeLink.id}:conflict`,
              before: destRec?.values || {},
              after: transformedForB,
              message: `Conflicting changes on both sides. Sent to Review Queue.`,
              timestamp: now
            });
            continue;
          }
        } else if (aChanged) {
          const idempotencyKey = `${config.id}:${runId}:${activeLink.id}:update_b`;
          writesB.push({
            action: "update",
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
            action: "update",
            side: "B",
            status: "succeeded",
            idempotencyKey,
            before: destRec?.values || {},
            after: transformedForB,
            message: `Updated destination record #${activeLink.bExternalId}`,
            timestamp: now
          });
          diffs.push({
            externalId: activeLink.bExternalId,
            action: "update",
            keyIdentifier: String(srcRec.values[keyMapping?.sourceFieldKey || "id"] || activeLink.bExternalId),
            before: destRec?.values || {},
            after: transformedForB,
            warnings
          });
        } else if (bChanged && config.direction === "two_way") {
          if (destRec) {
            const { values: transformedForA } = transformRecordValues(destRec.values, mappings, "b_to_a");
            const transformedHashA = computeStableHash(transformedForA);
            const idempotencyKey = `${config.id}:${runId}:${activeLink.id}:update_a`;
            writesA.push({
              action: "update",
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
              action: "update",
              side: "A",
              status: "succeeded",
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
  if (config.deleteBehavior !== "ignore") {
    for (const link of allRecordLinks) {
      const srcExists = srcById.has(link.aExternalId);
      if (!srcExists && !link.aDeleted) {
        if (config.deleteBehavior === "hard_delete") {
          deletedCount++;
          writesB.push({
            action: "delete",
            record: { externalId: link.bExternalId, values: {}, hash: "" },
            idempotencyKey: `${config.id}:${runId}:${link.id}:delete_b`,
            recordLinkId: link.id
          });
          link.bDeleted = true;
          link.aDeleted = true;
        } else if (config.deleteBehavior === "soft_delete") {
          updatedCount++;
          writesB.push({
            action: "update",
            record: { externalId: link.bExternalId, values: { _status: "archived", is_archived: true }, hash: "" },
            idempotencyKey: `${config.id}:${runId}:${link.id}:soft_delete_b`,
            recordLinkId: link.id
          });
          link.aDeleted = true;
        }
      }
    }
  }
  const recordsRead = sourceRecords.length + (config.direction === "two_way" ? destinationRecords.length : 0);
  let status = "succeeded";
  if (hitRecordLimit) status = "partial";
  if (failedCount > 0 && createdCount === 0 && updatedCount === 0) status = "failed";
  const run = {
    id: runId,
    syncConfigId: config.id,
    trigger: isDryRun ? "dry_run" : "manual",
    status,
    startedAt: now,
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
    dryRunReport: isDryRun ? {
      summary: {
        wouldCreate: createdCount,
        wouldUpdate: updatedCount,
        wouldDelete: deletedCount,
        wouldSkip: skippedCount,
        conflicts: conflictCount,
        warnings: Array.from(new Set(generalWarnings))
      },
      diffs
    } : void 0
  };
}
var init_engine = __esm({
  "src/lib/sync-engine/engine.ts"() {
    init_hasher();
    init_transformer();
    init_filter();
  }
});

// src/lib/security/crypto.ts
var crypto_exports = {};
__export(crypto_exports, {
  createSignedOAuthState: () => createSignedOAuthState,
  decryptSecret: () => decryptSecret,
  encryptSecret: () => encryptSecret,
  verifySignedOAuthState: () => verifySignedOAuthState
});
async function encryptSecret(plaintext, keyVersion = "v1") {
  if (!plaintext) return { encrypted: "", keyVersion };
  try {
    if (typeof process !== "undefined" && process.versions && process.versions.node) {
      const crypto2 = await import("crypto");
      const rawKey = process.env.ENCRYPTION_KEY;
      const hexKey = rawKey && rawKey !== "not-used" && rawKey.length >= 64 ? rawKey : DEFAULT_KEY_HEX;
      const keyBuffer = Buffer.from(hexKey.slice(0, 64), "hex");
      const iv = crypto2.randomBytes(12);
      const cipher = crypto2.createCipheriv("aes-256-gcm", keyBuffer, iv);
      let encrypted = cipher.update(plaintext, "utf8", "hex");
      encrypted += cipher.final("hex");
      const authTag = cipher.getAuthTag().toString("hex");
      const packed2 = `${keyVersion}:${iv.toString("hex")}:${authTag}:${encrypted}`;
      return { encrypted: packed2, keyVersion };
    }
  } catch (_e) {
  }
  const packed = `${keyVersion}:safe_enc:${btoa(unescape(encodeURIComponent(plaintext)))}`;
  return { encrypted: packed, keyVersion };
}
async function decryptSecret(packed) {
  if (!packed) return "";
  const parts = packed.split(":");
  if (parts.length < 3) {
    return packed;
  }
  const [version, ...rest] = parts;
  try {
    if (typeof process !== "undefined" && process.versions && process.versions.node && rest.length === 3) {
      const crypto2 = await import("crypto");
      const [ivHex, authTagHex, cipherHex] = rest;
      const rawKey = process.env.ENCRYPTION_KEY;
      const hexKey = rawKey && rawKey !== "not-used" && rawKey.length >= 64 ? rawKey : DEFAULT_KEY_HEX;
      const keyBuffer = Buffer.from(hexKey.slice(0, 64), "hex");
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto2.createDecipheriv("aes-256-gcm", keyBuffer, iv);
      decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
      let decrypted = decipher.update(cipherHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }
  } catch (_e) {
  }
  if (rest[0] === "safe_enc" && rest[1]) {
    try {
      return decodeURIComponent(escape(atob(rest[1])));
    } catch {
      return "";
    }
  }
  return "";
}
async function createSignedOAuthState(workspaceId, userId) {
  const ts = Date.now();
  const rawKey = typeof process !== "undefined" ? process.env.ENCRYPTION_KEY : void 0;
  const hexKey = rawKey && rawKey !== "not-used" && rawKey.length >= 64 ? rawKey : DEFAULT_KEY_HEX;
  const keyBuffer = Buffer.from(hexKey.slice(0, 64), "hex");
  const data = `${workspaceId}:${userId}:${ts}`;
  const crypto2 = await import("crypto");
  const hmac = crypto2.createHmac("sha256", keyBuffer);
  hmac.update(data);
  const sig = hmac.digest("hex");
  const payload = { workspaceId, userId, ts, sig };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}
async function verifySignedOAuthState(stateString) {
  if (!stateString) {
    return { valid: false, error: "Missing OAuth state" };
  }
  try {
    let jsonStr = "";
    try {
      jsonStr = Buffer.from(stateString, "base64url").toString("utf8");
    } catch (_e) {
      jsonStr = Buffer.from(decodeURIComponent(stateString), "base64").toString("utf8");
    }
    const payload = JSON.parse(jsonStr);
    const { workspaceId, userId, ts, sig } = payload;
    if (!workspaceId || !userId || !ts || !sig) {
      return {
        valid: false,
        workspaceId,
        userId,
        error: `Incomplete OAuth state payload (workspace_id: ${workspaceId || "missing"}, user_id: ${userId || "missing"})`
      };
    }
    if (Date.now() - Number(ts) > 3600 * 1e3) {
      return {
        valid: false,
        workspaceId,
        userId,
        error: `OAuth state expired (workspace_id: ${workspaceId}, user_id: ${userId})`
      };
    }
    const rawKey = typeof process !== "undefined" ? process.env.ENCRYPTION_KEY : void 0;
    const hexKey = rawKey && rawKey !== "not-used" && rawKey.length >= 64 ? rawKey : DEFAULT_KEY_HEX;
    const keyBuffer = Buffer.from(hexKey.slice(0, 64), "hex");
    const crypto2 = await import("crypto");
    const hmac = crypto2.createHmac("sha256", keyBuffer);
    hmac.update(`${workspaceId}:${userId}:${ts}`);
    const expectedSig = hmac.digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expectedSig, "hex");
    if (sigBuf.length !== expBuf.length || !crypto2.timingSafeEqual(sigBuf, expBuf)) {
      return {
        valid: false,
        workspaceId,
        userId,
        error: `Invalid OAuth state signature (workspace_id: ${workspaceId}, user_id: ${userId})`
      };
    }
    return { valid: true, workspaceId, userId };
  } catch (err) {
    return {
      valid: false,
      error: `Failed to decode OAuth state: ${err.message || String(err)}`
    };
  }
}
var DEFAULT_KEY_HEX;
var init_crypto = __esm({
  "src/lib/security/crypto.ts"() {
    DEFAULT_KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  }
});

// src/lib/supabase/server.ts
import { createClient } from "@supabase/supabase-js";
function getServerSupabase() {
  if (!isServerSupabaseConfigured) {
    return null;
  }
  if (!_supabaseAdmin) {
    _supabaseAdmin = createClient(serverSupabaseUrl, serverServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return _supabaseAdmin;
}
var serverSupabaseUrl, serverServiceRoleKey, isServerSupabaseConfigured, _supabaseAdmin;
var init_server = __esm({
  "src/lib/supabase/server.ts"() {
    serverSupabaseUrl = (typeof process !== "undefined" && process.env ? process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL : "") || "https://uloisdecdkbrcxguwmqt.supabase.co";
    serverServiceRoleKey = (typeof process !== "undefined" && process.env ? process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY : "") || "";
    isServerSupabaseConfigured = Boolean(
      serverSupabaseUrl && serverSupabaseUrl.startsWith("https://") && !serverSupabaseUrl.includes("your-project.supabase.co") && serverServiceRoleKey && serverServiceRoleKey.length > 20 && !serverServiceRoleKey.includes("...")
    );
    _supabaseAdmin = null;
  }
});

// src/lib/db/supabase-repo.ts
var supabase_repo_exports = {};
__export(supabase_repo_exports, {
  SupabasePostgresRepo: () => SupabasePostgresRepo,
  supabaseRepo: () => supabaseRepo
});
var SupabasePostgresRepo, supabaseRepo;
var init_supabase_repo = __esm({
  "src/lib/db/supabase-repo.ts"() {
    init_server();
    init_store();
    SupabasePostgresRepo = class {
      constructor() {
        this.client = getServerSupabase();
      }
      // Helper to re-check client
      getClient() {
        if (!this.client) {
          this.client = getServerSupabase();
        }
        return this.client;
      }
      // ---------------------------------------------------------------------------
      // 1. PROFILES
      // ---------------------------------------------------------------------------
      async getProfile(userId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
          if (!error && data) {
            return {
              id: data.id,
              email: data.email,
              name: data.name || "",
              avatarUrl: data.avatar_url,
              themePreference: data.theme_preference,
              createdAt: data.created_at,
              updatedAt: data.updated_at
            };
          }
        }
        return db.users.find((u) => u.id === userId) || null;
      }
      async upsertProfile(user) {
        const client = this.getClient();
        if (client) {
          await client.from("profiles").upsert({
            id: user.id,
            email: user.email,
            name: user.name,
            avatar_url: user.avatarUrl,
            theme_preference: user.themePreference || "system",
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
      // ---------------------------------------------------------------------------
      // 2. WORKSPACES
      // ---------------------------------------------------------------------------
      async getWorkspace(workspaceId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("workspaces").select("*").eq("id", workspaceId).maybeSingle();
          if (!error && data) {
            return {
              id: data.id,
              name: data.name,
              slug: data.slug,
              ownerId: data.owner_id,
              planId: data.plan_id,
              trialEndsAt: data.trial_ends_at,
              deletedAt: data.deleted_at,
              createdAt: data.created_at,
              updatedAt: data.updated_at
            };
          }
        }
        return db.workspaces.find((w) => w.id === workspaceId) || null;
      }
      async getUserWorkspaces(userId) {
        const client = this.getClient();
        if (client) {
          const { data: memberRows, error: memberErr } = await client.from("workspace_members").select("workspace_id").eq("user_id", userId);
          if (!memberErr && memberRows && memberRows.length > 0) {
            const wsIds = memberRows.map((m) => m.workspace_id);
            const { data: wsRows, error: wsErr } = await client.from("workspaces").select("*").in("id", wsIds);
            if (!wsErr && wsRows) {
              return wsRows.map((data) => ({
                id: data.id,
                name: data.name,
                slug: data.slug,
                ownerId: data.owner_id,
                planId: data.plan_id,
                trialEndsAt: data.trial_ends_at,
                deletedAt: data.deleted_at,
                createdAt: data.created_at,
                updatedAt: data.updated_at
              }));
            }
          }
        }
        return db.getUserWorkspaces(userId);
      }
      async createWorkspace(workspace, initialMemberRole = "owner") {
        const client = this.getClient();
        if (client) {
          const now = (/* @__PURE__ */ new Date()).toISOString();
          const slug = workspace.slug || workspace.name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
          const insertPayload = {
            name: workspace.name,
            slug,
            owner_id: workspace.ownerId,
            plan_id: workspace.planId || "plan_pro",
            trial_ends_at: workspace.trialEndsAt || new Date(Date.now() + 14 * 86400 * 1e3).toISOString(),
            created_at: workspace.createdAt || now,
            updated_at: workspace.updatedAt || now
          };
          if (workspace.id && !workspace.id.startsWith("ws_")) {
            insertPayload.id = workspace.id;
          }
          const { data: createdWs, error: wsErr } = await client.from("workspaces").insert(insertPayload).select("*").single();
          if (wsErr || !createdWs) {
            throw new Error(`Failed to create workspace in database: ${wsErr?.message || "unknown"}`);
          }
          const wsId = createdWs.id;
          await client.from("workspace_members").insert({
            workspace_id: wsId,
            user_id: workspace.ownerId,
            role: initialMemberRole,
            created_at: now,
            updated_at: now
          });
          try {
            await client.from("subscriptions").insert({
              workspace_id: wsId,
              plan_id: workspace.planId || "plan_pro",
              status: "trialing",
              trial_ends_at: createdWs.trial_ends_at,
              current_period_end: createdWs.trial_ends_at,
              cancel_at_period_end: false,
              created_at: now,
              updated_at: now
            });
          } catch (_e) {
          }
          try {
            await client.from("usage_counters").insert({
              workspace_id: wsId,
              period_start: now,
              period_end: new Date(Date.now() + 30 * 86400 * 1e3).toISOString(),
              records_synced: 0,
              runs_count: 0,
              active_syncs_peak: 0,
              created_at: now,
              updated_at: now
            });
          } catch (_e) {
          }
          return {
            id: createdWs.id,
            name: createdWs.name,
            slug: createdWs.slug,
            ownerId: createdWs.owner_id,
            planId: createdWs.plan_id,
            trialEndsAt: createdWs.trial_ends_at,
            deletedAt: createdWs.deleted_at,
            createdAt: createdWs.created_at,
            updatedAt: createdWs.updated_at
          };
        }
        return db.createWorkspace(workspace.name);
      }
      // ---------------------------------------------------------------------------
      // 3. WORKSPACE MEMBERS
      // ---------------------------------------------------------------------------
      async getWorkspaceMembers(workspaceId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("workspace_members").select("*").eq("workspace_id", workspaceId);
          if (!error && data) {
            return data.map((m) => ({
              id: m.id,
              workspaceId: m.workspace_id,
              userId: m.user_id,
              role: m.role,
              invitedBy: m.invited_by,
              createdAt: m.created_at,
              updatedAt: m.updated_at
            }));
          }
        }
        return db.members.filter((m) => m.workspaceId === workspaceId);
      }
      async verifyWorkspaceMembership(userId, workspaceId) {
        const client = this.getClient();
        if (!client) {
          const mem = db.members.find((m) => m.workspaceId === workspaceId && m.userId === userId);
          return mem ? { isMember: true, role: mem.role } : { isMember: false };
        }
        const { data, error } = await client.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
        if (!error && data) {
          return { isMember: true, role: data.role };
        }
        return { isMember: false };
      }
      async ensureUserWorkspace(userId, email, name) {
        const client = this.getClient();
        if (!client) {
          const userWorkspaces = db.getUserWorkspaces(userId);
          if (userWorkspaces.length > 0) {
            return { workspace: userWorkspaces[0], role: db.getCurrentRole() };
          }
          const created = db.createWorkspace(name ? `${name}'s Workspace` : "Workspace");
          return { workspace: created, role: "owner" };
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        if (email) {
          try {
            await client.from("profiles").upsert(
              {
                id: userId,
                email,
                name: name || email.split("@")[0],
                theme_preference: "system",
                updated_at: now
              },
              { onConflict: "id" }
            );
          } catch (e) {
            console.warn("[ensureUserWorkspace:profile_upsert]", e.message);
          }
        }
        const { data: memberRows, error: memberErr } = await client.from("workspace_members").select("workspace_id, role, created_at").eq("user_id", userId).order("created_at", { ascending: true });
        if (!memberErr && memberRows && memberRows.length > 0) {
          for (const mRow of memberRows) {
            const { data: wsData } = await client.from("workspaces").select("*").eq("id", mRow.workspace_id).maybeSingle();
            if (wsData) {
              return {
                workspace: {
                  id: wsData.id,
                  name: wsData.name,
                  slug: wsData.slug,
                  ownerId: wsData.owner_id,
                  planId: wsData.plan_id,
                  trialEndsAt: wsData.trial_ends_at,
                  deletedAt: wsData.deleted_at,
                  createdAt: wsData.created_at,
                  updatedAt: wsData.updated_at
                },
                role: mRow.role || "owner"
              };
            }
          }
        }
        const cleanName = name || (email ? email.split("@")[0] : "User");
        const wsName = `${cleanName}'s Workspace`;
        const slug = wsName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
        const { data: insertedWs, error: insertWsErr } = await client.from("workspaces").insert({
          name: wsName,
          slug,
          owner_id: userId,
          plan_id: "plan_pro",
          trial_ends_at: new Date(Date.now() + 14 * 86400 * 1e3).toISOString(),
          created_at: now,
          updated_at: now
        }).select("*").single();
        if (insertWsErr || !insertedWs) {
          throw new Error(`Failed to create initial workspace: ${insertWsErr?.message || "unknown error"}`);
        }
        await client.from("workspace_members").insert({
          workspace_id: insertedWs.id,
          user_id: userId,
          role: "owner",
          created_at: now,
          updated_at: now
        });
        try {
          await client.from("subscriptions").insert({
            workspace_id: insertedWs.id,
            plan_id: "plan_pro",
            status: "trialing",
            created_at: now,
            updated_at: now
          });
        } catch (_e) {
        }
        try {
          await client.from("usage_counters").insert({
            workspace_id: insertedWs.id,
            period_start: now,
            period_end: new Date(Date.now() + 30 * 86400 * 1e3).toISOString(),
            records_synced: 0,
            runs_count: 0,
            active_syncs_peak: 0,
            created_at: now,
            updated_at: now
          });
        } catch (_e) {
        }
        return {
          workspace: {
            id: insertedWs.id,
            name: insertedWs.name,
            slug: insertedWs.slug,
            ownerId: insertedWs.owner_id,
            planId: insertedWs.plan_id,
            trialEndsAt: insertedWs.trial_ends_at,
            deletedAt: insertedWs.deleted_at,
            createdAt: insertedWs.created_at,
            updatedAt: insertedWs.updated_at
          },
          role: "owner"
        };
      }
      // ---------------------------------------------------------------------------
      // 4. INVITATIONS
      // ---------------------------------------------------------------------------
      async getInvitations(workspaceId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("invitations").select("*").eq("workspace_id", workspaceId).eq("status", "pending");
          if (!error && data) {
            return data.map((i) => ({
              id: i.id,
              workspaceId: i.workspace_id,
              email: i.email,
              role: i.role,
              invitedBy: i.invited_by,
              status: i.status,
              createdAt: i.created_at,
              updatedAt: i.updated_at
            }));
          }
        }
        return db.getWorkspaceInvitations(workspaceId);
      }
      async createInvitation(invite) {
        const client = this.getClient();
        if (client) {
          await client.from("invitations").insert({
            id: invite.id,
            workspace_id: invite.workspaceId,
            email: invite.email,
            role: invite.role,
            invited_by: invite.invitedBy,
            status: invite.status,
            created_at: invite.createdAt,
            updated_at: invite.updatedAt || invite.createdAt
          });
        }
      }
      async revokeInvitation(inviteId) {
        const client = this.getClient();
        if (client) {
          await client.from("invitations").update({ status: "revoked", updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", inviteId);
        }
      }
      // ---------------------------------------------------------------------------
      // 5. CONNECTED ACCOUNTS
      // ---------------------------------------------------------------------------
      async getConnectedAccounts(workspaceId, userId) {
        console.log(`[Connection:LOAD] user_id: ${userId || "verified_session"}, workspace_id: ${workspaceId}`);
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("connected_accounts").select("*").eq("workspace_id", workspaceId);
          if (error) {
            console.error("[Supabase:connected_accounts:SELECT_FAIL]", {
              workspace_id: workspaceId,
              error_code: error.code,
              error_message: error.message
            });
            throw new Error(`Database query on connected_accounts failed: ${error.message} (code: ${error.code})`);
          }
          if (data) {
            console.log("[Supabase:connected_accounts:SELECT_SUCCESS]", {
              workspace_id: workspaceId,
              user_id: userId || "verified_session",
              row_count: data.length,
              rows: data.map((a) => ({
                id: a.id,
                workspace_id: a.workspace_id,
                connector_key: a.connector_key,
                display_name: a.display_name,
                external_account_id: a.external_account_id,
                status: a.status,
                scopes: a.scopes,
                created_at: a.created_at
              }))
            });
            return data.map((a) => ({
              id: a.id,
              workspaceId: a.workspace_id,
              connectorKey: a.connector_key,
              displayName: a.display_name,
              externalAccountId: a.external_account_id,
              encryptedAccessToken: a.encrypted_access_token,
              encryptedRefreshToken: a.encrypted_refresh_token,
              keyVersion: a.key_version,
              scopes: a.scopes || [],
              expiresAt: a.expires_at || void 0,
              status: a.status,
              createdBy: a.created_by,
              createdAt: a.created_at,
              updatedAt: a.updated_at
            }));
          }
        }
        throw new Error("Supabase client is not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY).");
      }
      async saveConnectedAccount(account) {
        console.log(`[Connection:SAVE] user_id: ${account.createdBy || "verified_session"}, workspace_id: ${account.workspaceId}`);
        const client = this.getClient();
        if (!client) {
          throw new Error("Supabase client is not configured on server (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing).");
        }
        const isUuid = account.createdBy && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account.createdBy);
        const rowPayload = {
          id: account.id,
          workspace_id: account.workspaceId,
          connector_key: account.connectorKey,
          display_name: account.displayName,
          external_account_id: account.externalAccountId || null,
          encrypted_access_token: account.encryptedAccessToken,
          encrypted_refresh_token: account.encryptedRefreshToken || null,
          key_version: account.keyVersion || "v1",
          scopes: account.scopes || [],
          expires_at: account.expiresAt || null,
          status: account.status || "active",
          created_by: isUuid ? account.createdBy : null,
          created_at: account.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        const { data, error } = await client.from("connected_accounts").upsert(rowPayload).select("*").single();
        if (error) {
          console.error("[Supabase:connected_accounts:INSERT_FAIL]", {
            workspace_id: rowPayload.workspace_id,
            connector_key: rowPayload.connector_key,
            display_name: rowPayload.display_name,
            error_code: error.code,
            error_message: error.message,
            error_details: error.details,
            error_hint: error.hint
          });
          throw new Error(`Database insert into connected_accounts failed: ${error.message}${error.hint ? ` (${error.hint})` : ""} (code: ${error.code})`);
        }
        console.log("[Supabase:connected_accounts:INSERT_SUCCESS]", {
          id: data.id,
          workspace_id: data.workspace_id,
          connector_key: data.connector_key,
          display_name: data.display_name,
          external_account_id: data.external_account_id,
          status: data.status,
          scopes: data.scopes,
          created_at: data.created_at,
          updated_at: data.updated_at
        });
        return {
          id: data.id,
          workspaceId: data.workspace_id,
          connectorKey: data.connector_key,
          displayName: data.display_name,
          externalAccountId: data.external_account_id,
          encryptedAccessToken: data.encrypted_access_token,
          encryptedRefreshToken: data.encrypted_refresh_token,
          keyVersion: data.key_version,
          scopes: data.scopes || [],
          status: data.status,
          createdBy: data.created_by,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      }
      async deleteConnectedAccount(accountId, workspaceId) {
        const client = this.getClient();
        if (client) {
          const { error } = await client.from("connected_accounts").delete().eq("id", accountId).eq("workspace_id", workspaceId);
          if (error) {
            console.error("[Supabase:connected_accounts:DELETE_FAIL]", {
              id: accountId,
              workspace_id: workspaceId,
              error_code: error.code,
              error_message: error.message
            });
            throw new Error(`Database delete on connected_accounts failed: ${error.message} (code: ${error.code})`);
          }
          console.log("[Supabase:connected_accounts:DELETE_SUCCESS]", {
            id: accountId,
            workspace_id: workspaceId
          });
        }
      }
      // ---------------------------------------------------------------------------
      // 6. CSV DATASETS
      // ---------------------------------------------------------------------------
      async getCsvDatasets(workspaceId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("csv_datasets").select("*").eq("workspace_id", workspaceId);
          if (!error && data) {
            return data.map((d) => ({
              id: d.id,
              workspaceId: d.workspace_id,
              name: d.name,
              filename: d.filename,
              fileSize: Number(d.file_size || 0),
              rowCount: Number(d.row_count || 0),
              columns: d.columns || [],
              records: d.records || [],
              uploadedBy: d.uploaded_by,
              createdAt: d.created_at,
              updatedAt: d.updated_at
            }));
          }
        }
        return db.getCsvDatasets(workspaceId);
      }
      async getCsvDatasetById(datasetId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("csv_datasets").select("*").eq("id", datasetId).maybeSingle();
          if (!error && data) {
            return {
              id: data.id,
              workspaceId: data.workspace_id,
              name: data.name,
              filename: data.filename,
              fileSize: Number(data.file_size || 0),
              rowCount: Number(data.row_count || 0),
              columns: data.columns || [],
              records: data.records || [],
              uploadedBy: data.uploaded_by,
              createdAt: data.created_at,
              updatedAt: data.updated_at
            };
          }
        }
        return db.getCsvDatasetById(datasetId) || null;
      }
      async saveCsvDataset(dataset) {
        const client = this.getClient();
        if (client) {
          await client.from("csv_datasets").upsert({
            id: dataset.id,
            workspace_id: dataset.workspaceId,
            name: dataset.name,
            filename: dataset.filename,
            file_size: dataset.fileSize,
            row_count: dataset.rowCount,
            columns: dataset.columns,
            records: dataset.records,
            uploaded_by: dataset.uploadedBy,
            created_at: dataset.createdAt,
            updated_at: dataset.updatedAt
          });
        }
      }
      async deleteCsvDataset(datasetId, workspaceId) {
        const client = this.getClient();
        if (client) {
          await client.from("csv_datasets").delete().eq("id", datasetId).eq("workspace_id", workspaceId);
        }
      }
      // ---------------------------------------------------------------------------
      // 7. SYNC CONFIGURATIONS & 8. FIELD MAPPINGS
      // ---------------------------------------------------------------------------
      async getSyncConfigurations(workspaceId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("sync_configurations").select("*").eq("workspace_id", workspaceId);
          if (!error && data) {
            return data.map((s) => ({
              id: s.id,
              workspaceId: s.workspace_id,
              name: s.name,
              endpointAId: s.source_dataset_id ? `ep_csv_${s.source_dataset_id}` : "ep_a",
              endpointBId: s.destination_resource_id || "ep_b",
              direction: s.direction,
              conflictRule: s.conflict_rule,
              triggerMode: s.trigger_mode,
              intervalMinutes: s.interval_minutes,
              deleteBehavior: s.delete_behavior,
              filters: s.filters,
              status: s.status,
              lastRunAt: s.last_run_at,
              nextRunAt: s.next_run_at,
              createdBy: s.created_by,
              createdAt: s.created_at,
              updatedAt: s.updated_at
            }));
          }
        }
        return db.getSyncConfigs().filter((s) => s.workspaceId === workspaceId);
      }
      async getSyncConfigurationById(syncId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("sync_configurations").select("*").eq("id", syncId).maybeSingle();
          if (!error && data) {
            return {
              id: data.id,
              workspaceId: data.workspace_id,
              name: data.name,
              endpointAId: data.source_dataset_id ? `ep_csv_${data.source_dataset_id}` : "ep_a",
              endpointBId: data.destination_resource_id || "ep_b",
              direction: data.direction,
              conflictRule: data.conflict_rule,
              triggerMode: data.trigger_mode,
              intervalMinutes: data.interval_minutes,
              deleteBehavior: data.delete_behavior,
              filters: data.filters,
              status: data.status,
              lastRunAt: data.last_run_at,
              nextRunAt: data.next_run_at,
              createdBy: data.created_by,
              createdAt: data.created_at,
              updatedAt: data.updated_at
            };
          }
        }
        return db.getSyncConfigById(syncId) || null;
      }
      async saveSyncConfiguration(sync, mappings = [], extra) {
        const client = this.getClient();
        if (client) {
          await client.from("sync_configurations").upsert({
            id: sync.id,
            workspace_id: sync.workspaceId,
            name: sync.name,
            source_type: "csv",
            source_dataset_id: extra?.sourceDatasetId,
            destination_type: "google_sheets",
            destination_account_id: extra?.destAccountId,
            destination_resource_id: extra?.destResourceId,
            destination_resource_name: extra?.destResourceName,
            direction: sync.direction,
            conflict_rule: sync.conflictRule,
            trigger_mode: sync.triggerMode,
            interval_minutes: sync.intervalMinutes,
            delete_behavior: sync.deleteBehavior,
            filters: sync.filters || {},
            status: sync.status,
            last_run_at: sync.lastRunAt,
            next_run_at: sync.nextRunAt,
            created_by: sync.createdBy,
            created_at: sync.createdAt,
            updated_at: sync.updatedAt
          });
          if (mappings.length > 0) {
            const mappingInserts = mappings.map((m) => ({
              id: m.id,
              sync_configuration_id: sync.id,
              workspace_id: sync.workspaceId,
              source_field_key: m.sourceFieldKey,
              destination_field_key: m.destinationFieldKey,
              transform: m.transform || {},
              default_value: m.defaultValue,
              is_key: m.isKey,
              required: m.required,
              created_at: m.createdAt,
              updated_at: m.updatedAt
            }));
            await client.from("field_mappings").upsert(mappingInserts);
          }
        }
      }
      async getFieldMappings(syncConfigId, workspaceId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("field_mappings").select("*").eq("sync_configuration_id", syncConfigId);
          if (!error && data) {
            return data.map((m) => ({
              id: m.id,
              syncConfigId: m.sync_configuration_id,
              sourceFieldKey: m.source_field_key,
              destinationFieldKey: m.destination_field_key,
              transform: m.transform,
              defaultValue: m.default_value,
              isKey: m.is_key,
              required: m.required,
              createdAt: m.created_at,
              updatedAt: m.updated_at
            }));
          }
        }
        return db.getFieldMappings(syncConfigId);
      }
      // ---------------------------------------------------------------------------
      // 9. RECORD LINKS
      // ---------------------------------------------------------------------------
      async getRecordLinks(syncConfigId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("record_links").select("*").eq("sync_configuration_id", syncConfigId);
          if (!error && data) {
            return data.map((l) => ({
              id: l.id,
              syncConfigId: l.sync_configuration_id,
              aExternalId: l.source_external_id,
              bExternalId: l.destination_external_id,
              lastSyncedHashA: l.last_synced_hash,
              lastSyncedHashB: l.last_synced_hash,
              lastSyncedAt: l.last_synced_at,
              aDeleted: l.source_deleted,
              bDeleted: l.destination_deleted,
              createdAt: l.created_at,
              updatedAt: l.updated_at
            }));
          }
        }
        return db.recordLinks.filter((l) => l.syncConfigId === syncConfigId);
      }
      async upsertRecordLink(link, workspaceId) {
        const client = this.getClient();
        if (client) {
          await client.from("record_links").upsert({
            id: link.id,
            sync_configuration_id: link.syncConfigId,
            workspace_id: workspaceId,
            source_external_id: link.aExternalId,
            destination_external_id: link.bExternalId,
            last_synced_hash: link.lastSyncedHashA || link.lastSyncedHashB || "",
            last_synced_at: link.lastSyncedAt,
            source_deleted: link.aDeleted || false,
            destination_deleted: link.bDeleted || false,
            created_at: link.createdAt,
            updated_at: link.updatedAt
          });
        }
      }
      // ---------------------------------------------------------------------------
      // 10. SYNC RUNS, 11. SYNC EVENTS, 12. SYNC ERRORS
      // ---------------------------------------------------------------------------
      async getSyncRuns(syncConfigId, workspaceId) {
        const client = this.getClient();
        if (client) {
          let query = client.from("sync_runs").select("*").order("started_at", { ascending: false });
          if (syncConfigId) query = query.eq("sync_configuration_id", syncConfigId);
          if (workspaceId) query = query.eq("workspace_id", workspaceId);
          const { data, error } = await query;
          if (!error && data) {
            return data.map((r) => ({
              id: r.id,
              syncConfigId: r.sync_configuration_id,
              trigger: r.trigger,
              status: r.status,
              startedAt: r.started_at,
              finishedAt: r.finished_at,
              recordsRead: Number(r.records_read || 0),
              created: Number(r.created || 0),
              updated: Number(r.updated || 0),
              deleted: Number(r.deleted || 0),
              skipped: Number(r.skipped || 0),
              conflicts: Number(r.conflicts || 0),
              failed: Number(r.failed || 0),
              isDryRun: Boolean(r.is_dry_run),
              createdAt: r.created_at,
              updatedAt: r.updated_at
            }));
          }
        }
        return db.getSyncRuns(syncConfigId);
      }
      async getSyncRunById(runId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("sync_runs").select("*").eq("id", runId).maybeSingle();
          if (!error && data) {
            return {
              id: data.id,
              syncConfigId: data.sync_configuration_id,
              trigger: data.trigger,
              status: data.status,
              startedAt: data.started_at,
              finishedAt: data.finished_at,
              recordsRead: Number(data.records_read || 0),
              created: Number(data.created || 0),
              updated: Number(data.updated || 0),
              deleted: Number(data.deleted || 0),
              skipped: Number(data.skipped || 0),
              conflicts: Number(data.conflicts || 0),
              failed: Number(data.failed || 0),
              isDryRun: Boolean(data.is_dry_run),
              createdAt: data.created_at,
              updatedAt: data.updated_at
            };
          }
        }
        return db.runs.find((r) => r.id === runId) || null;
      }
      async upsertSyncRun(run, workspaceId) {
        const client = this.getClient();
        if (client) {
          await client.from("sync_runs").upsert({
            id: run.id,
            sync_configuration_id: run.syncConfigId,
            workspace_id: workspaceId,
            trigger: run.trigger,
            status: run.status,
            started_at: run.startedAt,
            finished_at: run.finishedAt,
            records_read: run.recordsRead,
            created: run.created,
            updated: run.updated,
            deleted: run.deleted,
            skipped: run.skipped,
            conflicts: run.conflicts,
            failed: run.failed,
            is_dry_run: run.isDryRun,
            created_at: run.createdAt,
            updated_at: run.updatedAt
          });
        }
      }
      async getSyncEvents(runId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("sync_events").select("*").eq("sync_run_id", runId).order("created_at", { ascending: false });
          if (!error && data) {
            return data.map((e) => ({
              id: e.id,
              syncRunId: e.sync_run_id,
              recordLinkId: e.record_link_id,
              action: e.action,
              side: e.side,
              status: e.status,
              idempotencyKey: e.idempotency_key,
              before: e.before,
              after: e.after,
              message: e.message,
              createdAt: e.created_at
            }));
          }
        }
        return db.getSyncEvents(runId);
      }
      async createSyncEvent(event, syncConfigId, workspaceId) {
        const client = this.getClient();
        if (client) {
          await client.from("sync_events").insert({
            id: event.id,
            sync_run_id: event.syncRunId,
            sync_configuration_id: syncConfigId,
            workspace_id: workspaceId,
            record_link_id: event.recordLinkId,
            action: event.action,
            side: event.side,
            status: event.status,
            idempotency_key: event.idempotencyKey,
            before: event.before,
            after: event.after,
            message: event.message,
            created_at: event.createdAt
          });
        }
      }
      async getSyncErrors(workspaceId) {
        const client = this.getClient();
        if (client) {
          let query = client.from("sync_errors").select("*").order("created_at", { ascending: false });
          if (workspaceId) query = query.eq("workspace_id", workspaceId);
          const { data, error } = await query;
          if (!error && data) {
            return data.map((err) => ({
              id: err.id,
              syncRunId: err.sync_run_id,
              syncEventId: err.sync_event_id,
              category: err.category,
              code: err.code,
              userMessage: err.user_message,
              fixHint: err.fix_hint,
              raw: err.raw,
              isResolved: Boolean(err.is_resolved),
              createdAt: err.created_at,
              updatedAt: err.updated_at
            }));
          }
        }
        return db.errors;
      }
      async createSyncError(errorItem, workspaceId) {
        const client = this.getClient();
        if (client) {
          await client.from("sync_errors").insert({
            id: errorItem.id,
            sync_run_id: errorItem.syncRunId,
            workspace_id: workspaceId,
            sync_event_id: errorItem.syncEventId,
            category: errorItem.category,
            code: errorItem.code,
            user_message: errorItem.userMessage,
            fix_hint: errorItem.fixHint,
            raw: errorItem.raw,
            is_resolved: errorItem.isResolved,
            created_at: errorItem.createdAt,
            updated_at: errorItem.updatedAt
          });
        }
      }
      // ---------------------------------------------------------------------------
      // 13. PLANS
      // ---------------------------------------------------------------------------
      async getPlans() {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("plans").select("*");
          if (!error && data && data.length > 0) {
            return data.map((p) => ({
              id: p.id,
              key: p.key,
              name: p.name,
              priceMonthlyCents: p.price_monthly_cents,
              priceAnnualMonthlyCents: p.price_annual_monthly_cents,
              limits: p.limits,
              createdAt: p.created_at,
              updatedAt: p.updated_at
            }));
          }
        }
        return db.plans;
      }
      // ---------------------------------------------------------------------------
      // 14. SUBSCRIPTIONS & 15. USAGE COUNTERS
      // ---------------------------------------------------------------------------
      async getSubscription(workspaceId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("subscriptions").select("*").eq("workspace_id", workspaceId).maybeSingle();
          if (!error && data) {
            return {
              id: data.id,
              workspaceId: data.workspace_id,
              planKey: data.plan_id.replace("plan_", ""),
              status: data.status,
              trialEnd: data.trial_ends_at,
              currentPeriodEnd: data.current_period_end,
              cancelAtPeriodEnd: data.cancel_at_period_end,
              createdAt: data.created_at,
              updatedAt: data.updated_at
            };
          }
        }
        return null;
      }
      async getUsageCounter(workspaceId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("usage_counters").select("*").eq("workspace_id", workspaceId).maybeSingle();
          if (!error && data) {
            return {
              id: data.id,
              workspaceId: data.workspace_id,
              periodStart: data.period_start,
              periodEnd: data.period_end,
              recordsSynced: Number(data.records_synced || 0),
              runsCount: Number(data.runs_count || 0),
              activeSyncsPeak: Number(data.active_syncs_peak || 0),
              createdAt: data.created_at,
              updatedAt: data.updated_at
            };
          }
        }
        return null;
      }
      async incrementUsageCounter(workspaceId, recordsSyncedDelta, runsDelta = 1) {
        const client = this.getClient();
        if (client) {
          const { data: existing } = await client.from("usage_counters").select("*").eq("workspace_id", workspaceId).maybeSingle();
          const now = (/* @__PURE__ */ new Date()).toISOString();
          if (existing) {
            await client.from("usage_counters").update({
              records_synced: Number(existing.records_synced || 0) + recordsSyncedDelta,
              runs_count: Number(existing.runs_count || 0) + runsDelta,
              updated_at: now
            }).eq("workspace_id", workspaceId);
          } else {
            await client.from("usage_counters").insert({
              id: `use_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              workspace_id: workspaceId,
              period_start: now,
              period_end: new Date(Date.now() + 30 * 86400 * 1e3).toISOString(),
              records_synced: recordsSyncedDelta,
              runs_count: runsDelta,
              active_syncs_peak: 1,
              created_at: now,
              updated_at: now
            });
          }
        }
      }
      // ---------------------------------------------------------------------------
      // 16. AUDIT LOGS
      // ---------------------------------------------------------------------------
      async getAuditLogs(workspaceId) {
        const client = this.getClient();
        if (client) {
          const { data, error } = await client.from("audit_logs").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
          if (!error && data) {
            return data.map((l) => ({
              id: l.id,
              workspaceId: l.workspace_id,
              actorUserId: l.actor_user_id,
              actorEmail: l.actor_email,
              action: l.action,
              targetType: l.target_type,
              targetId: l.target_id,
              metadata: l.metadata,
              ip: l.ip,
              userAgent: l.user_agent,
              createdAt: l.created_at
            }));
          }
        }
        return db.auditLogs.filter((l) => l.workspaceId === workspaceId);
      }
      async createAuditLog(log) {
        const client = this.getClient();
        if (client) {
          await client.from("audit_logs").insert({
            id: log.id,
            workspace_id: log.workspaceId,
            actor_user_id: log.actorUserId,
            actor_email: log.actorEmail,
            action: log.action,
            target_type: log.targetType,
            target_id: log.targetId,
            metadata: log.metadata || {},
            ip: log.ip,
            user_agent: log.userAgent,
            created_at: log.createdAt
          });
        }
      }
    };
    supabaseRepo = new SupabasePostgresRepo();
  }
});

// src/lib/connectors/google-sheets/index.ts
async function fetchWithBackoff(url, options, maxRetries = 3) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, options);
      if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
        attempt++;
        const retryAfterHeader = res.headers.get("Retry-After");
        let delayMs = retryAfterHeader ? parseInt(retryAfterHeader, 10) * 1e3 : 0;
        if (!delayMs || isNaN(delayMs)) {
          delayMs = Math.min(1e4, 1e3 * Math.pow(2, attempt - 1) + Math.random() * 300);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt < maxRetries) {
        attempt++;
        const delayMs = Math.min(1e4, 1e3 * Math.pow(2, attempt - 1) + Math.random() * 300);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Request failed after ${maxRetries} retry attempts to ${url}`);
}
async function getActiveAccessToken(account) {
  let found = db.accounts.find((a) => a.id === account.id || a.connectorKey === "google_sheets" && a.workspaceId === account.workspaceId);
  if (!found) {
    found = account;
  }
  if (!found) {
    throw new GoogleApiError(401, "No Google Sheets account connected in this workspace. Please connect in Connections.", "TOKEN_EXPIRED");
  }
  const rawEncrypted = found.encryptedAccessToken || account.accessToken;
  let token = rawEncrypted ? await decryptSecret(rawEncrypted) : "";
  const isExpired = found.expiresAt ? new Date(found.expiresAt).getTime() < Date.now() + 6e4 : !token;
  if (isExpired && found.encryptedRefreshToken) {
    const refreshToken = await decryptSecret(found.encryptedRefreshToken);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (refreshToken && clientId && clientSecret && clientId !== "not-used" && clientSecret !== "not-used") {
      try {
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token"
          })
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          token = data.access_token;
          const encNew = await encryptSecret(token);
          found.encryptedAccessToken = encNew.encrypted;
          found.expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1e3).toISOString();
          found.status = "active";
          found.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          if (data.refresh_token) {
            const encNewRefresh = await encryptSecret(data.refresh_token);
            found.encryptedRefreshToken = encNewRefresh.encrypted;
          }
          try {
            if (typeof window === "undefined") {
              const { supabaseRepo: supabaseRepo2 } = await Promise.resolve().then(() => (init_supabase_repo(), supabase_repo_exports));
              await supabaseRepo2.saveConnectedAccount(found);
            }
          } catch (dbErr) {
            console.warn("[GoogleOAuth:token_refresh_db_save]", dbErr);
          }
          db.saveToStorage();
        } else {
          const errBody = await refreshRes.json().catch(() => ({}));
          const errMsg = errBody.error_description || errBody.error || "Token expired or revoked";
          found.status = "needs_reconnect";
          try {
            if (typeof window === "undefined") {
              const { supabaseRepo: supabaseRepo2 } = await Promise.resolve().then(() => (init_supabase_repo(), supabase_repo_exports));
              await supabaseRepo2.saveConnectedAccount(found);
            }
          } catch (_e) {
          }
          db.saveToStorage();
          throw new GoogleApiError(refreshRes.status, errMsg, "TOKEN_EXPIRED");
        }
      } catch (err) {
        if (err instanceof GoogleApiError) throw err;
        console.error("[GoogleOAuth:refresh_token_exception]", err);
      }
    }
  }
  if (!token) {
    throw new GoogleApiError(401, "Google Sheets access token missing or could not be decrypted. Reconnect your account.", "TOKEN_EXPIRED");
  }
  return token;
}
var GOOGLE_SHEETS_SCOPES, GoogleApiError, GoogleSheetsConnector;
var init_google_sheets = __esm({
  "src/lib/connectors/google-sheets/index.ts"() {
    init_hasher();
    init_crypto();
    init_store();
    GOOGLE_SHEETS_SCOPES = [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive.readonly",
      "https://www.googleapis.com/auth/userinfo.email"
    ];
    GoogleApiError = class extends Error {
      constructor(status, rawMessage, category) {
        super(`Google API Error (HTTP ${status}): ${rawMessage}`);
        this.name = "GoogleApiError";
        this.status = status;
        this.rawMessage = rawMessage;
        this.category = category;
      }
    };
    GoogleSheetsConnector = {
      id: "google_sheets",
      displayName: "Google Sheets",
      capabilities: {
        read: true,
        write: true,
        delete: false,
        webhooks: false,
        incrementalSync: false,
        schemaDiscovery: true
      },
      auth: {
        type: "oauth2",
        getAuthUrl: ({ redirectUri, state }) => {
          const clientId = process.env.GOOGLE_CLIENT_ID || "";
          const scopes = encodeURIComponent(GOOGLE_SHEETS_SCOPES.join(" "));
          return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
            redirectUri
          )}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent&state=${state}`;
        },
        exchangeCode: async () => {
          throw new Error("Google OAuth token exchange must be completed via /api/auth/google/callback on the server.");
        },
        requiredScopes: GOOGLE_SHEETS_SCOPES
      },
      /**
       * List real spreadsheets and sheets from the user's Google Drive.
       * Uses Drive API files.list with:
       * - q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
       * - pageSize = 100
       * - fields = "files(id,name,modifiedTime)"
       */
      listObjects: async (account) => {
        let token = await getActiveAccessToken(account);
        const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false"
        )}&pageSize=100&fields=${encodeURIComponent("files(id,name,modifiedTime)")}`;
        let driveRes = await fetchWithBackoff(driveUrl, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (driveRes.status === 401 && account.encryptedRefreshToken) {
          try {
            account.expiresAt = (/* @__PURE__ */ new Date(0)).toISOString();
            token = await getActiveAccessToken(account);
            driveRes = await fetchWithBackoff(driveUrl, {
              headers: { Authorization: `Bearer ${token}` }
            });
          } catch (_e) {
          }
        }
        if (!driveRes.ok) {
          const errData = await driveRes.json().catch(() => null);
          const rawMessage = errData?.error?.message || await driveRes.text().catch(() => "Unknown Google error");
          const status = driveRes.status;
          const lower = (rawMessage || "").toLowerCase();
          let category = "GOOGLE_ERROR";
          if (status === 401 || lower.includes("invalid_grant") || lower.includes("expired") || lower.includes("revoked") || lower.includes("unauthenticated")) {
            category = "TOKEN_EXPIRED";
          } else if (status === 403 && (lower.includes("drive api has not been used") || lower.includes("accessnotconfigured") || lower.includes("disabled") || lower.includes("enable it by visiting"))) {
            category = "DRIVE_API_NOT_ENABLED";
          } else if (status === 403 && (lower.includes("insufficient") || lower.includes("scope"))) {
            category = "INSUFFICIENT_SCOPES";
          }
          throw new GoogleApiError(status, rawMessage, category);
        }
        const driveData = await driveRes.json();
        const files = driveData.files || [];
        if (files.length === 0) {
          throw new GoogleApiError(200, "No spreadsheets found in your Google Drive", "NO_SPREADSHEETS_FOUND");
        }
        const objects = [];
        for (const file of files) {
          try {
            const sheetMetaRes = await fetchWithBackoff(
              `https://sheets.googleapis.com/v4/spreadsheets/${file.id}?fields=sheets.properties`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (sheetMetaRes.ok) {
              const sheetMeta = await sheetMetaRes.json();
              const sheets = sheetMeta.sheets || [];
              if (sheets.length > 0) {
                for (const s of sheets) {
                  const tabTitle = s.properties?.title || "Sheet1";
                  objects.push({
                    id: `${file.id}:::${tabTitle}`,
                    name: `${file.name} \u2014 Tab: ${tabTitle}`,
                    type: "spreadsheet"
                  });
                }
                continue;
              }
            }
          } catch (_e) {
          }
          objects.push({
            id: `${file.id}:::Sheet1`,
            name: `${file.name} \u2014 Tab: Sheet1`,
            type: "spreadsheet"
          });
        }
        return objects;
      },
      /**
       * Fetch schema by reading Row 1 header cells of the selected spreadsheet and tab.
       */
      getSchema: async (account, object) => {
        const token = await getActiveAccessToken(account);
        const [spreadsheetId, tabTitle = "Sheet1"] = object.id.split(":::");
        const range = encodeURIComponent(`'${tabTitle}'!1:1`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
        const res = await fetchWithBackoff(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Failed to read headers from Google Sheet (${res.status}): ${errBody}`);
        }
        const data = await res.json();
        const headers = data.values && data.values[0] || [];
        if (headers.length === 0) {
          return {
            objectId: object.id,
            name: object.name,
            fields: []
          };
        }
        return {
          objectId: object.id,
          name: object.name,
          fields: headers.map((h, idx) => {
            const cleanKey = (h || `col_${idx + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, "_");
            return {
              key: cleanKey,
              label: h || `Column ${idx + 1}`,
              type: cleanKey.includes("email") ? "email" : "text",
              required: false,
              readOnly: false
            };
          })
        };
      },
      /**
       * Read rows from Row 2 downwards.
       */
      readRecords: async (account, object, opts) => {
        const token = await getActiveAccessToken(account);
        const [spreadsheetId, tabTitle = "Sheet1"] = object.id.split(":::");
        const range = encodeURIComponent(`'${tabTitle}'!A1:ZZ`);
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
        const res = await fetchWithBackoff(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          return { records: [] };
        }
        const data = await res.json();
        const rows = data.values || [];
        if (rows.length < 2) {
          return { records: [] };
        }
        const headers = rows[0].map((h, i) => (h || `col_${i + 1}`).toLowerCase().replace(/[^a-z0-9_]/g, "_"));
        const records = [];
        for (let rIdx = 1; rIdx < rows.length; rIdx++) {
          const row = rows[rIdx];
          const values = {};
          headers.forEach((h, cIdx) => {
            values[h] = row[cIdx] !== void 0 ? row[cIdx] : "";
          });
          const rowNumber = rIdx + 1;
          records.push({
            externalId: String(rowNumber),
            values,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
            hash: computeStableHash(values)
          });
        }
        const pageSize = opts.pageSize || 100;
        const offset = opts.cursor ? parseInt(opts.cursor, 10) : 0;
        const paged = records.slice(offset, offset + pageSize);
        const nextCursor = offset + pageSize < records.length ? String(offset + pageSize) : void 0;
        return { records: paged, nextCursor };
      },
      /**
       * Append a new row to the destination Google Sheet.
       */
      createRecord: async (account, object, rec) => {
        const token = await getActiveAccessToken(account);
        const [spreadsheetId, tabTitle = "Sheet1"] = object.id.split(":::");
        const headerRange = encodeURIComponent(`'${tabTitle}'!1:1`);
        const headerRes = await fetchWithBackoff(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${headerRange}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        let headers = [];
        if (headerRes.ok) {
          const data = await headerRes.json();
          headers = data.values && data.values[0] || [];
        }
        let rowValues = [];
        if (headers.length > 0) {
          rowValues = headers.map((h) => {
            const key = h.toLowerCase().replace(/[^a-z0-9_]/g, "_");
            return rec.values[key] !== void 0 ? rec.values[key] : rec.values[h] ?? "";
          });
        } else {
          rowValues = Object.values(rec.values);
        }
        const appendRange = encodeURIComponent(`'${tabTitle}'!A:A`);
        const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
        const appendRes = await fetchWithBackoff(appendUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ values: [rowValues] })
        });
        if (!appendRes.ok) {
          const errText = await appendRes.text();
          throw new Error(`Google Sheets append failed (${appendRes.status}): ${errText}`);
        }
        const appendData = await appendRes.json();
        const updatedRange = appendData.updates?.updatedRange || "";
        const matchRow = updatedRange.match(/!A(\d+)/);
        const newRowId = matchRow ? matchRow[1] : `row_${Date.now()}`;
        return {
          success: true,
          externalId: newRowId,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
      },
      /**
       * Update an existing row by row index in the destination Google Sheet.
       */
      updateRecord: async (account, object, externalId, rec) => {
        const token = await getActiveAccessToken(account);
        const [spreadsheetId, tabTitle = "Sheet1"] = object.id.split(":::");
        const rowNumber = parseInt(externalId, 10);
        if (!rowNumber || isNaN(rowNumber)) {
          throw new Error(`Invalid Google Sheets row index for update: '${externalId}'`);
        }
        const headerRange = encodeURIComponent(`'${tabTitle}'!1:1`);
        const headerRes = await fetchWithBackoff(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${headerRange}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        let headers = [];
        if (headerRes.ok) {
          const data = await headerRes.json();
          headers = data.values && data.values[0] || [];
        }
        let rowValues = [];
        const values = rec.values || {};
        if (headers.length > 0) {
          rowValues = headers.map((h) => {
            const key = h.toLowerCase().replace(/[^a-z0-9_]/g, "_");
            return values[key] !== void 0 ? values[key] : values[h] ?? "";
          });
        } else {
          rowValues = Object.values(values);
        }
        const updateRange = encodeURIComponent(`'${tabTitle}'!A${rowNumber}:ZZ${rowNumber}`);
        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${updateRange}?valueInputOption=USER_ENTERED`;
        const updateRes = await fetchWithBackoff(updateUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ values: [rowValues] })
        });
        if (!updateRes.ok) {
          const errText = await updateRes.text();
          throw new Error(`Google Sheets row update failed (${updateRes.status}): ${errText}`);
        }
        return {
          success: true,
          externalId,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
      },
      rateLimitPolicy: {
        requestsPerSecond: 1,
        burst: 5,
        respectRetryAfter: true
      },
      mapError: (err) => {
        const msg = String(err);
        if (msg.includes("429") || msg.includes("Quota exceeded")) {
          return {
            category: "rate_limit",
            code: "GOOGLE_SHEETS_RATE_LIMIT",
            userMessage: "Google Sheets API quota exceeded (HTTP 429). Retried with exponential backoff.",
            fixHint: "The sync engine automatically backs off and retries."
          };
        }
        if (msg.includes("401") || msg.includes("invalid_grant")) {
          return {
            category: "auth",
            code: "GOOGLE_AUTH_EXPIRED",
            userMessage: "Google Sheets authorization expired or revoked.",
            fixHint: "Go to Connections and click Reconnect."
          };
        }
        return {
          category: "unknown",
          code: "GOOGLE_SHEETS_ERROR",
          userMessage: `Google Sheets error: ${msg}`
        };
      }
    };
  }
});

// src/lib/connectors/airtable/index.ts
function getAirtableStore(tableId) {
  if (!airtableStore.has(tableId)) {
    airtableStore.set(tableId, [
      {
        externalId: "recAirtable001",
        values: {
          airtable_id: "recAirtable001",
          full_name: "Sarah Jenkins",
          email_address: "sarah.j@acme-corp.com",
          company: "Acme Corp",
          deal_value: 12500,
          status: "Done"
        },
        updatedAt: "2026-10-18T10:00:00Z",
        hash: computeStableHash({
          airtable_id: "recAirtable001",
          full_name: "Sarah Jenkins",
          email_address: "sarah.j@acme-corp.com",
          company: "Acme Corp",
          deal_value: 12500,
          status: "Done"
        })
      },
      {
        externalId: "recAirtable002",
        values: {
          airtable_id: "recAirtable002",
          full_name: "David Chen",
          email_address: "d.chen@apexsoftware.io",
          company: "Apex Software",
          deal_value: 8400,
          status: "Todo"
        },
        updatedAt: "2026-10-19T14:30:00Z",
        hash: computeStableHash({
          airtable_id: "recAirtable002",
          full_name: "David Chen",
          email_address: "d.chen@apexsoftware.io",
          company: "Apex Software",
          deal_value: 8400,
          status: "Todo"
        })
      }
    ]);
  }
  return airtableStore.get(tableId);
}
var airtableStore, AirtableConnector;
var init_airtable = __esm({
  "src/lib/connectors/airtable/index.ts"() {
    init_hasher();
    airtableStore = /* @__PURE__ */ new Map();
    AirtableConnector = {
      id: "airtable",
      displayName: "Airtable",
      capabilities: {
        read: true,
        write: true,
        delete: true,
        webhooks: true,
        incrementalSync: true,
        schemaDiscovery: true
      },
      auth: {
        type: "oauth2",
        getAuthUrl: ({ redirectUri, state }) => {
          const clientId = process.env.AIRTABLE_CLIENT_ID || "dummy_airtable_client_id";
          const scopes = encodeURIComponent("data.records:read data.records:write schema.bases:read");
          return `https://airtable.com/oauth2/v1/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
            redirectUri
          )}&response_type=code&scope=${scopes}&state=${state}`;
        },
        exchangeCode: async () => ({
          accessToken: "pat_airtable_access_token_demo",
          refreshToken: "airtable_refresh_token_demo",
          expiresAt: new Date(Date.now() + 7200 * 1e3).toISOString(),
          scopes: ["data.records:read", "data.records:write", "schema.bases:read"]
        }),
        refresh: async () => ({
          accessToken: "pat_airtable_access_token_refreshed",
          refreshToken: "airtable_refresh_token_demo",
          expiresAt: new Date(Date.now() + 7200 * 1e3).toISOString(),
          scopes: ["data.records:read", "data.records:write", "schema.bases:read"]
        }),
        requiredScopes: ["data.records:read", "data.records:write", "schema.bases:read"]
      },
      listObjects: async () => [
        {
          id: "tbl_client_crm_master",
          name: "Client CRM Base (Table: Clients)",
          type: "table",
          recordCount: 2
        },
        {
          id: "tbl_deal_flow_tracker",
          name: "Deal Flow Base (Table: Deals)",
          type: "table",
          recordCount: 4
        }
      ],
      getSchema: async (_account, object) => ({
        objectId: object.id,
        name: object.name,
        fields: [
          { key: "airtable_id", label: "Record ID", type: "text", required: true, readOnly: true },
          { key: "full_name", label: "Full Name", type: "text", required: true, readOnly: false },
          { key: "email_address", label: "Email Address", type: "email", required: true, readOnly: false },
          { key: "company", label: "Company", type: "text", required: false, readOnly: false },
          { key: "deal_value", label: "Deal Value", type: "currency", required: false, readOnly: false },
          {
            key: "status",
            label: "Status",
            type: "select",
            required: true,
            readOnly: false,
            options: ["Todo", "Doing", "Done"]
          }
        ]
      }),
      readRecords: async (_account, object, _opts) => {
        const records = getAirtableStore(object.id);
        return { records: JSON.parse(JSON.stringify(records)) };
      },
      createRecord: async (_account, object, rec) => {
        const store = getAirtableStore(object.id);
        const extId = `recAirtable${Date.now().toString().slice(-6)}`;
        const newRec = {
          externalId: extId,
          values: { ...rec.values, airtable_id: extId },
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          hash: computeStableHash({ ...rec.values, airtable_id: extId })
        };
        store.push(newRec);
        return { success: true, externalId: extId, updatedAt: newRec.updatedAt };
      },
      updateRecord: async (_account, object, externalId, rec) => {
        const store = getAirtableStore(object.id);
        const idx = store.findIndex((r) => r.externalId === externalId);
        if (idx >= 0) {
          store[idx].values = { ...store[idx].values, ...rec.values };
          store[idx].updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          store[idx].hash = computeStableHash(store[idx].values);
          return { success: true, externalId, updatedAt: store[idx].updatedAt };
        }
        return { success: true, externalId };
      },
      deleteRecord: async (_account, object, externalId) => {
        const store = getAirtableStore(object.id);
        const idx = store.findIndex((r) => r.externalId === externalId);
        if (idx >= 0) {
          store.splice(idx, 1);
        }
        return { success: true, externalId };
      },
      rateLimitPolicy: {
        requestsPerSecond: 5,
        burst: 5,
        respectRetryAfter: true
      },
      mapError: (err) => {
        const msg = String(err);
        if (msg.includes("INVALID_MULTIPLE_CHOICE_OPTIONS") || msg.includes("select") || msg.includes("choice")) {
          return {
            category: "mapping",
            code: "AIRTABLE_INVALID_SELECT_OPTION",
            userMessage: "Your Airtable field 'Status' only accepts: Todo, Doing, Done. We received 'In progress' on records.",
            fixHint: 'Add a value mapping in Field Mappings to convert "In progress" to "Doing".'
          };
        }
        if (msg.includes("429")) {
          return {
            category: "rate_limit",
            code: "AIRTABLE_RATE_LIMIT",
            userMessage: "Airtable 5 req/sec rate limit reached. Pausing 30s before retry.",
            retryAfterSeconds: 30
          };
        }
        return {
          category: "unknown",
          code: "AIRTABLE_ERROR",
          userMessage: `Airtable error: ${msg}`
        };
      }
    };
  }
});

// src/lib/connectors/notion/index.ts
function getNotionStore(dbId) {
  if (!notionStore.has(dbId)) {
    notionStore.set(dbId, [
      {
        externalId: "notion-page-uuid-001",
        values: {
          notion_page_id: "notion-page-uuid-001",
          name: "Sarah Jenkins",
          email: "sarah.j@acme-corp.com",
          company: "Acme Corp",
          deal_size: 12500,
          stage: "Active"
        },
        updatedAt: "2026-10-18T10:00:00Z",
        hash: computeStableHash({
          notion_page_id: "notion-page-uuid-001",
          name: "Sarah Jenkins",
          email: "sarah.j@acme-corp.com",
          company: "Acme Corp",
          deal_size: 12500,
          stage: "Active"
        })
      },
      {
        externalId: "notion-page-uuid-002",
        values: {
          notion_page_id: "notion-page-uuid-002",
          name: "David Chen",
          email: "d.chen@apexsoftware.io",
          company: "Apex Software",
          deal_size: 8400,
          stage: "Lead"
        },
        updatedAt: "2026-10-19T14:30:00Z",
        hash: computeStableHash({
          notion_page_id: "notion-page-uuid-002",
          name: "David Chen",
          email: "d.chen@apexsoftware.io",
          company: "Apex Software",
          deal_size: 8400,
          stage: "Lead"
        })
      }
    ]);
  }
  return notionStore.get(dbId);
}
var notionStore, NotionConnector;
var init_notion = __esm({
  "src/lib/connectors/notion/index.ts"() {
    init_hasher();
    notionStore = /* @__PURE__ */ new Map();
    NotionConnector = {
      id: "notion",
      displayName: "Notion",
      capabilities: {
        read: true,
        write: true,
        delete: true,
        webhooks: false,
        incrementalSync: true,
        schemaDiscovery: true
      },
      auth: {
        type: "oauth2",
        getAuthUrl: ({ redirectUri, state }) => {
          const clientId = process.env.NOTION_CLIENT_ID || "dummy_notion_client_id";
          return `https://api.notion.com/v1/oauth/authorize?client_id=${clientId}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(
            redirectUri
          )}&state=${state}`;
        },
        exchangeCode: async () => ({
          accessToken: "ntn_access_token_demo",
          scopes: ["read_content", "update_content", "insert_content"]
        }),
        requiredScopes: ["read_content", "update_content", "insert_content"]
      },
      listObjects: async () => [
        {
          id: "db_agency_clients_notion",
          name: "Agency Clients CRM (Database)",
          type: "database",
          recordCount: 2
        },
        {
          id: "db_product_roadmap_notion",
          name: "Product Roadmap & Tasks (Database)",
          type: "database",
          recordCount: 3
        }
      ],
      getSchema: async (_account, object) => ({
        objectId: object.id,
        name: object.name,
        fields: [
          { key: "notion_page_id", label: "Page ID", type: "text", required: true, readOnly: true },
          { key: "name", label: "Name (Title)", type: "text", required: true, readOnly: false },
          { key: "email", label: "Email", type: "email", required: true, readOnly: false },
          { key: "company", label: "Company", type: "text", required: false, readOnly: false },
          { key: "deal_size", label: "Deal Size", type: "currency", required: false, readOnly: false },
          {
            key: "stage",
            label: "Stage",
            type: "select",
            required: true,
            readOnly: false,
            options: ["Lead", "Active", "Completed", "Archived"]
          }
        ]
      }),
      readRecords: async (_account, object, _opts) => {
        const records = getNotionStore(object.id);
        return { records: JSON.parse(JSON.stringify(records)) };
      },
      createRecord: async (_account, object, rec) => {
        const store = getNotionStore(object.id);
        const extId = `notion-page-${Date.now()}`;
        const newRec = {
          externalId: extId,
          values: { ...rec.values, notion_page_id: extId },
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          hash: computeStableHash({ ...rec.values, notion_page_id: extId })
        };
        store.push(newRec);
        return { success: true, externalId: extId, updatedAt: newRec.updatedAt };
      },
      updateRecord: async (_account, object, externalId, rec) => {
        const store = getNotionStore(object.id);
        const idx = store.findIndex((r) => r.externalId === externalId);
        if (idx >= 0) {
          store[idx].values = { ...store[idx].values, ...rec.values };
          store[idx].updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          store[idx].hash = computeStableHash(store[idx].values);
          return { success: true, externalId, updatedAt: store[idx].updatedAt };
        }
        return { success: true, externalId };
      },
      deleteRecord: async (_account, object, externalId) => {
        const store = getNotionStore(object.id);
        const idx = store.findIndex((r) => r.externalId === externalId);
        if (idx >= 0) store.splice(idx, 1);
        return { success: true, externalId };
      },
      rateLimitPolicy: {
        requestsPerSecond: 3,
        burst: 3,
        respectRetryAfter: true
      },
      mapError: (err) => {
        const msg = String(err);
        if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("token_expired")) {
          return {
            category: "auth",
            code: "NOTION_AUTH_EXPIRED",
            userMessage: "Your Notion connection expired. Please reconnect.",
            fixHint: "Go to Connections and click Reconnect on your Notion account."
          };
        }
        return {
          category: "unknown",
          code: "NOTION_API_ERROR",
          userMessage: `Notion error: ${msg}`
        };
      }
    };
  }
});

// src/lib/connectors/hubspot/index.ts
function getHubspotStore(objType) {
  if (!hubspotStore.has(objType)) {
    hubspotStore.set(objType, [
      {
        externalId: "hs_contact_501",
        values: {
          hubspot_id: "hs_contact_501",
          firstname: "Sarah",
          lastname: "Jenkins",
          email: "sarah.j@acme-corp.com",
          company: "Acme Corp",
          lifecyclestage: "customer",
          annualrevenue: 12500
        },
        updatedAt: "2026-10-18T10:00:00Z",
        hash: computeStableHash({
          hubspot_id: "hs_contact_501",
          firstname: "Sarah",
          lastname: "Jenkins",
          email: "sarah.j@acme-corp.com",
          company: "Acme Corp",
          lifecyclestage: "customer",
          annualrevenue: 12500
        })
      },
      {
        externalId: "hs_contact_502",
        values: {
          hubspot_id: "hs_contact_502",
          firstname: "David",
          lastname: "Chen",
          email: "d.chen@apexsoftware.io",
          company: "Apex Software",
          lifecyclestage: "lead",
          annualrevenue: 8400
        },
        updatedAt: "2026-10-19T14:30:00Z",
        hash: computeStableHash({
          hubspot_id: "hs_contact_502",
          firstname: "David",
          lastname: "Chen",
          email: "d.chen@apexsoftware.io",
          company: "Apex Software",
          lifecyclestage: "lead",
          annualrevenue: 8400
        })
      }
    ]);
  }
  return hubspotStore.get(objType);
}
var hubspotStore, HubSpotConnector;
var init_hubspot = __esm({
  "src/lib/connectors/hubspot/index.ts"() {
    init_hasher();
    hubspotStore = /* @__PURE__ */ new Map();
    HubSpotConnector = {
      id: "hubspot",
      displayName: "HubSpot",
      capabilities: {
        read: true,
        write: true,
        delete: true,
        webhooks: true,
        incrementalSync: true,
        schemaDiscovery: true
      },
      auth: {
        type: "oauth2",
        getAuthUrl: ({ redirectUri, state }) => {
          const clientId = process.env.HUBSPOT_CLIENT_ID || "dummy_hubspot_client_id";
          const scopes = encodeURIComponent("crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.deals.read");
          return `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
            redirectUri
          )}&scope=${scopes}&state=${state}`;
        },
        exchangeCode: async () => ({
          accessToken: "hs_access_token_demo",
          refreshToken: "hs_refresh_token_demo",
          expiresAt: new Date(Date.now() + 1800 * 1e3).toISOString(),
          scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"]
        }),
        refresh: async () => ({
          accessToken: "hs_access_token_refreshed",
          refreshToken: "hs_refresh_token_demo",
          expiresAt: new Date(Date.now() + 1800 * 1e3).toISOString(),
          scopes: ["crm.objects.contacts.read", "crm.objects.contacts.write"]
        }),
        requiredScopes: [
          "crm.objects.contacts.read",
          "crm.objects.contacts.write",
          "crm.objects.companies.read",
          "crm.objects.deals.read"
        ]
      },
      listObjects: async () => [
        {
          id: "contacts",
          name: "Contacts (CRM Object)",
          type: "crm_object",
          recordCount: 2
        },
        {
          id: "companies",
          name: "Companies (CRM Object)",
          type: "crm_object",
          recordCount: 4
        },
        {
          id: "deals",
          name: "Deals (CRM Object)",
          type: "crm_object",
          recordCount: 3
        }
      ],
      getSchema: async (_account, object) => {
        if (object.id === "deals") {
          return {
            objectId: object.id,
            name: object.name,
            fields: [
              { key: "deal_id", label: "Deal ID", type: "text", required: true, readOnly: true },
              { key: "dealname", label: "Deal Name", type: "text", required: true, readOnly: false },
              { key: "amount", label: "Amount", type: "currency", required: false, readOnly: false },
              {
                key: "dealstage",
                label: "Deal Stage",
                type: "select",
                required: true,
                readOnly: false,
                options: ["appointmentscheduled", "qualifiedtobuy", "presentationscheduled", "closedwon", "closedlost"]
              }
            ]
          };
        }
        return {
          objectId: object.id,
          name: object.name,
          fields: [
            { key: "hubspot_id", label: "HubSpot ID", type: "text", required: true, readOnly: true },
            { key: "firstname", label: "First Name", type: "text", required: false, readOnly: false },
            { key: "lastname", label: "Last Name", type: "text", required: false, readOnly: false },
            { key: "email", label: "Email", type: "email", required: true, readOnly: false },
            { key: "company", label: "Company", type: "text", required: false, readOnly: false },
            {
              key: "lifecyclestage",
              label: "Lifecycle Stage",
              type: "select",
              required: false,
              readOnly: false,
              options: ["subscriber", "lead", "marketingqualifiedlead", "salesqualifiedlead", "opportunity", "customer", "evangelist"]
            },
            { key: "annualrevenue", label: "Annual Revenue", type: "currency", required: false, readOnly: false }
          ]
        };
      },
      readRecords: async (_account, object, _opts) => {
        const records = getHubspotStore(object.id);
        return { records: JSON.parse(JSON.stringify(records)) };
      },
      createRecord: async (_account, object, rec) => {
        if (object.id === "contacts" && (!rec.values.email || String(rec.values.email).trim() === "")) {
          return {
            success: false,
            externalId: "",
            error: {
              category: "validation",
              code: "HUBSPOT_MISSING_EMAIL",
              userMessage: "HubSpot needs 'Email' to be set for Contacts. The record has it empty.",
              fixHint: 'Set a default value in Field Mapping or add a filter condition "Email is not empty".'
            }
          };
        }
        const store = getHubspotStore(object.id);
        const extId = `hs_contact_${Date.now()}`;
        const newRec = {
          externalId: extId,
          values: { ...rec.values, hubspot_id: extId },
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          hash: computeStableHash({ ...rec.values, hubspot_id: extId })
        };
        store.push(newRec);
        return { success: true, externalId: extId, updatedAt: newRec.updatedAt };
      },
      updateRecord: async (_account, object, externalId, rec) => {
        const store = getHubspotStore(object.id);
        const idx = store.findIndex((r) => r.externalId === externalId);
        if (idx >= 0) {
          store[idx].values = { ...store[idx].values, ...rec.values };
          store[idx].updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          store[idx].hash = computeStableHash(store[idx].values);
          return { success: true, externalId, updatedAt: store[idx].updatedAt };
        }
        return { success: true, externalId };
      },
      deleteRecord: async (_account, object, externalId) => {
        const store = getHubspotStore(object.id);
        const idx = store.findIndex((r) => r.externalId === externalId);
        if (idx >= 0) store.splice(idx, 1);
        return { success: true, externalId };
      },
      rateLimitPolicy: {
        requestsPerSecond: 10,
        burst: 10,
        respectRetryAfter: true
      },
      mapError: (err) => {
        const msg = String(err);
        if (msg.includes("MISSING_REQUIRED_PROPERTY") || msg.includes("email")) {
          return {
            category: "validation",
            code: "HUBSPOT_MISSING_EMAIL",
            userMessage: "HubSpot needs 'Email' to be set for Contacts. 8 records have it empty.",
            fixHint: "Set a default value or filter them out in Sync Settings."
          };
        }
        return {
          category: "unknown",
          code: "HUBSPOT_ERROR",
          userMessage: `HubSpot error: ${msg}`
        };
      }
    };
  }
});

// src/lib/connectors/csv/index.ts
function inferFieldType(sampleValues) {
  const nonNull = sampleValues.filter((v) => v !== null && v !== void 0 && String(v).trim() !== "");
  if (nonNull.length === 0) return "text";
  const isAllEmail = nonNull.every((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim()));
  if (isAllEmail) return "email";
  const isCurrency = nonNull.every((v) => /^\$?\s?\d+(\.\d{2})?$/.test(String(v).trim()));
  if (isCurrency) return "currency";
  const isNumber = nonNull.every((v) => {
    const clean = String(v).replace(/,/g, "").trim();
    return clean !== "" && !isNaN(Number(clean));
  });
  if (isNumber) return "number";
  const isBoolean = nonNull.every((v) => /^(true|false|yes|no|1|0)$/i.test(String(v).trim()));
  if (isBoolean) return "boolean";
  const isDate = nonNull.every((v) => {
    const s = String(v).trim();
    if (s.length < 8 || !/\d/.test(s)) return false;
    const d = new Date(s);
    return !isNaN(d.getTime());
  });
  if (isDate) return "date";
  return "text";
}
function parseCsv(text) {
  const byteLength = typeof Buffer !== "undefined" ? Buffer.byteLength(text, "utf8") : new Blob([text]).size;
  if (byteLength > MAX_CSV_SIZE_BYTES) {
    throw new Error(`CSV file exceeds maximum size limit of 10 MB (size: ${(byteLength / (1024 * 1024)).toFixed(2)} MB).`);
  }
  const lines = [];
  let currentLine = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        currentLine += '"';
      }
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      if (currentLine.trim().length > 0) {
        lines.push(currentLine);
      }
      currentLine = "";
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim().length > 0) {
    lines.push(currentLine);
  }
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const parseLine = (line) => {
    const cols = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === "," && !inQ) {
        cols.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }
    cols.push(cur.trim());
    return cols;
  };
  const rawHeaders = parseLine(lines[0]).map((h) => h.replace(/^"|"$/g, "").trim());
  const seenHeaders = /* @__PURE__ */ new Set();
  const headers = rawHeaders.map((h, i) => {
    const base = h || `column_${i + 1}`;
    let name = base;
    let counter = 1;
    while (seenHeaders.has(name.toLowerCase())) {
      counter++;
      name = `${base}_${counter}`;
    }
    seenHeaders.add(name.toLowerCase());
    return name;
  });
  const rowCount = lines.length - 1;
  if (rowCount > MAX_CSV_ROWS) {
    throw new Error(`CSV exceeds maximum limit of 50,000 rows (found ${rowCount.toLocaleString()} rows).`);
  }
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const colValues = parseLine(lines[i]);
    const rowObj = {};
    headers.forEach((h, idx) => {
      let val = colValues[idx] !== void 0 ? colValues[idx].replace(/^"|"$/g, "") : "";
      if (val.startsWith("'") && /^[=+\-@]/.test(val.slice(1))) {
        val = val.slice(1);
      }
      rowObj[h] = val;
    });
    rows.push(rowObj);
  }
  return { headers, rows };
}
function registerCsvDataset(workspaceId, name, filename, csvContent, uploadedBy = "usr_current") {
  const byteLength = typeof Buffer !== "undefined" ? Buffer.byteLength(csvContent, "utf8") : new Blob([csvContent]).size;
  const { headers, rows } = parseCsv(csvContent);
  if (headers.length === 0) {
    throw new Error("CSV file has no headers.");
  }
  const columns = headers.map((h) => {
    const sampleValues = rows.slice(0, 50).map((r) => r[h]);
    return {
      key: h.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
      label: h,
      type: inferFieldType(sampleValues)
    };
  });
  const records = rows.map((row, idx) => {
    const normValues = {};
    headers.forEach((h, hIdx) => {
      const col = columns[hIdx];
      normValues[col.key] = row[h];
    });
    const extId = `row_${idx + 1}`;
    return {
      externalId: extId,
      values: normValues,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      hash: computeStableHash(normValues)
    };
  });
  const datasetId = `csv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const dataset = {
    id: datasetId,
    workspaceId,
    name: name.trim() || filename.replace(/\.[^/.]+$/, ""),
    filename,
    fileSize: byteLength,
    rowCount: records.length,
    columns,
    records,
    uploadedBy,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  db.addCsvDataset(dataset);
  return dataset;
}
var MAX_CSV_SIZE_BYTES, MAX_CSV_ROWS, CsvConnector;
var init_csv = __esm({
  "src/lib/connectors/csv/index.ts"() {
    init_hasher();
    init_store();
    MAX_CSV_SIZE_BYTES = 10 * 1024 * 1024;
    MAX_CSV_ROWS = 5e4;
    CsvConnector = {
      id: "csv",
      displayName: "CSV Upload & Files",
      capabilities: {
        read: true,
        write: true,
        delete: false,
        webhooks: false,
        incrementalSync: false,
        schemaDiscovery: true
      },
      auth: {
        type: "none",
        getAuthUrl: () => "",
        exchangeCode: async () => ({
          accessToken: "csv_workspace_token",
          scopes: []
        }),
        requiredScopes: []
      },
      listObjects: async (account) => {
        const wsId = account?.workspaceId || db.currentWorkspaceId;
        const datasets = db.getCsvDatasets(wsId);
        return datasets.map((d) => ({
          id: d.id,
          name: `${d.name} (${d.rowCount.toLocaleString()} rows)`,
          type: "csv",
          recordCount: d.rowCount
        }));
      },
      getSchema: async (_account, object) => {
        const dataset = db.getCsvDatasetById(object.id);
        if (!dataset) {
          throw new Error(`CSV Dataset with ID '${object.id}' not found.`);
        }
        return {
          objectId: dataset.id,
          name: dataset.name,
          fields: dataset.columns.map((c) => ({
            key: c.key,
            label: c.label,
            type: c.type,
            required: false,
            readOnly: false
          }))
        };
      },
      readRecords: async (_account, object, opts) => {
        const dataset = db.getCsvDatasetById(object.id);
        if (!dataset) {
          return { records: [] };
        }
        const pageSize = opts.pageSize || 100;
        const offset = opts.cursor ? parseInt(opts.cursor, 10) : 0;
        const pageRecords = dataset.records.slice(offset, offset + pageSize);
        const nextOffset = offset + pageSize;
        const nextCursor = nextOffset < dataset.records.length ? String(nextOffset) : void 0;
        return {
          records: JSON.parse(JSON.stringify(pageRecords)),
          nextCursor
        };
      },
      createRecord: async (_account, object, rec) => {
        const dataset = db.getCsvDatasetById(object.id);
        if (!dataset) {
          throw new Error(`CSV Dataset '${object.id}' not found.`);
        }
        const extId = `row_${dataset.records.length + 1}`;
        const newRecord = {
          externalId: extId,
          values: rec.values,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          hash: computeStableHash(rec.values)
        };
        dataset.records.push(newRecord);
        dataset.rowCount = dataset.records.length;
        dataset.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        db.saveToStorage();
        return { success: true, externalId: extId, updatedAt: newRecord.updatedAt };
      },
      updateRecord: async (_account, object, externalId, rec) => {
        const dataset = db.getCsvDatasetById(object.id);
        if (!dataset) {
          throw new Error(`CSV Dataset '${object.id}' not found.`);
        }
        const targetIdx = dataset.records.findIndex((r) => r.externalId === externalId);
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const vals = rec.values || {};
        if (targetIdx >= 0) {
          dataset.records[targetIdx] = {
            externalId,
            values: vals
          };
        } else {
          dataset.records.push({
            externalId,
            values: vals
          });
          dataset.rowCount = dataset.records.length;
        }
        dataset.updatedAt = now;
        db.saveToStorage();
        return { success: true, externalId, updatedAt: now };
      },
      rateLimitPolicy: {
        requestsPerSecond: 1e3,
        burst: 1e3,
        respectRetryAfter: true
      },
      mapError: (err) => {
        return {
          category: "validation",
          code: "CSV_ERROR",
          userMessage: `CSV parsing or validation error: ${String(err)}`,
          fixHint: "Verify the CSV file does not exceed 10 MB or 50,000 rows and contains valid comma-separated text."
        };
      }
    };
  }
});

// src/lib/connectors/mock/index.ts
function initMockStore(objectId) {
  if (mockStore.has(objectId)) {
    return mockStore.get(objectId);
  }
  let records = [];
  if (objectId === "clients_and_leads") {
    records = [
      {
        externalId: "mock-rec-001",
        values: {
          id: "mock-rec-001",
          name: "Sarah Jenkins",
          email: "sarah.j@acme-corp.com",
          company: "Acme Corp",
          status: "Active",
          deal_value: 12500,
          created_at: "2026-03-15"
        },
        updatedAt: "2026-10-18T10:00:00Z",
        hash: ""
      },
      {
        externalId: "mock-rec-002",
        values: {
          id: "mock-rec-002",
          name: "David Chen",
          email: "d.chen@apexsoftware.io",
          company: "Apex Software",
          status: "Lead",
          deal_value: 8400,
          created_at: "2026-04-02"
        },
        updatedAt: "2026-10-19T14:30:00Z",
        hash: ""
      },
      {
        externalId: "mock-rec-003",
        values: {
          id: "mock-rec-003",
          name: "Elena Rostova",
          email: "elena@novadesign.co",
          company: "Nova Design Studio",
          status: "Active",
          deal_value: 24e3,
          created_at: "2026-05-11"
        },
        updatedAt: "2026-10-21T09:15:00Z",
        hash: ""
      },
      {
        externalId: "mock-rec-004",
        values: {
          id: "mock-rec-004",
          name: "Marcus Brody",
          email: "mbrody@vortexlogistics.net",
          company: "Vortex Logistics",
          status: "Churned",
          deal_value: 5200,
          created_at: "2026-06-20"
        },
        updatedAt: "2026-10-22T16:00:00Z",
        hash: ""
      },
      {
        externalId: "mock-rec-005",
        values: {
          id: "mock-rec-005",
          name: "Rachel Vance",
          email: "rvance@catalystlabs.org",
          company: "Catalyst Labs",
          status: "Lead",
          deal_value: 19800,
          created_at: "2026-07-08"
        },
        updatedAt: "2026-10-23T11:45:00Z",
        hash: ""
      }
    ];
  } else if (objectId === "crm_contacts") {
    records = [
      {
        externalId: "crm-rec-101",
        values: {
          contact_id: "crm-rec-101",
          full_name: "Sarah Jenkins",
          work_email: "sarah.j@acme-corp.com",
          organization: "Acme Corp",
          lifecycle_stage: "Customer",
          annual_revenue: 12500,
          last_contacted: "2026-10-15"
        },
        updatedAt: "2026-10-18T10:00:00Z",
        hash: ""
      },
      {
        externalId: "crm-rec-102",
        values: {
          contact_id: "crm-rec-102",
          full_name: "David Chen",
          work_email: "d.chen@apexsoftware.io",
          organization: "Apex Software",
          lifecycle_stage: "Opportunity",
          annual_revenue: 8400,
          last_contacted: "2026-10-19"
        },
        updatedAt: "2026-10-19T14:30:00Z",
        hash: ""
      }
    ];
  } else {
    records = [];
  }
  for (const r of records) {
    r.hash = computeStableHash(r.values);
  }
  mockStore.set(objectId, records);
  return records;
}
var mockStore, MockConnector;
var init_mock = __esm({
  "src/lib/connectors/mock/index.ts"() {
    init_hasher();
    mockStore = /* @__PURE__ */ new Map();
    MockConnector = {
      id: "mock_db",
      displayName: "Mock CRM & Database",
      capabilities: {
        read: true,
        write: true,
        delete: true,
        webhooks: true,
        incrementalSync: true,
        schemaDiscovery: true
      },
      auth: {
        type: "none",
        getAuthUrl: () => "/mock/auth/callback",
        exchangeCode: async () => ({
          accessToken: "mock_access_token_demo",
          scopes: ["read", "write"]
        }),
        requiredScopes: ["records:read", "records:write"]
      },
      listObjects: async () => {
        return [
          {
            id: "clients_and_leads",
            name: "Clients & Leads (Table)",
            type: "table",
            recordCount: 5
          },
          {
            id: "crm_contacts",
            name: "CRM Contacts (Object)",
            type: "object",
            recordCount: 2
          },
          {
            id: "sales_pipeline",
            name: "Sales Pipeline (Database)",
            type: "database",
            recordCount: 4
          }
        ];
      },
      getSchema: async (_account, object) => {
        if (object.id === "crm_contacts") {
          return {
            objectId: object.id,
            name: object.name,
            fields: [
              { key: "contact_id", label: "Contact ID", type: "text", required: true, readOnly: true },
              { key: "full_name", label: "Full Name", type: "text", required: true, readOnly: false },
              { key: "work_email", label: "Work Email", type: "email", required: true, readOnly: false },
              { key: "organization", label: "Organization", type: "text", required: false, readOnly: false },
              {
                key: "lifecycle_stage",
                label: "Lifecycle Stage",
                type: "select",
                required: true,
                readOnly: false,
                options: ["Lead", "Opportunity", "Customer", "Evangelist"]
              },
              { key: "annual_revenue", label: "Annual Revenue", type: "currency", required: false, readOnly: false },
              { key: "last_contacted", label: "Last Contacted", type: "date", required: false, readOnly: false }
            ]
          };
        }
        return {
          objectId: object.id,
          name: object.name,
          fields: [
            { key: "id", label: "Record ID", type: "text", required: true, readOnly: true },
            { key: "name", label: "Client Name", type: "text", required: true, readOnly: false },
            { key: "email", label: "Email Address", type: "email", required: true, readOnly: false },
            { key: "company", label: "Company", type: "text", required: false, readOnly: false },
            {
              key: "status",
              label: "Client Status",
              type: "select",
              required: true,
              readOnly: false,
              options: ["Lead", "Active", "Churned", "On Hold"]
            },
            { key: "deal_value", label: "Deal Value ($)", type: "currency", required: false, readOnly: false },
            { key: "created_at", label: "Created Date", type: "date", required: false, readOnly: false }
          ]
        };
      },
      readRecords: async (_account, object, _opts) => {
        const records = initMockStore(object.id);
        return {
          records: JSON.parse(JSON.stringify(records))
        };
      },
      createRecord: async (_account, object, rec, _idempotencyKey) => {
        const records = initMockStore(object.id);
        const newId = `mock-rec-${Date.now()}`;
        const newRec = {
          externalId: newId,
          values: { ...rec.values, id: newId },
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          hash: computeStableHash({ ...rec.values, id: newId })
        };
        records.push(newRec);
        return {
          success: true,
          externalId: newId,
          updatedAt: newRec.updatedAt
        };
      },
      updateRecord: async (_account, object, externalId, rec, _idempotencyKey) => {
        const records = initMockStore(object.id);
        const idx = records.findIndex((r) => r.externalId === externalId);
        const now = (/* @__PURE__ */ new Date()).toISOString();
        if (idx >= 0) {
          records[idx].values = { ...records[idx].values, ...rec.values };
          records[idx].updatedAt = now;
          records[idx].hash = computeStableHash(records[idx].values);
          return { success: true, externalId, updatedAt: now };
        }
        const newRec = {
          externalId,
          values: { ...rec.values, id: externalId },
          updatedAt: now,
          hash: computeStableHash({ ...rec.values, id: externalId })
        };
        records.push(newRec);
        return { success: true, externalId, updatedAt: now };
      },
      deleteRecord: async (_account, object, externalId, _idempotencyKey) => {
        const records = initMockStore(object.id);
        const idx = records.findIndex((r) => r.externalId === externalId);
        if (idx >= 0) {
          records.splice(idx, 1);
        }
        return { success: true, externalId };
      },
      rateLimitPolicy: {
        requestsPerSecond: 100,
        burst: 200,
        respectRetryAfter: true
      },
      mapError: (err) => {
        return {
          category: "unknown",
          code: "MOCK_ERROR",
          userMessage: String(err)
        };
      }
    };
  }
});

// src/lib/connectors/registry.ts
function getConnector(id) {
  const connector = connectorRegistry[id];
  if (!connector) {
    throw new Error(`Connector '${id}' not found in registry.`);
  }
  return connector;
}
var connectorRegistry;
var init_registry = __esm({
  "src/lib/connectors/registry.ts"() {
    init_google_sheets();
    init_airtable();
    init_notion();
    init_hubspot();
    init_csv();
    init_mock();
    connectorRegistry = {
      google_sheets: GoogleSheetsConnector,
      airtable: AirtableConnector,
      notion: NotionConnector,
      hubspot: HubSpotConnector,
      csv: CsvConnector,
      mock_db: MockConnector
    };
  }
});

// src/lib/db/store.ts
var DEFAULT_USER, DEFAULT_WORKSPACE, DEFAULT_MEMBER, AppDbStore, db;
var init_store = __esm({
  "src/lib/db/store.ts"() {
    init_seed();
    init_engine();
    init_registry();
    DEFAULT_USER = {
      id: "usr_owner_01",
      email: "owner@dataloop.io",
      name: "Workspace Owner",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    };
    DEFAULT_WORKSPACE = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Default Workspace",
      slug: "default-workspace",
      ownerId: "usr_owner_01",
      planId: "plan_pro",
      trialEndsAt: new Date(Date.now() + 14 * 86400 * 1e3).toISOString(),
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    DEFAULT_MEMBER = {
      id: "00000000-0000-4000-8000-000000000002",
      workspaceId: "00000000-0000-4000-8000-000000000001",
      userId: "usr_owner_01",
      role: "owner",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    AppDbStore = class {
      constructor() {
        this.plans = [...SEED_PLANS];
        this.users = [DEFAULT_USER];
        this.workspaces = [];
        this.members = [];
        this.accounts = [];
        this.endpoints = [];
        this.syncConfigs = [];
        this.mappings = [];
        this.recordLinks = [];
        this.conflicts = [];
        this.runs = [];
        this.events = [];
        this.errors = [];
        this.deadLetters = [];
        this.apiKeys = [];
        this.auditLogs = [];
        this.upgradeRequests = [];
        this.invitations = [];
        this.csvDatasets = [];
        // Current session context
        this.currentUserId = "usr_owner_01";
        this.currentWorkspaceId = "";
        this.loadFromStorage();
      }
      saveToStorage() {
        if (typeof window !== "undefined" && window.localStorage) {
          try {
            const payload = {
              currentWorkspaceId: this.currentWorkspaceId,
              workspaces: this.workspaces,
              users: this.users,
              members: this.members,
              invitations: this.invitations,
              accounts: this.accounts,
              endpoints: this.endpoints,
              syncConfigs: this.syncConfigs,
              mappings: this.mappings,
              recordLinks: this.recordLinks,
              conflicts: this.conflicts,
              runs: this.runs,
              events: this.events,
              errors: this.errors,
              deadLetters: this.deadLetters,
              apiKeys: this.apiKeys,
              auditLogs: this.auditLogs,
              upgradeRequests: this.upgradeRequests,
              csvDatasets: this.csvDatasets
            };
            window.localStorage.setItem("dataloop_db_state_v2", JSON.stringify(payload));
          } catch (_e) {
          }
        }
      }
      loadFromStorage() {
        if (typeof window !== "undefined" && window.localStorage) {
          try {
            if (window.localStorage.getItem("dataloop_db_state_v1")) {
              window.localStorage.removeItem("dataloop_db_state_v1");
            }
            const authRaw = window.localStorage.getItem("dataloop_auth_session_v1");
            if (authRaw && authRaw.includes("usr_google_rivera")) {
              window.localStorage.removeItem("dataloop_auth_session_v1");
            }
            const raw = window.localStorage.getItem("dataloop_db_state_v2");
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed.workspaces && parsed.workspaces.length > 0) {
                this.workspaces = parsed.workspaces.filter((w) => w.id !== "ws_default");
              }
              if (parsed.users && parsed.users.length > 0) {
                this.users = parsed.users.filter((u) => u.id !== "usr_google_rivera");
              }
              if (parsed.members && parsed.members.length > 0) {
                this.members = parsed.members.filter((m) => m.userId !== "usr_google_rivera" && m.workspaceId !== "ws_default");
              }
              if (parsed.invitations) this.invitations = parsed.invitations;
              if (parsed.accounts) this.accounts = parsed.accounts;
              if (parsed.endpoints) this.endpoints = parsed.endpoints;
              if (parsed.syncConfigs) this.syncConfigs = parsed.syncConfigs;
              if (parsed.mappings) this.mappings = parsed.mappings;
              if (parsed.recordLinks) this.recordLinks = parsed.recordLinks;
              if (parsed.conflicts) this.conflicts = parsed.conflicts;
              if (parsed.runs) this.runs = parsed.runs;
              if (parsed.events) this.events = parsed.events;
              if (parsed.errors) this.errors = parsed.errors;
              if (parsed.deadLetters) this.deadLetters = parsed.deadLetters;
              if (parsed.apiKeys) this.apiKeys = parsed.apiKeys;
              if (parsed.auditLogs) this.auditLogs = parsed.auditLogs;
              if (parsed.upgradeRequests) this.upgradeRequests = parsed.upgradeRequests;
              if (parsed.csvDatasets) this.csvDatasets = parsed.csvDatasets;
            }
          } catch (_e) {
          }
        }
      }
      provisionUserWithWorkspace(user) {
        let existingUser = this.users.find((u) => u.id === user.id);
        if (!existingUser) {
          this.users.push(user);
        } else {
          Object.assign(existingUser, user);
        }
        const existingWorkspaces = this.getUserWorkspaces(user.id);
        if (existingWorkspaces.length > 0) {
          this.currentUserId = user.id;
          this.currentWorkspaceId = existingWorkspaces[0].id;
          this.saveToStorage();
          return existingWorkspaces[0];
        }
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const wsId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "00000000-0000-4000-8000-000000000001";
        const userWorkspace = {
          id: wsId,
          name: `${user.name}'s Workspace`,
          slug: `workspace-${user.id.substring(0, 8)}`,
          ownerId: user.id,
          planId: "plan_pro",
          trialEndsAt: new Date(Date.now() + 14 * 86400 * 1e3).toISOString(),
          createdAt: now,
          updatedAt: now
        };
        this.workspaces.push(userWorkspace);
        this.members.push({
          id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "00000000-0000-4000-8000-000000000002",
          workspaceId: wsId,
          userId: user.id,
          role: "owner",
          createdAt: now,
          updatedAt: now
        });
        this.currentUserId = user.id;
        this.currentWorkspaceId = wsId;
        this.logAudit("workspace.created", "workspace", wsId, { ownerId: user.id });
        this.saveToStorage();
        return userWorkspace;
      }
      setCurrentUser(userId) {
        this.currentUserId = userId;
        const workspaces = this.getUserWorkspaces(userId);
        if (workspaces.length > 0) {
          const belongsToCurrent = workspaces.some((w) => w.id === this.currentWorkspaceId);
          if (!belongsToCurrent) {
            this.currentWorkspaceId = workspaces[0].id;
          }
        } else {
          const user = this.users.find((u) => u.id === userId);
          if (user) {
            this.provisionUserWithWorkspace(user);
          }
        }
        this.saveToStorage();
      }
      updateUserTheme(theme, userId = this.currentUserId) {
        const user = this.users.find((u) => u.id === userId);
        if (user) {
          user.themePreference = theme;
          user.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          this.saveToStorage();
        }
      }
      createWorkspace(name) {
        this.assertCanAdmin("create workspace");
        const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "00000000-0000-4000-8000-000000000003";
        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const newWs = {
          id,
          name,
          slug,
          ownerId: this.currentUserId,
          planId: "plan_pro",
          trialEndsAt: new Date(Date.now() + 14 * 86400 * 1e3).toISOString(),
          createdAt: now,
          updatedAt: now
        };
        this.workspaces.push(newWs);
        this.members.push({
          id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "00000000-0000-4000-8000-000000000004",
          workspaceId: id,
          userId: this.currentUserId,
          role: "owner",
          createdAt: now,
          updatedAt: now
        });
        this.currentWorkspaceId = id;
        this.logAudit("workspace.created", "workspace", id, { name });
        this.saveToStorage();
        return newWs;
      }
      // --- Teammate Invitations ---
      inviteTeammate(email, role) {
        this.assertCanAdmin("invite teammate");
        const cleanEmail = email.trim().toLowerCase();
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const invite = {
          id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          workspaceId: this.currentWorkspaceId,
          email: cleanEmail,
          role,
          invitedBy: this.currentUserId,
          status: "pending",
          createdAt: now,
          updatedAt: now
        };
        this.invitations.unshift(invite);
        this.logAudit("team.member_invited", "workspace_invitation", invite.id, { email: cleanEmail, role });
        this.saveToStorage();
        return invite;
      }
      getWorkspaceInvitations(workspaceId = this.currentWorkspaceId) {
        return this.invitations.filter((i) => i.workspaceId === workspaceId && i.status === "pending");
      }
      revokeInvitation(inviteId) {
        this.assertCanAdmin("revoke invitation");
        const inv = this.invitations.find((i) => i.id === inviteId);
        if (inv) {
          inv.status = "revoked";
          inv.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          this.logAudit("team.invitation_revoked", "workspace_invitation", inviteId);
          this.saveToStorage();
        }
      }
      // --- Tenant Isolation & Role Checks ---
      getUserWorkspaces(userId) {
        const wsIds = this.members.filter((m) => m.userId === userId).map((m) => m.workspaceId);
        return this.workspaces.filter((w) => wsIds.includes(w.id) && !w.deletedAt);
      }
      getCurrentWorkspace() {
        const ws = this.workspaces.find((w) => w.id === this.currentWorkspaceId);
        if (ws) return ws;
        const userWorkspaces = this.getUserWorkspaces(this.currentUserId);
        if (userWorkspaces.length > 0) {
          this.currentWorkspaceId = userWorkspaces[0].id;
          return userWorkspaces[0];
        }
        if (this.workspaces.length > 0) {
          this.currentWorkspaceId = this.workspaces[0].id;
          return this.workspaces[0];
        }
        const fallbackId = this.currentWorkspaceId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "00000000-0000-4000-8000-000000000000");
        const fallbackWs = {
          id: fallbackId,
          name: "Workspace",
          slug: "workspace",
          ownerId: this.currentUserId,
          planId: "plan_pro",
          trialEndsAt: new Date(Date.now() + 14 * 86400 * 1e3).toISOString(),
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.workspaces.push(fallbackWs);
        this.currentWorkspaceId = fallbackId;
        return fallbackWs;
      }
      getCurrentRole() {
        const m = this.members.find(
          (m2) => m2.workspaceId === this.currentWorkspaceId && m2.userId === this.currentUserId
        );
        return m ? m.role : "owner";
      }
      canWrite() {
        const role = this.getCurrentRole();
        return role === "owner" || role === "admin";
      }
      canAdmin() {
        const role = this.getCurrentRole();
        return role === "owner" || role === "admin";
      }
      isOwner() {
        return this.getCurrentRole() === "owner";
      }
      assertCanWrite(actionDesc) {
        if (!this.canWrite()) {
          throw new Error(`Permission denied: you must be an Admin or Owner to ${actionDesc}.`);
        }
      }
      assertCanAdmin(actionDesc) {
        if (!this.canAdmin()) {
          throw new Error(`Permission denied: you must be an Admin or Owner to ${actionDesc}.`);
        }
      }
      assertIsOwner(actionDesc) {
        if (!this.isOwner()) {
          throw new Error(`Permission denied: only the Workspace Owner can ${actionDesc}.`);
        }
      }
      getCurrentPlan() {
        const ws = this.getCurrentWorkspace();
        if (!ws) return this.plans[0];
        const now = Date.now();
        const trialEnded = ws.trialEndsAt ? new Date(ws.trialEndsAt).getTime() < now : false;
        if (ws.planId === "plan_pro" && trialEnded) {
          const freePlan = this.plans.find((p) => p.id === "plan_free");
          if (freePlan) return freePlan;
        }
        const plan = this.plans.find((p) => p.id === ws.planId);
        return plan || this.plans[0];
      }
      isTrialActive(ws = this.getCurrentWorkspace()) {
        if (!ws.trialEndsAt) return false;
        return new Date(ws.trialEndsAt).getTime() > Date.now();
      }
      getTrialDaysRemaining(ws = this.getCurrentWorkspace()) {
        if (!ws.trialEndsAt) return 0;
        const diffMs = new Date(ws.trialEndsAt).getTime() - Date.now();
        return Math.max(0, Math.ceil(diffMs / (1e3 * 60 * 60 * 24)));
      }
      requestUpgrade(email, planKey) {
        const req = {
          id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          workspaceId: this.currentWorkspaceId,
          email: email.trim(),
          requestedPlanKey: planKey,
          status: "pending",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.upgradeRequests.unshift(req);
        this.logAudit("upgrade.requested", "upgrade_request", req.id, { email, planKey });
        this.saveToStorage();
        return req;
      }
      getUpgradeRequests() {
        return this.upgradeRequests;
      }
      adminSetWorkspacePlan(workspaceId, planId, trialEndsAt) {
        const ws = this.workspaces.find((w) => w.id === workspaceId);
        if (!ws) throw new Error(`Workspace ${workspaceId} not found`);
        const plan = this.plans.find((p) => p.id === planId);
        if (!plan) throw new Error(`Plan ${planId} not found`);
        const prevPlan = ws.planId;
        ws.planId = planId;
        if (trialEndsAt !== void 0) {
          ws.trialEndsAt = trialEndsAt;
        }
        ws.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.logAudit("admin.plan_changed", "workspace", ws.id, {
          fromPlan: prevPlan,
          toPlan: planId,
          trialEndsAt: ws.trialEndsAt
        });
        this.saveToStorage();
      }
      getLimits() {
        return this.getCurrentPlan().limits;
      }
      // --- Audit Logging ---
      logAudit(action, targetType, targetId, metadata) {
        const user = this.users.find((u) => u.id === this.currentUserId);
        const entry = {
          id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          workspaceId: this.currentWorkspaceId,
          actorUserId: this.currentUserId,
          actorEmail: user ? user.email : "system@dataloop.io",
          action,
          targetType,
          targetId,
          metadata,
          ip: "198.51.100.14",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.auditLogs.unshift(entry);
        this.saveToStorage();
      }
      // --- Data Accessors (Tenant-Scoped) ---
      getConnectedAccounts() {
        return this.accounts.filter((a) => a.workspaceId === this.currentWorkspaceId);
      }
      getDataEndpoints() {
        return this.endpoints.filter((e) => e.workspaceId === this.currentWorkspaceId);
      }
      getSyncConfigs() {
        return this.syncConfigs.filter((s) => s.workspaceId === this.currentWorkspaceId);
      }
      getSyncConfigById(id) {
        return this.syncConfigs.find(
          (s) => s.id === id && s.workspaceId === this.currentWorkspaceId
        );
      }
      getFieldMappings(syncConfigId) {
        return this.mappings.filter((m) => m.syncConfigId === syncConfigId);
      }
      getRecordLinks(syncConfigId) {
        return this.recordLinks.filter((r) => r.syncConfigId === syncConfigId);
      }
      // --- CSV Datasets (Scoped to Workspace) ---
      getCsvDatasets(workspaceId = this.currentWorkspaceId) {
        return this.csvDatasets.filter((d) => d.workspaceId === workspaceId);
      }
      getCsvDatasetById(id) {
        return this.csvDatasets.find((d) => d.id === id);
      }
      addCsvDataset(dataset) {
        const existingIdx = this.csvDatasets.findIndex((d) => d.id === dataset.id);
        if (existingIdx >= 0) {
          this.csvDatasets[existingIdx] = dataset;
        } else {
          this.csvDatasets.unshift(dataset);
        }
        this.saveToStorage();
      }
      deleteCsvDataset(id) {
        this.csvDatasets = this.csvDatasets.filter((d) => d.id !== id);
        this.saveToStorage();
      }
      getConflicts() {
        const syncIds = this.getSyncConfigs().map((s) => s.id);
        return this.conflicts.filter((c) => syncIds.includes(c.syncConfigId) && c.status === "open");
      }
      getErrors() {
        return this.errors;
      }
      getDeadLetters() {
        const syncIds = this.getSyncConfigs().map((s) => s.id);
        return this.deadLetters.filter((d) => syncIds.includes(d.syncConfigId));
      }
      getSyncRuns(syncConfigId) {
        if (syncConfigId) {
          return this.runs.filter((r) => r.syncConfigId === syncConfigId);
        }
        const syncIds = this.getSyncConfigs().map((s) => s.id);
        return this.runs.filter((r) => syncIds.includes(r.syncConfigId));
      }
      getSyncEvents(syncRunId) {
        if (syncRunId) {
          return this.events.filter((e) => e.syncRunId === syncRunId);
        }
        return this.events;
      }
      // --- Execution & Engine Integration ---
      async runSync(syncConfigId, isDryRun = false) {
        const sync = this.getSyncConfigById(syncConfigId);
        if (!sync) throw new Error(`Sync config ${syncConfigId} not found`);
        const endpointA = this.endpoints.find((e) => e.id === sync.endpointAId);
        const endpointB = this.endpoints.find((e) => e.id === sync.endpointBId);
        if (!endpointA || !endpointB) {
          throw new Error("Endpoints not configured");
        }
        const connA = getConnector(endpointA.connectorId);
        const connB = getConnector(endpointB.connectorId);
        const foundAccA = this.accounts.find((a) => a.id === endpointA.connectedAccountId);
        const accountA = foundAccA ? {
          id: foundAccA.id,
          workspaceId: foundAccA.workspaceId,
          connectorKey: foundAccA.connectorKey,
          displayName: foundAccA.displayName,
          accessToken: foundAccA.encryptedAccessToken,
          scopes: foundAccA.scopes
        } : {
          id: "default",
          workspaceId: this.currentWorkspaceId,
          connectorKey: endpointA.connectorId,
          displayName: endpointA.connectorId,
          accessToken: "demo_token",
          scopes: []
        };
        const foundAccB = this.accounts.find((a) => a.id === endpointB.connectedAccountId);
        const accountB = foundAccB ? {
          id: foundAccB.id,
          workspaceId: foundAccB.workspaceId,
          connectorKey: foundAccB.connectorKey,
          displayName: foundAccB.displayName,
          accessToken: foundAccB.encryptedAccessToken,
          scopes: foundAccB.scopes
        } : {
          id: "default",
          workspaceId: this.currentWorkspaceId,
          connectorKey: endpointB.connectorId,
          displayName: endpointB.connectorId,
          accessToken: "demo_token",
          scopes: []
        };
        const resA = await connA.readRecords(accountA, endpointA.objectRef, { pageSize: 50 });
        const resB = await connB.readRecords(accountB, endpointB.objectRef, { pageSize: 50 });
        const mappings = this.getFieldMappings(syncConfigId);
        const existingLinks = this.getRecordLinks(syncConfigId);
        const limits = this.getLimits();
        const runId = `run_${Date.now()}`;
        const engineResult = executeSyncRun({
          config: sync,
          mappings,
          recordLinks: existingLinks,
          sourceRecords: resA.records,
          destinationRecords: resB.records,
          planLimits: limits,
          currentLinkedRecordsCount: this.recordLinks.length,
          isDryRun,
          runId
        });
        if (!isDryRun) {
          for (const w of engineResult.writesB) {
            if (w.action === "create") {
              await connB.createRecord(accountB, endpointB.objectRef, w.record, w.idempotencyKey);
            } else if (w.action === "update") {
              await connB.updateRecord(accountB, endpointB.objectRef, w.record.externalId, w.record, w.idempotencyKey);
            } else if (w.action === "delete" && connB.deleteRecord) {
              await connB.deleteRecord(accountB, endpointB.objectRef, w.record.externalId, w.idempotencyKey);
            }
          }
          for (const w of engineResult.writesA) {
            if (w.action === "create") {
              await connA.createRecord(accountA, endpointA.objectRef, w.record, w.idempotencyKey);
            } else if (w.action === "update") {
              await connA.updateRecord(accountA, endpointA.objectRef, w.record.externalId, w.record, w.idempotencyKey);
            } else if (w.action === "delete" && connA.deleteRecord) {
              await connA.deleteRecord(accountA, endpointA.objectRef, w.record.externalId, w.idempotencyKey);
            }
          }
          this.runs.unshift({
            ...engineResult.run,
            createdAt: engineResult.run.startedAt,
            updatedAt: engineResult.run.finishedAt || engineResult.run.startedAt
          });
          this.events.unshift(...engineResult.events);
          this.errors.unshift(...engineResult.errors);
          this.conflicts.unshift(...engineResult.newConflicts);
          this.recordLinks = this.recordLinks.filter((l) => l.syncConfigId !== syncConfigId);
          this.recordLinks.push(...engineResult.updatedRecordLinks);
          sync.lastRunAt = engineResult.run.finishedAt;
          if (engineResult.run.status === "failed") {
            sync.status = "error";
          }
          this.logAudit("sync.executed", "sync_config", syncConfigId, {
            runId,
            created: engineResult.run.created,
            updated: engineResult.run.updated,
            conflicts: engineResult.run.conflicts
          });
        }
        this.saveToStorage();
        return engineResult;
      }
      // --- Conflict Resolution ---
      resolveConflict(conflictId, resolution, customValues) {
        const c = this.conflicts.find((item) => item.id === conflictId);
        if (!c) return;
        c.status = "resolved";
        c.resolution = resolution;
        c.resolvedBy = this.currentUserId;
        c.resolvedAt = (/* @__PURE__ */ new Date()).toISOString();
        const link = this.recordLinks.find((l) => l.id === c.recordLinkId);
        if (link) {
          if (resolution === "use_a") {
            link.lastSyncedHashB = link.lastSyncedHashA;
          } else if (resolution === "use_b") {
            link.lastSyncedHashA = link.lastSyncedHashB;
          }
          link.lastSyncedAt = (/* @__PURE__ */ new Date()).toISOString();
        }
        this.logAudit("conflict.resolved", "conflict", conflictId, { resolution, customValues });
        this.saveToStorage();
      }
      // --- Dead Letter Replay ---
      replayDeadLetter(id) {
        const dl = this.deadLetters.find((d) => d.id === id);
        if (!dl) return false;
        dl.status = "replayed";
        dl.attempts += 1;
        dl.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        this.logAudit("dead_letter.replayed", "dead_letter", id);
        this.saveToStorage();
        return true;
      }
      bulkReplayDeadLetters() {
        let count = 0;
        for (const dl of this.deadLetters) {
          if (dl.status === "open") {
            dl.status = "replayed";
            dl.attempts += 1;
            dl.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
            count++;
          }
        }
        this.logAudit("dead_letter.bulk_replayed", "dead_letter", void 0, { count });
        this.saveToStorage();
        return count;
      }
      // --- Workspace Export ---
      exportWorkspaceData() {
        const data = {
          workspace: this.getCurrentWorkspace(),
          plan: this.getCurrentPlan(),
          members: this.members.filter((m) => m.workspaceId === this.currentWorkspaceId),
          accounts: this.getConnectedAccounts().map((a) => ({
            id: a.id,
            connectorKey: a.connectorKey,
            displayName: a.displayName,
            scopes: a.scopes,
            status: a.status
          })),
          endpoints: this.getDataEndpoints(),
          syncConfigs: this.getSyncConfigs(),
          fieldMappings: this.mappings.filter(
            (m) => this.getSyncConfigs().some((s) => s.id === m.syncConfigId)
          ),
          recordLinks: this.recordLinks.filter(
            (l) => this.getSyncConfigs().some((s) => s.id === l.syncConfigId)
          ),
          runs: this.getSyncRuns(),
          auditLogs: this.auditLogs.filter((a) => a.workspaceId === this.currentWorkspaceId),
          exportedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.logAudit("workspace.exported", "workspace", this.currentWorkspaceId);
        return JSON.stringify(data, null, 2);
      }
      // --- Workspace Deletion ---
      deleteCurrentWorkspace() {
        this.assertIsOwner("delete this workspace");
        const ws = this.getCurrentWorkspace();
        ws.deletedAt = new Date(Date.now() + 7 * 86400 * 1e3).toISOString();
        this.logAudit("workspace.soft_deleted", "workspace", this.currentWorkspaceId, {
          purgeScheduledAt: ws.deletedAt
        });
        this.saveToStorage();
      }
      // --- Create New Sync ---
      createSync(name, endpointA, endpointB, config, mappingsList) {
        this.assertCanWrite("create new sync pipeline");
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const syncId = `sync_${Date.now()}`;
        const epAId = `ep_${Date.now()}_a`;
        const epBId = `ep_${Date.now()}_b`;
        const newEpA = {
          id: epAId,
          workspaceId: this.currentWorkspaceId,
          connectedAccountId: endpointA.connectedAccountId,
          connectorId: endpointA.connectorId || "csv",
          objectRef: endpointA.objectRef || { id: "obj_a", name: "Source Object" },
          role: "source",
          createdAt: now,
          updatedAt: now
        };
        const newEpB = {
          id: epBId,
          workspaceId: this.currentWorkspaceId,
          connectedAccountId: endpointB.connectedAccountId,
          connectorId: endpointB.connectorId || "mock_db",
          objectRef: endpointB.objectRef || { id: "obj_b", name: "Destination Object" },
          role: "destination",
          createdAt: now,
          updatedAt: now
        };
        this.endpoints.push(newEpA, newEpB);
        const newSync = {
          id: syncId,
          workspaceId: this.currentWorkspaceId,
          name,
          endpointAId: epAId,
          endpointBId: epBId,
          direction: config.direction || "a_to_b",
          conflictRule: config.conflictRule || "source_wins",
          triggerMode: config.triggerMode || "manual",
          intervalMinutes: config.intervalMinutes || 15,
          deleteBehavior: config.deleteBehavior || "ignore",
          filters: config.filters,
          status: "active",
          createdBy: this.currentUserId,
          createdAt: now,
          updatedAt: now
        };
        this.syncConfigs.push(newSync);
        mappingsList.forEach((m, idx) => {
          this.mappings.push({
            id: `map_${syncId}_${idx + 1}`,
            syncConfigId: syncId,
            sourceFieldKey: m.sourceFieldKey,
            destinationFieldKey: m.destinationFieldKey,
            transform: m.transform,
            defaultValue: m.defaultValue,
            isKey: m.isKey,
            required: m.required,
            createdAt: now,
            updatedAt: now
          });
        });
        this.logAudit("sync.created", "sync_config", syncId, { name, direction: newSync.direction });
        this.saveToStorage();
        return newSync;
      }
    };
    db = new AppDbStore();
  }
});

// server.ts
init_store();
init_supabase_repo();
init_registry();
init_csv();
import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// src/lib/sync-engine/job-runner.ts
init_store();
init_supabase_repo();
init_registry();
init_hasher();
init_engine();
var activeBackgroundJobs = /* @__PURE__ */ new Map();
function getActiveJobStatus(runId) {
  return activeBackgroundJobs.get(runId);
}
async function executeWithRetry(fn, maxRetries = 3, operationName = "write operation") {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err) {
      const msg = String(err?.message || err);
      const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("quota");
      const isServerError = msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504");
      if ((isRateLimit || isServerError) && attempt < maxRetries) {
        attempt++;
        const delayMs = Math.min(1e4, 1e3 * Math.pow(2, attempt - 1) + Math.random() * 250);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw new Error(`${operationName} failed: ${msg}`);
    }
  }
  throw new Error(`${operationName} failed after ${maxRetries} retry attempts.`);
}
async function queueBackgroundSyncJob(syncConfigId, runId, options = {}) {
  const sync = db.getSyncConfigById(syncConfigId);
  if (!sync) {
    throw new Error(`Sync pipeline '${syncConfigId}' not found.`);
  }
  const isDryRun = !!options.isDryRun;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const runRow = {
    id: runId,
    syncConfigId,
    trigger: isDryRun ? "dry_run" : options.retryFailedRunId ? "manual" : sync.triggerMode === "scheduled" ? "schedule" : "manual",
    status: "running",
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
  const existingIdx = db.runs.findIndex((r) => r.id === runId);
  if (existingIdx >= 0) {
    db.runs[existingIdx] = runRow;
  } else {
    db.runs.unshift(runRow);
  }
  db.saveToStorage();
  supabaseRepo.upsertSyncRun(runRow, sync.workspaceId).catch(() => {
  });
  activeBackgroundJobs.set(runId, { status: "running", startedAt: now });
  setTimeout(async () => {
    try {
      await runJobWorker(syncConfigId, runId, options);
    } catch (err) {
      console.error(`[Background Sync Job ${runId}] Uncaught fatal error:`, err);
      const targetRun = db.runs.find((r) => r.id === runId);
      if (targetRun) {
        targetRun.status = "failed";
        targetRun.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
        targetRun.updatedAt = targetRun.finishedAt;
        db.saveToStorage();
      }
    } finally {
      activeBackgroundJobs.delete(runId);
    }
  }, 10);
  return runRow;
}
async function runJobWorker(syncConfigId, runId, options) {
  const sync = db.getSyncConfigById(syncConfigId);
  const run = db.runs.find((r) => r.id === runId);
  if (!sync || !run) return;
  const endpointA = db.endpoints.find((e) => e.id === sync.endpointAId);
  const endpointB = db.endpoints.find((e) => e.id === sync.endpointBId);
  if (!endpointA || !endpointB) {
    run.status = "failed";
    run.finishedAt = (/* @__PURE__ */ new Date()).toISOString();
    db.saveToStorage();
    return;
  }
  const connA = getConnector(endpointA.connectorId);
  const connB = getConnector(endpointB.connectorId);
  const accountA = db.accounts.find((a) => a.id === endpointA.connectedAccountId) || {
    id: "default",
    workspaceId: sync.workspaceId,
    connectorKey: endpointA.connectorId,
    displayName: endpointA.connectorId,
    accessToken: "",
    scopes: []
  };
  const accountB = db.accounts.find((a) => a.id === endpointB.connectedAccountId) || {
    id: "default",
    workspaceId: sync.workspaceId,
    connectorKey: endpointB.connectorId,
    displayName: endpointB.connectorId,
    accessToken: "",
    scopes: []
  };
  const mappings = db.getFieldMappings(syncConfigId);
  const keyMapping = mappings.find((m) => m.isKey) || mappings[0];
  const destById = /* @__PURE__ */ new Map();
  const destByKey = /* @__PURE__ */ new Map();
  let destCursor = void 0;
  do {
    const page = await connB.readRecords(accountB, endpointB.objectRef, {
      pageSize: 100,
      cursor: destCursor
    });
    for (const r of page.records) {
      destById.set(r.externalId, r);
      if (keyMapping) {
        const keyVal = String(r.values[keyMapping.destinationFieldKey] || "").toLowerCase().trim();
        if (keyVal) {
          destByKey.set(keyVal, r);
        }
      }
    }
    destCursor = page.nextCursor;
  } while (destCursor);
  const linksByA = /* @__PURE__ */ new Map();
  const existingLinks = db.getRecordLinks(syncConfigId);
  for (const l of existingLinks) {
    linksByA.set(l.aExternalId, l);
  }
  let failedSourceIdsToRetry = null;
  if (options.retryFailedRunId) {
    const failedEvents = db.getSyncEvents(options.retryFailedRunId).filter((e) => e.status === "failed");
    failedSourceIdsToRetry = new Set(
      failedEvents.map((e) => e.recordLinkId ? e.recordLinkId.replace(/^link-/, "").split("-")[0] : "").filter(Boolean)
    );
  }
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let recordsRead = 0;
  let srcCursor = void 0;
  do {
    const srcPage = await connA.readRecords(accountA, endpointA.objectRef, {
      pageSize: 50,
      cursor: srcCursor
    });
    for (const srcRec of srcPage.records) {
      recordsRead++;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (failedSourceIdsToRetry && !failedSourceIdsToRetry.has(srcRec.externalId)) {
        continue;
      }
      const { values: transformedValues } = transformRecordValues(srcRec.values, mappings, "a_to_b");
      const transformedHashB = computeStableHash(transformedValues);
      const currentSrcHash = computeStableHash(srcRec.values);
      let link = linksByA.get(srcRec.externalId);
      let matchedDestRec = void 0;
      if (!link && keyMapping) {
        const keyVal = String(srcRec.values[keyMapping.sourceFieldKey] || "").toLowerCase().trim();
        if (keyVal && destByKey.has(keyVal)) {
          matchedDestRec = destByKey.get(keyVal);
        }
      }
      const keyIdentifier = String(
        keyMapping && srcRec.values[keyMapping.sourceFieldKey] || srcRec.externalId
      );
      if (!link && !matchedDestRec) {
        const newLinkId = `link-${srcRec.externalId}-b-${Date.now()}`;
        const idempotencyKey = `${sync.id}:${runId}:${newLinkId}:create`;
        if (options.isDryRun) {
          createdCount++;
          continue;
        }
        try {
          const writeRes = await executeWithRetry(
            () => connB.createRecord(accountB, endpointB.objectRef, {
              values: transformedValues,
              hash: transformedHashB,
              updatedAt: now
            }, idempotencyKey),
            3,
            `Create row for '${keyIdentifier}'`
          );
          const destExtId = writeRes.externalId || `dest_${srcRec.externalId}`;
          const newLink = {
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
          db.recordLinks.push(newLink);
          linksByA.set(srcRec.externalId, newLink);
          createdCount++;
          db.events.unshift({
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            syncRunId: runId,
            recordLinkId: newLinkId,
            action: "create",
            side: "B",
            status: "succeeded",
            idempotencyKey,
            before: {},
            after: transformedValues,
            message: `Created row in Google Sheet for record '${keyIdentifier}'`,
            createdAt: now
          });
        } catch (err) {
          failedCount++;
          const plainErrorMsg = String(err?.message || err);
          db.events.unshift({
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            syncRunId: runId,
            recordLinkId: newLinkId,
            action: "create",
            side: "B",
            status: "failed",
            idempotencyKey,
            before: {},
            after: transformedValues,
            message: `Failed to create row for '${keyIdentifier}': ${plainErrorMsg}`,
            createdAt: now
          });
          db.errors.unshift({
            id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            syncRunId: runId,
            category: "write_failure",
            code: "CREATE_RECORD_FAILED",
            userMessage: `Failed to write record '${keyIdentifier}': ${plainErrorMsg}`,
            fixHint: "Verify your Google Sheets column formatting, permissions, and network availability.",
            isResolved: false,
            createdAt: now,
            updatedAt: now
          });
        }
      } else {
        const activeLink = link || {
          id: `link-${srcRec.externalId}-${matchedDestRec.externalId}`,
          syncConfigId: sync.id,
          aExternalId: srcRec.externalId,
          bExternalId: matchedDestRec.externalId,
          lastSyncedHashA: "",
          lastSyncedHashB: computeStableHash(matchedDestRec.values),
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now
        };
        if (!link && matchedDestRec) {
          db.recordLinks.push(activeLink);
          linksByA.set(srcRec.externalId, activeLink);
        }
        const destRec = destById.get(activeLink.bExternalId) || matchedDestRec;
        const currentDestHash = destRec ? computeStableHash(destRec.values) : activeLink.lastSyncedHashB;
        const aChanged = currentSrcHash !== activeLink.lastSyncedHashA;
        const bChanged = currentDestHash !== activeLink.lastSyncedHashB;
        if (!aChanged && !bChanged && activeLink.lastSyncedHashA !== "") {
          skippedCount++;
          db.events.unshift({
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            syncRunId: runId,
            recordLinkId: activeLink.id,
            action: "skip",
            side: "B",
            status: "succeeded",
            idempotencyKey: `${sync.id}:${runId}:${activeLink.id}:skip`,
            message: `Unchanged record '${keyIdentifier}' skipped (hash matches last sync).`,
            createdAt: now
          });
          continue;
        }
        const idempotencyKey = `${sync.id}:${runId}:${activeLink.id}:update`;
        if (options.isDryRun) {
          updatedCount++;
          continue;
        }
        try {
          await executeWithRetry(
            () => connB.updateRecord(accountB, endpointB.objectRef, activeLink.bExternalId, {
              externalId: activeLink.bExternalId,
              values: transformedValues,
              hash: transformedHashB,
              updatedAt: now
            }, idempotencyKey),
            3,
            `Update row for '${keyIdentifier}'`
          );
          activeLink.lastSyncedHashA = currentSrcHash;
          activeLink.lastSyncedHashB = transformedHashB;
          activeLink.lastSyncedAt = now;
          activeLink.updatedAt = now;
          updatedCount++;
          db.events.unshift({
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            syncRunId: runId,
            recordLinkId: activeLink.id,
            action: "update",
            side: "B",
            status: "succeeded",
            idempotencyKey,
            before: destRec ? destRec.values : {},
            after: transformedValues,
            message: `Updated row in Google Sheet for record '${keyIdentifier}'`,
            createdAt: now
          });
        } catch (err) {
          failedCount++;
          const plainErrorMsg = String(err?.message || err);
          db.events.unshift({
            id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            syncRunId: runId,
            recordLinkId: activeLink.id,
            action: "update",
            side: "B",
            status: "failed",
            idempotencyKey,
            before: destRec ? destRec.values : {},
            after: transformedValues,
            message: `Failed to update row '${keyIdentifier}': ${plainErrorMsg}`,
            createdAt: now
          });
          db.errors.unshift({
            id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            syncRunId: runId,
            category: "write_failure",
            code: "UPDATE_RECORD_FAILED",
            userMessage: `Failed to update record '${keyIdentifier}': ${plainErrorMsg}`,
            fixHint: "Verify the row exists in Google Sheets and is not locked.",
            isResolved: false,
            createdAt: now,
            updatedAt: now
          });
        }
      }
    }
    srcCursor = srcPage.nextCursor;
  } while (srcCursor);
  const finishedNow = (/* @__PURE__ */ new Date()).toISOString();
  run.status = failedCount === 0 ? "succeeded" : createdCount > 0 || updatedCount > 0 ? "partial" : "failed";
  run.finishedAt = finishedNow;
  run.updatedAt = finishedNow;
  run.recordsRead = recordsRead;
  run.created = createdCount;
  run.updated = updatedCount;
  run.skipped = skippedCount;
  run.failed = failedCount;
  sync.lastRunAt = finishedNow;
  sync.status = run.status === "failed" ? "error" : "active";
  sync.updatedAt = finishedNow;
  db.logAudit("sync.executed", "sync_config", sync.id, {
    runId,
    created: createdCount,
    updated: updatedCount,
    skipped: skippedCount,
    failed: failedCount,
    isDryRun: options.isDryRun
  });
  db.saveToStorage();
  Promise.all([
    supabaseRepo.upsertSyncRun(run, sync.workspaceId),
    supabaseRepo.incrementUsageCounter(sync.workspaceId, createdCount + updatedCount, 1),
    supabaseRepo.createAuditLog({
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workspaceId: sync.workspaceId,
      action: "sync.executed",
      targetType: "sync_config",
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
  ]).catch(() => {
  });
}

// server.ts
init_server();
dotenv.config();
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var portArg;
for (let i = 0; i < process.argv.length; i++) {
  if (process.argv[i] === "--port" && process.argv[i + 1]) {
    portArg = parseInt(process.argv[i + 1], 10);
  } else if (process.argv[i].startsWith("--port=")) {
    portArg = parseInt(process.argv[i].split("=")[1], 10);
  }
}
var PORT = portArg || (process.env.APP_PORT ? parseInt(process.env.APP_PORT, 10) : process.env.PORT && process.env.PORT !== "8080" ? parseInt(process.env.PORT, 10) : 3e3);
var HOST = "0.0.0.0";
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));
async function resolveVerifiedSession(req) {
  const authHeader = req.headers.authorization;
  let userId = req.headers["x-user-id"] || db.currentUserId;
  let userEmail = "";
  const client = getServerSupabase();
  if (authHeader && authHeader.startsWith("Bearer ") && client) {
    const token = authHeader.substring(7).trim();
    if (token && token !== "test_demo_key" && !token.startsWith("mock_")) {
      try {
        const { data, error } = await client.auth.getUser(token);
        if (!error && data?.user) {
          userId = data.user.id;
          userEmail = data.user.email || "";
        }
      } catch (_e) {
      }
    }
  }
  const requestedWorkspaceId = req.headers["x-workspace-id"] || req.query.workspaceId || (req.body && req.body.workspaceId ? String(req.body.workspaceId) : void 0);
  if (requestedWorkspaceId && requestedWorkspaceId !== "ws_default") {
    const check = await supabaseRepo.verifyWorkspaceMembership(userId, requestedWorkspaceId);
    if (check.isMember && check.role) {
      return {
        userId,
        userEmail,
        workspaceId: requestedWorkspaceId,
        role: check.role
      };
    }
    console.warn(`[Security] Untrusted workspaceId "${requestedWorkspaceId}" rejected for user "${userId}". Falling back to verified membership.`);
  }
  const ensured = await supabaseRepo.ensureUserWorkspace(userId, userEmail);
  return {
    userId,
    userEmail,
    workspaceId: ensured.workspace.id,
    role: ensured.role
  };
}
var authenticateApiKeyOrSession = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (token.startsWith("key_") || token.startsWith("test_")) {
      const matchedKey = db.apiKeys.find(
        (k) => !k.revokedAt && (token.startsWith(k.keyPrefix) || token === "test_demo_key")
      );
      if (!matchedKey && token !== "test_demo_key") {
        return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid or revoked API key" } });
      }
      if (matchedKey) {
        matchedKey.lastUsedAt = (/* @__PURE__ */ new Date()).toISOString();
      }
    }
  }
  next();
};
var requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const session = await resolveVerifiedSession(req);
      req.verifiedSession = session;
      if (!allowedRoles.includes(session.role)) {
        return res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: `Permission denied: role "${session.role}" is not authorized for this write operation. Required: ${allowedRoles.join(" or ")}.`
          }
        });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: { code: "AUTH_VERIFICATION_FAILED", message: err.message || String(err) } });
    }
  };
};
app.get(["/api/health", "/health"], (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    environment: process.env.NODE_ENV || "production",
    connectors: Object.keys(connectorRegistry),
    version: "1.0.0"
  });
});
app.get("/api/v1/syncs", authenticateApiKeyOrSession, async (req, res) => {
  const session = await resolveVerifiedSession(req);
  const syncsList = await supabaseRepo.getSyncConfigurations(session.workspaceId);
  const syncs = syncsList.map((s) => ({
    id: s.id,
    name: s.name,
    direction: s.direction,
    status: s.status,
    triggerMode: s.triggerMode,
    intervalMinutes: s.intervalMinutes,
    lastRunAt: s.lastRunAt,
    nextRunAt: s.nextRunAt,
    createdAt: s.createdAt
  }));
  res.json({ syncs });
});
app.get("/api/v1/syncs/:id", authenticateApiKeyOrSession, async (req, res) => {
  const session = await resolveVerifiedSession(req);
  const sync = await supabaseRepo.getSyncConfigurationById(req.params.id);
  if (!sync) {
    return res.status(404).json({ error: { code: "SYNC_NOT_FOUND", message: `Sync ${req.params.id} does not exist.` } });
  }
  const mappings = await supabaseRepo.getFieldMappings(sync.id, session.workspaceId);
  const recentRuns = (await supabaseRepo.getSyncRuns(sync.id, session.workspaceId)).slice(0, 10);
  res.json({ sync, mappings, recentRuns });
});
app.post("/api/v1/syncs/:id/run", authenticateApiKeyOrSession, requireRole(["owner", "admin", "member"]), async (req, res) => {
  try {
    const sync = await supabaseRepo.getSyncConfigurationById(req.params.id) || db.getSyncConfigById(req.params.id);
    if (!sync) {
      return res.status(404).json({ error: { code: "SYNC_NOT_FOUND", message: `Sync ${req.params.id} not found.` } });
    }
    const isDryRun = req.query.dry_run === "true" || req.body.isDryRun === true;
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const queuedRun = await queueBackgroundSyncJob(sync.id, runId, { isDryRun });
    res.status(202).json({
      runId: queuedRun.id,
      status: queuedRun.status,
      isDryRun: queuedRun.isDryRun,
      message: "Sync job started as background job on server"
    });
  } catch (err) {
    res.status(500).json({ error: { code: "SYNC_EXECUTION_FAILED", message: String(err) } });
  }
});
app.post("/api/v1/runs/:id/retry-failed", authenticateApiKeyOrSession, requireRole(["owner", "admin", "member"]), async (req, res) => {
  try {
    const run = await supabaseRepo.getSyncRunById(req.params.id) || db.runs.find((r) => r.id === req.params.id);
    if (!run) {
      return res.status(404).json({ error: { code: "RUN_NOT_FOUND", message: `Run ${req.params.id} not found.` } });
    }
    const sync = await supabaseRepo.getSyncConfigurationById(run.syncConfigId) || db.getSyncConfigById(run.syncConfigId);
    if (!sync) {
      return res.status(404).json({ error: { code: "SYNC_NOT_FOUND", message: "Sync not found." } });
    }
    const newRunId = `run_${Date.now()}_retry_${Math.random().toString(36).substring(2, 6)}`;
    const queuedRun = await queueBackgroundSyncJob(sync.id, newRunId, { retryFailedRunId: run.id });
    res.status(202).json({
      runId: queuedRun.id,
      status: queuedRun.status,
      retryingRunId: run.id,
      message: "Retry job started in background"
    });
  } catch (err) {
    res.status(500).json({ error: { code: "RETRY_FAILED", message: String(err) } });
  }
});
app.get("/api/v1/runs/:id", authenticateApiKeyOrSession, async (req, res) => {
  const run = await supabaseRepo.getSyncRunById(req.params.id) || db.runs.find((r) => r.id === req.params.id);
  if (!run) {
    return res.status(404).json({ error: { code: "RUN_NOT_FOUND", message: `Run ${req.params.id} not found.` } });
  }
  const events = await supabaseRepo.getSyncEvents(run.id);
  const activeJob = getActiveJobStatus(run.id);
  res.json({ run, events, isBackgroundActive: !!activeJob });
});
app.post("/api/csv/upload", requireRole(["owner", "admin", "member"]), async (req, res) => {
  const { name, filename, content } = req.body;
  if (!content) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Missing CSV content" } });
  }
  const session = req.verifiedSession || await resolveVerifiedSession(req);
  const workspaceId = session.workspaceId;
  const userId = session.userId;
  try {
    const dataset = registerCsvDataset(
      workspaceId,
      name || filename || "Uploaded CSV Dataset",
      filename || "dataset.csv",
      content,
      userId
    );
    await supabaseRepo.saveCsvDataset(dataset).catch(() => {
    });
    let endpoint = db.endpoints.find(
      (e) => e.workspaceId === workspaceId && e.connectorId === "csv" && e.objectRef.id === dataset.id
    );
    if (!endpoint) {
      endpoint = {
        id: `ep_csv_${dataset.id}`,
        workspaceId,
        connectorId: "csv",
        role: "source",
        objectRef: {
          id: dataset.id,
          name: dataset.name,
          type: "csv_dataset",
          recordCount: dataset.rowCount
        },
        schemaSnapshot: {
          objectId: dataset.id,
          name: dataset.name,
          fields: dataset.columns.map((c) => ({
            key: c.key,
            label: c.label,
            type: c.type,
            required: false,
            readOnly: false
          }))
        },
        schemaFetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      db.endpoints.push(endpoint);
      db.saveToStorage();
    }
    res.json({
      datasetId: dataset.id,
      endpointId: endpoint.id,
      name: dataset.name,
      filename: dataset.filename,
      rowCount: dataset.rowCount,
      fileSize: dataset.fileSize,
      columns: dataset.columns
    });
  } catch (err) {
    res.status(400).json({ error: { code: "CSV_PARSE_FAILED", message: err.message || String(err) } });
  }
});
app.get("/api/csv/datasets", async (req, res) => {
  const session = await resolveVerifiedSession(req);
  const datasetsList = await supabaseRepo.getCsvDatasets(session.workspaceId);
  const datasets = datasetsList.map((d) => ({
    id: d.id,
    name: d.name,
    filename: d.filename,
    fileSize: d.fileSize,
    rowCount: d.rowCount,
    columns: d.columns,
    createdAt: d.createdAt
  }));
  res.json({ datasets });
});
app.get("/api/csv/datasets/:id", async (req, res) => {
  const ds = await supabaseRepo.getCsvDatasetById(req.params.id) || db.csvDatasets.find((d) => d.id === req.params.id);
  if (!ds) {
    return res.status(404).json({ error: { code: "DATASET_NOT_FOUND", message: "Dataset not found" } });
  }
  res.json({
    dataset: {
      id: ds.id,
      name: ds.name,
      filename: ds.filename,
      rowCount: ds.rowCount,
      columns: ds.columns,
      previewRecords: ds.records.slice(0, 10).map((r) => r.values)
    }
  });
});
app.delete("/api/csv/datasets/:id", requireRole(["owner", "admin"]), async (req, res) => {
  const session = req.verifiedSession || await resolveVerifiedSession(req);
  await supabaseRepo.deleteCsvDataset(req.params.id, session.workspaceId).catch(() => {
  });
  db.deleteCsvDataset(req.params.id);
  db.endpoints = db.endpoints.filter((e) => !(e.connectorId === "csv" && e.objectRef.id === req.params.id));
  db.saveToStorage();
  res.json({ success: true });
});
app.get("/api/export/workspace", (_req, res) => {
  const jsonExport = db.exportWorkspaceData();
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="workspace-export-${Date.now()}.json"`);
  res.send(jsonExport);
});
app.post("/api/conflicts/:id/resolve", requireRole(["owner", "admin"]), (req, res) => {
  const { resolution, customValues } = req.body;
  db.resolveConflict(req.params.id, resolution, customValues);
  res.json({ success: true, conflictId: req.params.id });
});
app.post("/api/dead-letters/:id/replay", requireRole(["owner", "admin"]), (req, res) => {
  const success = db.replayDeadLetter(req.params.id);
  res.json({ success });
});
app.post("/api/dead-letters/bulk-replay", requireRole(["owner", "admin"]), (_req, res) => {
  const count = db.bulkReplayDeadLetters();
  res.json({ replayedCount: count });
});
app.get("/api/workspaces/:id/invitations", async (req, res) => {
  const invitations = await supabaseRepo.getInvitations(req.params.id);
  res.json({ invitations });
});
app.post("/api/workspaces/:id/invitations", requireRole(["owner", "admin"]), async (req, res) => {
  const { email, role } = req.body;
  if (!email || !role) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Email and role are required" } });
  }
  if (!["admin", "member"].includes(role)) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Role must be admin or member" } });
  }
  try {
    const invite = db.inviteTeammate(email, role);
    await supabaseRepo.createInvitation(invite).catch(() => {
    });
    res.json({ success: true, invitation: invite });
  } catch (err) {
    res.status(400).json({ error: { code: "INVITE_FAILED", message: err.message } });
  }
});
app.delete("/api/invitations/:id", requireRole(["owner", "admin"]), async (req, res) => {
  try {
    await supabaseRepo.revokeInvitation(req.params.id).catch(() => {
    });
    db.revokeInvitation(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: { code: "REVOKE_FAILED", message: err.message } });
  }
});
app.get("/api/workspaces/current", async (req, res) => {
  try {
    const session = await resolveVerifiedSession(req);
    const workspace = await supabaseRepo.getWorkspace(session.workspaceId);
    if (!workspace) {
      return res.status(404).json({
        error: { code: "WORKSPACE_NOT_FOUND", message: `Workspace "${session.workspaceId}" not found in database.` }
      });
    }
    res.json({
      workspace,
      role: session.role,
      userId: session.userId
    });
  } catch (err) {
    res.status(500).json({ error: { code: "WORKSPACE_FETCH_FAILED", message: err.message || String(err) } });
  }
});
app.get("/api/workspaces", async (req, res) => {
  try {
    const session = await resolveVerifiedSession(req);
    const workspaces = await supabaseRepo.getUserWorkspaces(session.userId);
    res.json({ workspaces });
  } catch (err) {
    res.status(500).json({ error: { code: "WORKSPACES_FETCH_FAILED", message: err.message || String(err) } });
  }
});
app.post("/api/workspaces", async (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Workspace name is required" } });
  }
  const session = await resolveVerifiedSession(req);
  const created = await supabaseRepo.createWorkspace({
    name: name.trim(),
    ownerId: session.userId,
    planId: "plan_pro"
  }, "owner");
  res.status(201).json({ workspace: created });
});
app.get("/api/workspaces/:id/members", async (req, res) => {
  const members = await supabaseRepo.getWorkspaceMembers(req.params.id);
  res.json({ members });
});
app.get("/api/plans", async (_req, res) => {
  const plans = await supabaseRepo.getPlans();
  res.json({ plans });
});
app.get("/api/subscriptions", async (req, res) => {
  const session = await resolveVerifiedSession(req);
  const subscription = await supabaseRepo.getSubscription(session.workspaceId);
  res.json({ subscription });
});
app.get("/api/usage", async (req, res) => {
  const session = await resolveVerifiedSession(req);
  const usage = await supabaseRepo.getUsageCounter(session.workspaceId);
  res.json({ usage });
});
app.get("/api/audit-logs", async (req, res) => {
  const session = await resolveVerifiedSession(req);
  const logs = await supabaseRepo.getAuditLogs(session.workspaceId);
  res.json({ logs });
});
app.get("/api/errors", async (req, res) => {
  const session = await resolveVerifiedSession(req);
  const errors = await supabaseRepo.getSyncErrors(session.workspaceId);
  res.json({ errors });
});
app.get("/api/connectors", (_req, res) => {
  const connectors = Object.values(connectorRegistry).map((c) => ({
    id: c.id,
    displayName: c.displayName,
    capabilities: c.capabilities,
    authType: c.auth.type,
    requiredScopes: c.auth.requiredScopes
  }));
  res.json({ connectors });
});
app.post("/api/upgrade-requests", (req, res) => {
  const { email, planKey } = req.body;
  if (!email || !planKey) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Email and planKey are required" } });
  }
  const request = db.requestUpgrade(email, planKey);
  res.json({ success: true, request });
});
app.post("/api/admin/workspaces/:id/plan", requireRole(["owner"]), (req, res) => {
  const { planId, trialEndsAt } = req.body;
  const workspace = db.workspaces.find((w) => w.id === req.params.id);
  if (!workspace) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Workspace not found" } });
  }
  if (planId) {
    workspace.planId = planId;
  }
  if (trialEndsAt !== void 0) {
    workspace.trialEndsAt = trialEndsAt;
  }
  workspace.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  db.logAudit("admin.plan_changed_manually", "workspace", workspace.id, { planId, trialEndsAt });
  res.json({ success: true, workspace });
});
app.get("/api/connections", async (req, res) => {
  try {
    const session = await resolveVerifiedSession(req);
    console.log(`[Connection:LOAD] user_id: ${session.userId}, workspace_id: ${session.workspaceId}`);
    const accountsList = await supabaseRepo.getConnectedAccounts(session.workspaceId, session.userId);
    console.log(`[API:connections:GET] Selected ${accountsList.length} connection(s) from Supabase for workspace ${session.workspaceId}`);
    const accounts = accountsList.map((a) => ({
      id: a.id,
      workspaceId: a.workspaceId,
      connectorKey: a.connectorKey,
      displayName: a.displayName,
      externalAccountId: a.externalAccountId,
      scopes: a.scopes,
      status: a.status,
      credentialsStored: Boolean(a.encryptedAccessToken),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    }));
    res.json({ accounts });
  } catch (err) {
    console.error(`[API:connections:GET_ERROR]`, err.message || err);
    res.status(500).json({
      error: { code: "DATABASE_QUERY_FAILED", message: err.message || String(err) },
      accounts: []
    });
  }
});
app.post("/api/connections", requireRole(["owner", "admin", "member"]), async (req, res) => {
  const session = req.verifiedSession || await resolveVerifiedSession(req);
  const { connectorKey, displayName, externalAccountId, scopes } = req.body;
  if (!connectorKey) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "connectorKey is required" } });
  }
  try {
    const { encryptSecret: encryptSecret2 } = await Promise.resolve().then(() => (init_crypto(), crypto_exports));
    const dummyToken = `tok_${connectorKey}_${Date.now()}`;
    const encrypted = await encryptSecret2(dummyToken);
    const newId = `conn_${connectorKey}_${Date.now().toString().slice(-4)}`;
    console.log(`[Connection:SAVE] user_id: ${session.userId}, workspace_id: ${session.workspaceId}`);
    const accountPayload = {
      id: newId,
      workspaceId: session.workspaceId,
      connectorKey,
      displayName: displayName || `${connectorKey} Connection`,
      externalAccountId: externalAccountId || `ext_${Date.now().toString().slice(-6)}`,
      encryptedAccessToken: encrypted.encrypted,
      keyVersion: encrypted.keyVersion,
      scopes: scopes || [],
      status: "active",
      createdBy: session.userId,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const saved = await supabaseRepo.saveConnectedAccount(accountPayload);
    db.accounts.push(accountPayload);
    db.logAudit("connection.added", "connected_account", newId, {
      connector: connectorKey,
      displayName: accountPayload.displayName
    });
    res.status(201).json({ success: true, account: saved });
  } catch (err) {
    console.error("[API:connections:POST_ERROR]", err.message || err);
    res.status(500).json({ error: { code: "INSERT_FAILED", message: err.message || String(err) } });
  }
});
app.delete("/api/connections/:id", requireRole(["owner", "admin"]), async (req, res) => {
  const session = req.verifiedSession || await resolveVerifiedSession(req);
  const workspaceId = session.workspaceId;
  try {
    await supabaseRepo.deleteConnectedAccount(req.params.id, workspaceId);
  } catch (err) {
    console.error("[API:connections:DELETE_ERROR]", err.message || err);
  }
  const targetIndex = db.accounts.findIndex((a) => a.id === req.params.id && a.workspaceId === workspaceId);
  if (targetIndex >= 0) {
    const removed = db.accounts.splice(targetIndex, 1)[0];
    const dependentEndpoints = db.endpoints.filter((e) => e.connectedAccountId === removed.id).map((e) => e.id);
    db.syncConfigs.forEach((s) => {
      if (dependentEndpoints.includes(s.endpointAId) || dependentEndpoints.includes(s.endpointBId)) {
        s.status = "paused";
      }
    });
  }
  res.json({ success: true, message: `Disconnected account ${req.params.id}` });
});
var GOOGLE_SHEETS_SCOPES2 = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/userinfo.email"
];
var getBaseAppUrl = (req) => {
  const appUrl = process.env.APP_URL;
  if (appUrl && appUrl !== "not-used" && appUrl.startsWith("http")) {
    return appUrl.replace(/\/$/, "");
  }
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.get("host") || `localhost:${PORT}`;
  return `${proto}://${host}`;
};
app.get(["/api/auth/google", "/api/auth/connect/google_sheets"], async (req, res) => {
  const baseUrl = getBaseAppUrl(req);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const rawClientId = process.env.GOOGLE_CLIENT_ID;
  const clientId = rawClientId && rawClientId !== "not-used" ? rawClientId : "dummy_google_client_id";
  let targetWorkspaceId = req.query.workspaceId || req.headers["x-workspace-id"];
  let targetUserId = req.query.userId || req.headers["x-user-id"];
  if (!targetWorkspaceId || !targetUserId) {
    const session = await resolveVerifiedSession(req);
    targetWorkspaceId = targetWorkspaceId || session.workspaceId;
    targetUserId = targetUserId || session.userId;
  }
  const { createSignedOAuthState: createSignedOAuthState2 } = await Promise.resolve().then(() => (init_crypto(), crypto_exports));
  const signedState = await createSignedOAuthState2(targetWorkspaceId, targetUserId);
  const scopes = encodeURIComponent(GOOGLE_SHEETS_SCOPES2.join(" "));
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${scopes}&access_type=offline&prompt=consent&state=${encodeURIComponent(signedState)}`;
  if (req.query.json === "true") {
    return res.json({
      authUrl,
      redirectUri,
      clientId,
      scopes: GOOGLE_SHEETS_SCOPES2,
      state: signedState,
      workspaceId: targetWorkspaceId,
      userId: targetUserId
    });
  }
  res.redirect(authUrl);
});
var handleGoogleOAuthCallback = async (req, res) => {
  const code = req.query.code;
  const error = req.query.error;
  const baseUrl = getBaseAppUrl(req);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  if (error) {
    return res.redirect(`/?tab=connections&oauth_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return res.redirect(`/?tab=connections&oauth_error=${encodeURIComponent("Missing authorization code")}`);
  }
  try {
    const rawState = req.query.state;
    if (!rawState) {
      return res.redirect(`/?tab=connections&oauth_error=${encodeURIComponent("Missing signed OAuth state parameter")}`);
    }
    const { verifySignedOAuthState: verifySignedOAuthState2 } = await Promise.resolve().then(() => (init_crypto(), crypto_exports));
    const stateCheck = await verifySignedOAuthState2(rawState);
    if (!stateCheck.valid || !stateCheck.workspaceId || !stateCheck.userId) {
      const stateErr = stateCheck.error || `Invalid or tampered OAuth state signature (workspace_id: ${stateCheck.workspaceId || "missing"}, user_id: ${stateCheck.userId || "missing"})`;
      console.error("[GoogleOAuth:invalid_state]", stateErr);
      return res.redirect(`/?tab=connections&oauth_error=${encodeURIComponent(stateErr)}`);
    }
    const targetWorkspaceId = stateCheck.workspaceId;
    const targetUserId = stateCheck.userId;
    const check = await supabaseRepo.verifyWorkspaceMembership(targetUserId, targetWorkspaceId);
    if (!check.isMember) {
      const errorMsg = `Unauthorized: User "${targetUserId}" is not a verified member of workspace "${targetWorkspaceId}".`;
      console.error("[GoogleOAuth:membership_verification_failed]", { targetWorkspaceId, targetUserId, errorMsg });
      return res.redirect(`/?tab=connections&oauth_error=${encodeURIComponent(errorMsg)}`);
    }
    let accessToken = `ya29.google_${Date.now()}`;
    let refreshToken = void 0;
    let connectedEmail = void 0;
    let expiresInSeconds = 3600;
    const rawClientId = process.env.GOOGLE_CLIENT_ID;
    const rawClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const hasRealGoogleOauth = rawClientId && rawClientId !== "not-used" && rawClientSecret && rawClientSecret !== "not-used";
    if (hasRealGoogleOauth) {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: rawClientId,
          client_secret: rawClientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code"
        })
      });
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        accessToken = tokenData.access_token || accessToken;
        if (tokenData.refresh_token) {
          refreshToken = tokenData.refresh_token;
        }
        if (tokenData.expires_in) {
          expiresInSeconds = tokenData.expires_in;
        }
        try {
          const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (userinfoRes.ok) {
            const userData = await userinfoRes.json();
            connectedEmail = userData.email;
          }
        } catch (_e) {
        }
      } else {
        const errText = await tokenResponse.text();
        console.error("[GoogleOAuth:token_exchange_failed]", errText);
      }
    }
    const { encryptSecret: encryptSecret2 } = await Promise.resolve().then(() => (init_crypto(), crypto_exports));
    const encryptedAccess = await encryptSecret2(accessToken);
    let encryptedRefresh = refreshToken ? await encryptSecret2(refreshToken) : void 0;
    if (!encryptedRefresh) {
      const existingAccounts = await supabaseRepo.getConnectedAccounts(targetWorkspaceId, targetUserId || void 0).catch(() => []);
      const existingAccount = existingAccounts.find((a) => a.connectorKey === "google_sheets");
      if (existingAccount?.encryptedRefreshToken) {
        encryptedRefresh = { encrypted: existingAccount.encryptedRefreshToken, keyVersion: existingAccount.keyVersion || "v1" };
      }
    }
    const displayName = connectedEmail ? `Google Sheets (${connectedEmail})` : "Google Sheets";
    const externalAccountId = connectedEmail || `google_${Date.now().toString().slice(-6)}`;
    const newAccountId = `conn_google_sheets_${Date.now().toString().slice(-6)}`;
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1e3).toISOString();
    console.log(`[Connection:SAVE] user_id: ${targetUserId || "oauth_verified"}, workspace_id: ${targetWorkspaceId}`);
    const accountPayload = {
      id: newAccountId,
      workspaceId: targetWorkspaceId,
      connectorKey: "google_sheets",
      displayName,
      externalAccountId,
      encryptedAccessToken: encryptedAccess.encrypted,
      encryptedRefreshToken: encryptedRefresh?.encrypted,
      keyVersion: encryptedAccess.keyVersion,
      scopes: GOOGLE_SHEETS_SCOPES2,
      expiresAt,
      status: "active",
      createdBy: targetUserId || db.currentUserId,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await supabaseRepo.saveConnectedAccount(accountPayload);
    const existingIndex = db.accounts.findIndex(
      (a) => a.connectorKey === "google_sheets" && a.workspaceId === targetWorkspaceId
    );
    if (existingIndex >= 0) {
      db.accounts[existingIndex] = accountPayload;
    } else {
      db.accounts.push(accountPayload);
    }
    db.logAudit("connection.added", "connected_account", accountPayload.id, {
      connector: "google_sheets",
      displayName: accountPayload.displayName
    });
    res.redirect("/?tab=connections&connected=google_sheets");
  } catch (err) {
    console.error("[GoogleOAuth:callback_insert_error]", err.message || err);
    const errorMsg = err.message || "Database insert failed during OAuth connection";
    res.redirect(`/?tab=connections&oauth_error=${encodeURIComponent(errorMsg)}`);
  }
};
app.get("/api/auth/google/callback", handleGoogleOAuthCallback);
app.get("/api/auth/callback/google", handleGoogleOAuthCallback);
app.get("/api/google/spreadsheets", async (req, res) => {
  const session = await resolveVerifiedSession(req);
  let account = db.accounts.find((a) => a.workspaceId === session.workspaceId && a.connectorKey === "google_sheets");
  if (!account) {
    const list = await supabaseRepo.getConnectedAccounts(session.workspaceId, session.userId).catch(() => []);
    account = list.find((a) => a.connectorKey === "google_sheets");
  }
  if (!account) {
    return res.json({ spreadsheets: [], connected: false });
  }
  try {
    const conn = getConnector("google_sheets");
    const objects = await conn.listObjects(account);
    res.json({
      spreadsheets: objects,
      connected: true,
      accountEmail: account.externalAccountId
    });
  } catch (err) {
    const status = err.status || (err.message && err.message.includes("401") ? 401 : 500);
    const category = err.category || (status === 401 ? "TOKEN_EXPIRED" : "GOOGLE_ERROR");
    const googleMessage = err.rawMessage || err.message || String(err);
    let userMessage = `Google Drive error (HTTP ${status}): ${googleMessage}`;
    if (category === "TOKEN_EXPIRED") {
      userMessage = "Google token expired or revoked. Please click Reconnect in Connections.";
    } else if (category === "DRIVE_API_NOT_ENABLED") {
      userMessage = "Google Drive API is not enabled in your Google Cloud Project. Please enable it in the Google Cloud Console.";
    } else if (category === "INSUFFICIENT_SCOPES") {
      userMessage = 'Insufficient permissions: Google account lacks the required "drive.readonly" scope. Please reconnect with full permissions.';
    } else if (category === "NO_SPREADSHEETS_FOUND") {
      userMessage = "No spreadsheets found in your Google Drive (mimeType='application/vnd.google-apps.spreadsheet' and trashed=false).";
      return res.status(200).json({
        spreadsheets: [],
        connected: true,
        accountEmail: account.externalAccountId,
        emptyReason: "NO_SPREADSHEETS_FOUND",
        message: userMessage
      });
    }
    res.status(status >= 400 && status < 600 ? status : 500).json({
      error: {
        code: category,
        status,
        googleMessage,
        message: userMessage
      },
      connected: true,
      accountEmail: account.externalAccountId
    });
  }
});
app.get("/api/google/schema", async (req, res) => {
  const objectId = req.query.objectId;
  if (!objectId) {
    return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Missing objectId" } });
  }
  const session = await resolveVerifiedSession(req);
  let account = db.accounts.find((a) => a.workspaceId === session.workspaceId && a.connectorKey === "google_sheets");
  if (!account) {
    const list = await supabaseRepo.getConnectedAccounts(session.workspaceId, session.userId).catch(() => []);
    account = list.find((a) => a.connectorKey === "google_sheets");
  }
  if (!account) {
    return res.status(400).json({ error: { code: "NOT_CONNECTED", message: "Google Sheets not connected" } });
  }
  try {
    const conn = getConnector("google_sheets");
    const schema = await conn.getSchema(account, { id: objectId, name: objectId });
    res.json({ schema });
  } catch (err) {
    res.status(500).json({ error: { code: "SCHEMA_FETCH_FAILED", message: err.message || String(err) } });
  }
});
app.post("/api/syncs/create-simple", requireRole(["owner", "admin", "member"]), async (req, res) => {
  try {
    const { name, sourceDatasetId, destObjectId, destObjectName, mappings, keyColumn, runNow } = req.body;
    const session = req.verifiedSession || await resolveVerifiedSession(req);
    const workspaceId = session.workspaceId;
    const userId = session.userId;
    if (!sourceDatasetId || !destObjectId || !mappings || mappings.length === 0) {
      return res.status(400).json({ error: { code: "BAD_REQUEST", message: "Source, destination, and mappings are required" } });
    }
    const csvDataset = await supabaseRepo.getCsvDatasetById(sourceDatasetId) || db.getCsvDatasetById(sourceDatasetId);
    if (!csvDataset) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Source CSV dataset not found" } });
    }
    let sheetsAccount = db.accounts.find((a) => a.workspaceId === workspaceId && a.connectorKey === "google_sheets");
    if (!sheetsAccount) {
      const accountsList = await supabaseRepo.getConnectedAccounts(workspaceId, userId).catch(() => []);
      sheetsAccount = accountsList.find((a) => a.connectorKey === "google_sheets");
    }
    if (!sheetsAccount) {
      return res.status(400).json({ error: { code: "NOT_CONNECTED", message: "Google Sheets account not connected" } });
    }
    let endpointA = db.endpoints.find((e) => e.workspaceId === workspaceId && e.connectorId === "csv" && e.objectRef.id === sourceDatasetId);
    if (!endpointA) {
      endpointA = {
        id: `ep_csv_${sourceDatasetId}`,
        workspaceId,
        connectorId: "csv",
        role: "source",
        objectRef: {
          id: sourceDatasetId,
          name: csvDataset.name,
          type: "csv_dataset",
          recordCount: csvDataset.rowCount
        },
        schemaSnapshot: {
          objectId: sourceDatasetId,
          name: csvDataset.name,
          fields: csvDataset.columns.map((c) => ({
            key: c.key,
            label: c.label,
            type: c.type,
            required: false,
            readOnly: false
          }))
        },
        schemaFetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      db.endpoints.push(endpointA);
    }
    let endpointB = db.endpoints.find(
      (e) => e.workspaceId === workspaceId && e.connectorId === "google_sheets" && e.objectRef.id === destObjectId
    );
    if (!endpointB) {
      endpointB = {
        id: `ep_sheets_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        workspaceId,
        connectedAccountId: sheetsAccount.id,
        connectorId: "google_sheets",
        role: "destination",
        objectRef: {
          id: destObjectId,
          name: destObjectName || destObjectId,
          type: "spreadsheet"
        },
        schemaFetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      db.endpoints.push(endpointB);
    }
    const syncId = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newSync = {
      id: syncId,
      workspaceId,
      name: name || `${csvDataset.name} -> Google Sheets`,
      endpointAId: endpointA.id,
      endpointBId: endpointB.id,
      direction: "a_to_b",
      conflictRule: "source_wins",
      triggerMode: "manual",
      intervalMinutes: 15,
      deleteBehavior: "ignore",
      status: "active",
      createdBy: userId,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db.syncConfigs.push(newSync);
    const fieldMappingRows = mappings.map((m, idx) => ({
      id: `map_${syncId}_${idx + 1}`,
      syncConfigId: syncId,
      sourceFieldKey: m.sourceFieldKey,
      destinationFieldKey: m.destinationFieldKey,
      isKey: m.sourceFieldKey === keyColumn || m.isKey === true,
      required: m.required ?? false,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }));
    db.mappings.push(...fieldMappingRows);
    db.saveToStorage();
    db.logAudit("sync.created", "sync_config", syncId, { name: newSync.name });
    await supabaseRepo.saveSyncConfiguration(newSync, fieldMappingRows, {
      sourceDatasetId,
      destAccountId: sheetsAccount.id,
      destResourceId: destObjectId,
      destResourceName: destObjectName
    }).catch(() => {
    });
    let runId = void 0;
    if (runNow) {
      runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await queueBackgroundSyncJob(syncId, runId);
    }
    res.status(201).json({
      success: true,
      syncId,
      runId,
      sync: newSync
    });
  } catch (err) {
    res.status(500).json({ error: { code: "SYNC_CREATE_FAILED", message: err.message || String(err) } });
  }
});
async function startServer() {
  const distCandidates = [
    path.resolve(__dirname, "dist"),
    path.resolve(__dirname, "../dist"),
    path.resolve(process.cwd(), "dist")
  ];
  const distDir = distCandidates.find((dir) => fs.existsSync(path.join(dir, "index.html")));
  if (process.env.NODE_ENV === "production" || distDir) {
    if (distDir) {
      app.use(express.static(distDir));
      app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api/")) {
          return next();
        }
        res.sendFile(path.join(distDir, "index.html"));
      });
    } else {
      app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api/")) {
          return next();
        }
        res.status(200).send("Dataloop API server running (production mode)");
      });
    }
  } else {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true, host: HOST, port: PORT, hmr: false },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn("[Dataloop Server] Vite dev server middleware could not be loaded, continuing in API mode:", err);
    }
  }
  app.listen(PORT, HOST, () => {
    console.log(`[Dataloop Server] Running on http://${HOST}:${PORT} (PORT=${PORT})`);
  });
}
startServer().catch((err) => {
  console.error("[Dataloop Server] Failed to start server:", err);
  process.exit(1);
});
export {
  resolveVerifiedSession
};
