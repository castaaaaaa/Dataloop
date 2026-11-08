# OAUTH SCOPES SPECIFICATION

Dataloop enforces least-privilege OAuth scopes across all integrations. Scopes are requested only when required by user-configured sync directions.

| Connector | Requested Scopes | Technical Reason & Least-Privilege Justification |
|-----------|------------------|--------------------------------------------------|
| **Google Sheets** | `https://www.googleapis.com/auth/spreadsheets` | Read and write cells in Google Spreadsheets selected by the user. Does not request full Google Drive or Gmail access. |
| **Airtable** | `data.records:read`<br>`data.records:write`<br>`schema.bases:read` | Scoped strictly to records in user-authorized bases and discovering table columns. Does not request webhook management or enterprise account scopes. |
| **Notion** | `read_content`<br>`update_content`<br>`insert_content` | Allows reading database properties and inserting/updating page items within Notion databases explicitly shared with the integration. |
| **HubSpot** | `crm.objects.contacts.read`<br>`crm.objects.contacts.write`<br>`crm.objects.companies.read`<br>`crm.objects.deals.read` | Scoped strictly to standard CRM objects (Contacts, Companies, Deals). No access to marketing emails, website CMS, or billing settings. |
| **CSV** | `None` | Processed client-side and stored securely in the workspace database. No third-party OAuth scopes required. |

---

## Google Cloud Console OAuth Credentials Setup

When creating an **OAuth 2.0 Client ID** (Application type: **Web application**) in Google Cloud Console:

### 1. Authorized Redirect URIs
Register the following exact URLs in Google Cloud:
- **Preview / Development App**:
  `https://ais-dev-5fc33odwbps3chunqhs7dv-315205334705.europe-west1.run.app/api/auth/google/callback`
- **Production / Pre-prod App**:
  `https://ais-pre-5fc33odwbps3chunqhs7dv-315205334705.europe-west1.run.app/api/auth/google/callback`
- **Local Development**:
  `http://localhost:3000/api/auth/google/callback`

### 2. Exact Callback Path Used in Code
The server routes handle the callback at:
- `/api/auth/google/callback`
*(Alias `/api/auth/callback/google` is also supported)*

### 3. Authorized JavaScript Origins
- `https://ais-dev-5fc33odwbps3chunqhs7dv-315205334705.europe-west1.run.app`
- `https://ais-pre-5fc33odwbps3chunqhs7dv-315205334705.europe-west1.run.app`
- `http://localhost:3000`
