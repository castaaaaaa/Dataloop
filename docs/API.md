# REST API REFERENCE (V1)

Base URL: `/api/v1`  
Authentication: `Authorization: Bearer <api_key>`  
Content-Type: `application/json`

---

### 1. List Syncs
`GET /api/v1/syncs`

#### Response `200 OK`
```json
{
  "syncs": [
    {
      "id": "sync_sheets_airtable_twoway",
      "name": "Airtable Clients ↔ Google Sheets Pipeline",
      "direction": "two_way",
      "status": "active",
      "triggerMode": "scheduled",
      "intervalMinutes": 15,
      "lastRunAt": "2026-10-24T09:45:00Z",
      "nextRunAt": "2026-10-24T10:00:00Z"
    }
  ]
}
```

---

### 2. Get Sync Details
`GET /api/v1/syncs/:id`

#### Response `200 OK`
```json
{
  "sync": {
    "id": "sync_sheets_airtable_twoway",
    "name": "Airtable Clients ↔ Google Sheets Pipeline",
    "direction": "two_way",
    "conflictRule": "manual"
  },
  "mappings": [
    {
      "id": "map_01",
      "sourceFieldKey": "email_address",
      "destinationFieldKey": "email",
      "isKey": true,
      "required": true
    }
  ],
  "recentRuns": []
}
```

---

### 3. Trigger a Sync Run
`POST /api/v1/syncs/:id/run`

Query parameter: `dry_run=true` (optional: executes simulation without writes)

#### Response `200 OK`
```json
{
  "runId": "run_1729764500000",
  "status": "succeeded",
  "isDryRun": false,
  "stats": {
    "recordsRead": 42,
    "created": 1,
    "updated": 2,
    "deleted": 0,
    "skipped": 39,
    "conflicts": 0,
    "failed": 0
  }
}
```

---

### 4. Get Run Status
`GET /api/v1/runs/:id`

#### Response `200 OK`
```json
{
  "run": {
    "id": "run_1729764500000",
    "syncConfigId": "sync_sheets_airtable_twoway",
    "trigger": "api",
    "status": "succeeded",
    "recordsRead": 42,
    "created": 1,
    "updated": 2
  },
  "events": []
}
```

---

### Error Responses
All API errors return consistent JSON shapes:
```json
{
  "error": {
    "code": "SYNC_NOT_FOUND",
    "message": "Sync sync_123 does not exist."
  }
}
```
