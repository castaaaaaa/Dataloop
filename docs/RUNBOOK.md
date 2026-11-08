# PRODUCTION OPERATIONS RUNBOOK

## 1. Dead-Letter Queue Management & Replay
When a sync event exhausts its 6 retry attempts (e.g. Due to permanent schema mismatch or vendor HTTP 400 error), it enters the `dead_letters` table.

### Single Event Replay
1. Navigate to **Health & Errors** → **Dead-Letter Queue**.
2. Click on the affected event to inspect the payload and vendor error message.
3. Once the root cause (e.g. Missing required property) is resolved in Field Mappings, click **Replay**.
4. The system will requeue the write using its original idempotency key.

### Bulk Replay
1. Navigate to **Health & Errors** → **Dead-Letter Queue**.
2. Click **Replay All Open Dead Letters**.
3. All open dead letters are re-evaluated against current field mappings.

---

## 2. Encryption Key Rotation Procedure
Dataloop uses envelope encryption with key version prefixes (e.g. `v1:...`, `v2:...`).

### Step-by-Step Rotation
1. Generate a new 32-byte hex key:
   ```bash
   openssl rand -hex 32
   ```
2. Set the new key as `ENCRYPTION_KEY_V2` in production environment secrets.
3. Deploy key rotation migration script:
   - Reads every `encrypted_access_token` with `key_version = 'v1'`.
   - Decrypts with `ENCRYPTION_KEY_V1`.
   - Re-encrypts with `ENCRYPTION_KEY_V2`.
   - Updates `key_version` to `'v2'`.
4. Decommission `ENCRYPTION_KEY_V1` after zero records remain on v1.

---

## 3. Handling Vendor Outages & Rate Limit Spikes
If a vendor (e.g. Google Sheets or Airtable) experiences an outage or elevated 5xx/429 errors:
1. The **Circuit Breaker** automatically trips after 5 consecutive failures for that account.
2. The account status shifts to `paused (provider issue)` with a 60-second cooldown window.
3. Affected sync runs are paused rather than spamming the vendor API.
4. Once the vendor returns 200 OK responses, the circuit breaker resets to closed and normal polling resumes.
