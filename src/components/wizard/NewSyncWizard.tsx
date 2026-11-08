import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../../lib/db/store';
import { useAuth } from '../../lib/auth/AuthContext';
import { CsvDatasetRow } from '../../lib/db/schema';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Upload,
  Link2,
  Play,
  Plus,
  Trash2,
  AlertCircle,
  FileText,
  KeyRound,
  ExternalLink,
  RefreshCw,
  Loader2
} from 'lucide-react';

export interface SheetsErrorDetails {
  category: 'TOKEN_EXPIRED' | 'DRIVE_API_NOT_ENABLED' | 'INSUFFICIENT_SCOPES' | 'NO_SPREADSHEETS_FOUND' | 'GOOGLE_ERROR';
  status?: number;
  googleMessage: string;
  userMessage?: string;
}

interface NewSyncWizardProps {
  onClose: () => void;
  onCompleted: (syncId: string) => void;
}

interface MappingItem {
  id: string;
  sourceFieldKey: string;
  destinationFieldKey: string;
  isKey: boolean;
}

export const NewSyncWizard: React.FC<NewSyncWizardProps> = ({ onClose, onCompleted }) => {
  const { user, session } = useAuth();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [syncName, setSyncName] = useState('');

  // Step 1: CSV Source
  const [csvDatasets, setCsvDatasets] = useState<CsvDatasetRow[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [csvUploadError, setCsvUploadError] = useState<string | null>(null);

  // Step 2: Google Sheets Destination
  const [sheetsConnected, setSheetsConnected] = useState<boolean>(false);
  const [connectedAccountEmail, setConnectedAccountEmail] = useState<string>('');
  const [spreadsheets, setSpreadsheets] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string>('');
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [sheetsError, setSheetsError] = useState<SheetsErrorDetails | null>(null);

  // Step 3: Schema & Mapping
  const [sourceColumns, setSourceColumns] = useState<Array<{ key: string; label: string; type: string }>>([]);
  const [destHeaders, setDestHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<MappingItem[]>([]);
  const [keyColumn, setKeyColumn] = useState<string>('');
  const [isLoadingSchema, setIsLoadingSchema] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // In-memory schema cache to reuse across steps without re-fetching
  const schemaCacheRef = useRef<Map<string, string[]>>(new Map());

  // Step 4: Execution
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Plan limits check
  const currentPlan = db.getCurrentPlan();
  const activeSyncsCount = db.getSyncConfigs().filter((s: any) => s.status !== 'archived').length;
  const isSyncLimitReached = activeSyncsCount >= currentPlan.limits.maxActiveSyncs;

  // Load initial CSV datasets and check Google Sheets connection
  useEffect(() => {
    loadCsvDatasets();
    checkGoogleConnection();
  }, []);

  const loadCsvDatasets = () => {
    const list = db.getCsvDatasets();
    setCsvDatasets(list);
    if (list.length > 0 && !selectedDatasetId) {
      setSelectedDatasetId(list[0].id);
      setSourceColumns(list[0].columns);
    }
  };

  const checkGoogleConnection = async () => {
    setIsLoadingSheets(true);
    setSheetsError(null);
    try {
      const headers: Record<string, string> = {
        'x-workspace-id': db.currentWorkspaceId
      };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (user?.id) headers['x-user-id'] = user.id;

      const res = await fetch('/api/google/spreadsheets', { headers });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSheetsConnected(Boolean(data.connected));
        setConnectedAccountEmail(data.accountEmail || '');
        const list = data.spreadsheets || [];
        setSpreadsheets(list);

        if (list.length > 0) {
          const firstSheetId = list[0].id;
          setSelectedObjectId(firstSheetId);
          setSheetsError(null);
          // Start loading Google Sheet headers as early as possible in step 2!
          loadSheetSchema(firstSheetId);
        } else if (data.emptyReason === 'NO_SPREADSHEETS_FOUND' || (data.connected && list.length === 0)) {
          setSheetsError({
            category: 'NO_SPREADSHEETS_FOUND',
            status: 200,
            googleMessage: 'No spreadsheets returned by Drive API query: mimeType=\'application/vnd.google-apps.spreadsheet\' and trashed=false',
            userMessage: data.message || "No Google Spreadsheets were found in your Google Drive."
          });
        }
      } else {
        // Google error occurred (401, 403, 500 etc.)
        setSheetsConnected(Boolean(data.connected ?? true));
        setConnectedAccountEmail(data.accountEmail || '');
        const err = data.error || {};
        const status = err.status || res.status;
        const googleMessage = err.googleMessage || err.message || res.statusText || 'Google API error';
        const category = err.code || (status === 401 ? 'TOKEN_EXPIRED' : 'GOOGLE_ERROR');

        setSheetsError({
          category,
          status,
          googleMessage,
          userMessage: err.message
        });
      }
    } catch (err: any) {
      setSheetsError({
        category: 'GOOGLE_ERROR',
        status: 500,
        googleMessage: err?.message || String(err),
        userMessage: 'Failed to communicate with the Google Sheets integration server.'
      });
    } finally {
      setIsLoadingSheets(false);
    }
  };

  // When source dataset changes, update source columns
  useEffect(() => {
    if (selectedDatasetId) {
      const ds = csvDatasets.find((d) => d.id === selectedDatasetId);
      if (ds) {
        setSourceColumns(ds.columns);
        if (!syncName || syncName.startsWith('Sync: ')) {
          setSyncName(`Sync: ${ds.name} -> Google Sheets`);
        }
      }
    }
  }, [selectedDatasetId, csvDatasets]);

  // Auto-match source columns and destination headers
  const autoMatchFields = useCallback((sources: Array<{ key: string; label: string }>, dests: string[]) => {
    const matched: MappingItem[] = [];
    let detectedKey = '';

    sources.forEach((sc) => {
      // Find matching destination header
      const match = dests.find(
        (dh) =>
          dh.toLowerCase() === sc.key.toLowerCase() ||
          dh.toLowerCase().replace(/[^a-z0-9]/g, '') === sc.key.toLowerCase().replace(/[^a-z0-9]/g, '') ||
          dh.toLowerCase().includes(sc.key.toLowerCase()) ||
          sc.key.toLowerCase().includes(dh.toLowerCase())
      );

      const isKeyCandidate = sc.key.toLowerCase().includes('email') || sc.key.toLowerCase() === 'id';
      if (isKeyCandidate && !detectedKey) {
        detectedKey = sc.key;
      }

      matched.push({
        id: `map_${sc.key}`,
        sourceFieldKey: sc.key,
        destinationFieldKey: match || dests[0] || sc.key,
        isKey: isKeyCandidate
      });
    });

    setMappings(matched);
    if (detectedKey) {
      setKeyColumn(detectedKey);
    } else if (sources.length > 0) {
      setKeyColumn(sources[0].key);
    }
  }, []);

  // Fetch sheet headers as early as possible with 15-second timeout and retry
  const loadSheetSchema = useCallback(
    async (objectId: string, force = false) => {
      if (!objectId) return;

      // Check client in-memory cache first
      if (!force && schemaCacheRef.current.has(objectId)) {
        const cached = schemaCacheRef.current.get(objectId)!;
        setDestHeaders(cached);
        setSchemaError(null);
        setIsLoadingSchema(false);
        autoMatchFields(sourceColumns, cached);
        return;
      }

      setIsLoadingSchema(true);
      setSchemaError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 15000); // 15-second timeout requirement

      try {
        const headers: Record<string, string> = {
          'x-workspace-id': db.currentWorkspaceId
        };
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
        if (user?.id) headers['x-user-id'] = user.id;

        const res = await fetch(`/api/google/schema?objectId=${encodeURIComponent(objectId)}`, {
          headers,
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Failed to read sheet headers (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (data.schema && data.schema.fields) {
          const fieldKeys = data.schema.fields.map((f: any) => f.key);
          schemaCacheRef.current.set(objectId, fieldKeys);
          setDestHeaders(fieldKeys);
          setSchemaError(null);
          autoMatchFields(sourceColumns, fieldKeys);
        } else {
          setDestHeaders([]);
        }
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          setSchemaError('Request timed out after 15 seconds reading Google Sheet headers. Please check your connection or retry.');
        } else {
          setSchemaError(err.message || 'Failed to read columns from Google Sheet.');
        }
      } finally {
        setIsLoadingSchema(false);
      }
    },
    [session, user, sourceColumns, autoMatchFields]
  );

  // When selected spreadsheet/tab changes in Step 2, fetch headers early
  useEffect(() => {
    if (selectedObjectId && sheetsConnected) {
      loadSheetSchema(selectedObjectId);
    }
  }, [selectedObjectId, sheetsConnected, loadSheetSchema]);

  // Ensure schema is triggered when Step 3 opens if not already cached
  useEffect(() => {
    if (currentStep === 3 && selectedObjectId && !schemaCacheRef.current.has(selectedObjectId) && !isLoadingSchema && !schemaError) {
      loadSheetSchema(selectedObjectId);
    }
  }, [currentStep, selectedObjectId, isLoadingSchema, schemaError, loadSheetSchema]);

  // Handle CSV file upload directly in builder
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setCsvUploadError('File size exceeds the 10 MB maximum limit.');
      return;
    }

    setIsUploadingCsv(true);
    setCsvUploadError(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-workspace-id': db.currentWorkspaceId
        };
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
        if (user?.id) headers['x-user-id'] = user.id;

        const res = await fetch('/api/csv/upload', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: file.name.replace(/\.[^/.]+$/, ''),
            filename: file.name,
            content
          })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error?.message || 'Failed to upload CSV');
        }

        const data = await res.json();
        loadCsvDatasets();
        setSelectedDatasetId(data.datasetId);
        setSourceColumns(data.columns);
        setSyncName(`Sync: ${data.name} -> Google Sheets`);
      } catch (err: any) {
        setCsvUploadError(err.message || 'Error processing CSV file.');
      } finally {
        setIsUploadingCsv(false);
      }
    };
    reader.readAsText(file);
  };

  const handleUpdateMappingDest = (index: number, newDest: string) => {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, destinationFieldKey: newDest } : m)));
  };

  const handleRemoveMapping = (index: number) => {
    setMappings((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddMapping = () => {
    if (sourceColumns.length === 0) return;
    const firstCol = sourceColumns[0].key;
    const firstDest = destHeaders[0] || firstCol;
    setMappings((prev) => [
      ...prev,
      {
        id: `map_${Date.now()}`,
        sourceFieldKey: firstCol,
        destinationFieldKey: firstDest,
        isKey: false
      }
    ]);
  };

  // Submit and create pipeline, then optionally run immediately
  const handleFinalSubmit = async (runNow: boolean) => {
    if (!selectedDatasetId) {
      setSubmitError('Please select a source CSV dataset.');
      return;
    }
    if (!selectedObjectId) {
      setSubmitError('Please select a destination Google Sheet and tab.');
      return;
    }
    if (mappings.length === 0) {
      setSubmitError('At least one field mapping is required.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const selectedSpreadsheet = spreadsheets.find((s) => s.id === selectedObjectId);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-workspace-id': db.currentWorkspaceId
      };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
      if (user?.id) headers['x-user-id'] = user.id;

      const res = await fetch('/api/syncs/create-simple', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: syncName.trim() || 'CSV to Google Sheets Pipeline',
          sourceDatasetId: selectedDatasetId,
          destObjectId: selectedObjectId,
          destObjectName: selectedSpreadsheet ? selectedSpreadsheet.name : selectedObjectId,
          mappings,
          keyColumn,
          runNow
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || err.error || err.message || 'Failed to create sync pipeline.');
      }

      const data = await res.json();
      onCompleted(data.syncId);
    } catch (err: any) {
      setSubmitError(err.message || 'An error occurred during pipeline creation.');
      setIsSubmitting(false);
    }
  };

  const selectedDataset = csvDatasets.find((d) => d.id === selectedDatasetId);
  const selectedSpreadsheet = spreadsheets.find((s) => s.id === selectedObjectId);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        className="w-full max-w-[800px] max-h-[90vh] rounded-[8px] border flex flex-col overflow-hidden shadow-2xl"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-main)'
        }}
      >
        {/* Wizard Top Header */}
        <div
          className="p-5 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              New Sync Pipeline
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Step {currentStep} of 4: {currentStep === 1 ? 'Choose Source CSV' : currentStep === 2 ? 'Choose Destination Sheet' : currentStep === 3 ? 'Map Fields & Key' : 'Review & Run'}
            </p>
          </div>

          {/* Step Pill Indicators */}
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className="w-2.5 h-2.5 rounded-full transition-colors"
                style={{
                  backgroundColor:
                    step === currentStep
                      ? 'var(--accent)'
                      : step < currentStep
                      ? 'var(--status-success)'
                      : 'var(--border-main)'
                }}
              />
            ))}
          </div>
        </div>

        {/* Wizard Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {submitError && (
            <div
              className="p-3 rounded-[6px] border flex items-center gap-2 text-[12px]"
              style={{
                backgroundColor: 'var(--bg-raised)',
                borderColor: 'var(--status-danger)',
                color: 'var(--status-danger)'
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {isSyncLimitReached && (
            <div
              className="p-3 rounded-[6px] border flex items-start gap-2.5 text-[12px]"
              style={{
                backgroundColor: 'var(--bg-raised)',
                borderColor: 'var(--status-danger)',
                color: 'var(--status-danger)'
              }}
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Sync limit reached ({activeSyncsCount} of {currentPlan.limits.maxActiveSyncs} syncs used)</span>
                <span className="text-[11px] opacity-90">
                  The {currentPlan.name} plan allows a maximum of {currentPlan.limits.maxActiveSyncs} sync pipelines. Delete an existing pipeline to create a new one.
                </span>
              </div>
            </div>
          )}

          {/* STEP 1: SOURCE CSV */}
          {currentStep === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Select or upload source CSV
                </h3>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Upload a dataset (max 10 MB, up to 50,000 rows). Columns and data types are automatically inferred.
                </p>
              </div>

              {/* Upload Box */}
              <label
                className="border-2 border-dashed rounded-[6px] p-6 text-center flex flex-col items-center justify-center cursor-pointer transition-colors"
                style={{
                  borderColor: 'var(--border-main)',
                  backgroundColor: 'var(--bg-raised)'
                }}
              >
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploadingCsv}
                />
                <Upload className="w-6 h-6 mb-2" style={{ color: 'var(--accent)' }} />
                <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  {isUploadingCsv ? 'Parsing CSV & inferring types...' : 'Click to upload CSV or drag and drop'}
                </span>
                <span className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                  Max 10 MB · Max 50,000 rows · RFC 4180 compliant
                </span>
              </label>

              {csvUploadError && (
                <p className="text-[12px]" style={{ color: 'var(--status-danger)' }}>
                  {csvUploadError}
                </p>
              )}

              {/* Existing Datasets List */}
              {csvDatasets.length > 0 && (
                <div className="space-y-2">
                  <label className="text-[12px] font-medium block" style={{ color: 'var(--text-secondary)' }}>
                    Or select an existing workspace dataset:
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {csvDatasets.map((ds) => {
                      const isSelected = ds.id === selectedDatasetId;
                      return (
                        <div
                          key={ds.id}
                          onClick={() => setSelectedDatasetId(ds.id)}
                          className="p-3 rounded-[6px] border flex items-center justify-between cursor-pointer transition-colors"
                          style={{
                            backgroundColor: isSelected ? 'var(--bg-raised)' : 'var(--bg-card)',
                            borderColor: isSelected ? 'var(--accent)' : 'var(--border-main)'
                          }}
                        >
                          <div className="flex items-center gap-2.5">
                            <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                            <div>
                              <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                {ds.name}
                              </div>
                              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                {ds.filename} · {ds.rowCount.toLocaleString()} rows · {ds.columns.length} columns · {(ds.fileSize / 1024).toFixed(1)} KB
                              </div>
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedDataset && (
                <div
                  className="p-3.5 rounded-[6px] border text-[12px] space-y-2"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }}
                >
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                    Detected Columns ({selectedDataset.columns.length}):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedDataset.columns.map((col) => (
                      <span
                        key={col.key}
                        className="px-2 py-0.5 rounded-[4px] border text-[11px] font-mono"
                        style={{
                          backgroundColor: 'var(--bg-raised)',
                          borderColor: 'var(--border-subtle)',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        {col.label} <span style={{ color: 'var(--accent)' }}>({col.type})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: DESTINATION GOOGLE SHEETS */}
          {currentStep === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Select destination Google Sheet
                </h3>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Connect your Google account and select the spreadsheet and tab to write records into.
                </p>
              </div>

              {!sheetsConnected ? (
                <div
                  className="p-8 rounded-[6px] border text-center space-y-3"
                  style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border-main)' }}
                >
                  <FileSpreadsheet className="w-8 h-8 mx-auto" style={{ color: 'var(--accent)' }} />
                  <div>
                    <h4 className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>
                      Google Sheets is not connected yet
                    </h4>
                    <p className="text-[12px] max-w-sm mx-auto mt-1" style={{ color: 'var(--text-muted)' }}>
                      Authorize with Google using the narrowest scopes to list and write spreadsheets.
                    </p>
                  </div>
                  <a
                    href={`/api/auth/google?workspaceId=${encodeURIComponent(db.currentWorkspaceId)}&userId=${encodeURIComponent(db.currentUserId)}`}
                    className="inline-flex items-center gap-1.5 h-8 px-4 rounded-[6px] text-[12px] font-medium transition-colors"
                    style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Connect Google Sheets with OAuth</span>
                  </a>
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    className="p-3 rounded-[6px] border flex items-center justify-between text-[12px]"
                    style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border-subtle)' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--status-success)' }} />
                      <span style={{ color: 'var(--text-primary)' }}>
                        Connected account: <strong>{connectedAccountEmail || 'Authorized Google Account'}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={checkGoogleConnection}
                      className="text-[11px] underline cursor-pointer"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Refresh sheets
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[12px] font-medium block" style={{ color: 'var(--text-secondary)' }}>
                      Choose spreadsheet and tab:
                    </label>

                    {isLoadingSheets ? (
                      <div className="text-[12px] p-6 text-center border rounded-[6px]" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
                        <RefreshCw className="w-4 h-4 mx-auto mb-2 animate-spin" />
                        Fetching your Google Spreadsheets via Drive API...
                      </div>
                    ) : sheetsError ? (
                      <div className="space-y-3">
                        {/* 1. Token expired or revoked */}
                        {sheetsError.category === 'TOKEN_EXPIRED' && (
                          <div
                            className="p-4 rounded-[6px] border space-y-2.5 text-left"
                            style={{
                              backgroundColor: 'var(--bg-raised)',
                              borderColor: 'var(--status-warning)'
                            }}
                          >
                            <div className="flex items-center gap-2 font-medium text-[13px]" style={{ color: 'var(--status-warning)' }}>
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>Token expired or revoked (HTTP {sheetsError.status || 401})</span>
                            </div>
                            <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                              Your Google access token has expired or was revoked. Please reconnect your Google account to issue a fresh offline refresh token.
                            </p>
                            <div className="text-[11px] font-mono p-2 rounded border break-all" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
                              Google error: {sheetsError.googleMessage}
                            </div>
                            <div className="pt-1">
                              <a
                                href={`/api/auth/google?workspaceId=${encodeURIComponent(db.currentWorkspaceId)}&userId=${encodeURIComponent(db.currentUserId)}`}
                                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[11px] font-medium transition-colors"
                                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Reconnect Google Account</span>
                              </a>
                            </div>
                          </div>
                        )}

                        {/* 2. Drive API not enabled */}
                        {sheetsError.category === 'DRIVE_API_NOT_ENABLED' && (
                          <div
                            className="p-4 rounded-[6px] border space-y-2.5 text-left"
                            style={{
                              backgroundColor: 'var(--bg-raised)',
                              borderColor: 'var(--status-danger)'
                            }}
                          >
                            <div className="flex items-center gap-2 font-medium text-[13px]" style={{ color: 'var(--status-danger)' }}>
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>Drive API not enabled (HTTP {sheetsError.status || 403})</span>
                            </div>
                            <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                              The Google Drive API is not enabled in your Google Cloud Project. It must be enabled to list spreadsheets via <code>files.list</code>.
                            </p>
                            <div className="text-[11px] font-mono p-2 rounded border break-all" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
                              Google error: {sheetsError.googleMessage}
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <a
                                href="https://console.cloud.google.com/apis/library/drive.googleapis.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[11px] font-medium border"
                                style={{ borderColor: 'var(--border-main)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-card)' }}
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Enable Drive API in Google Cloud</span>
                              </a>
                              <button
                                type="button"
                                onClick={checkGoogleConnection}
                                className="inline-flex items-center gap-1 h-7 px-3 rounded-[6px] text-[11px] font-medium"
                                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Check again</span>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 3. Insufficient scopes */}
                        {sheetsError.category === 'INSUFFICIENT_SCOPES' && (
                          <div
                            className="p-4 rounded-[6px] border space-y-2.5 text-left"
                            style={{
                              backgroundColor: 'var(--bg-raised)',
                              borderColor: 'var(--status-warning)'
                            }}
                          >
                            <div className="flex items-center gap-2 font-medium text-[13px]" style={{ color: 'var(--status-warning)' }}>
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>Insufficient scopes (HTTP {sheetsError.status || 403})</span>
                            </div>
                            <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                              Missing permission scopes. Google Sheets requires the <code>https://www.googleapis.com/auth/drive.readonly</code> and <code>https://www.googleapis.com/auth/spreadsheets</code> scopes.
                            </p>
                            <div className="text-[11px] font-mono p-2 rounded border break-all" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
                              Google error: {sheetsError.googleMessage}
                            </div>
                            <div className="pt-1">
                              <a
                                href={`/api/auth/google?workspaceId=${encodeURIComponent(db.currentWorkspaceId)}&userId=${encodeURIComponent(db.currentUserId)}`}
                                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[11px] font-medium"
                                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Reconnect & Grant Full Scopes</span>
                              </a>
                            </div>
                          </div>
                        )}

                        {/* 4. No spreadsheets found */}
                        {sheetsError.category === 'NO_SPREADSHEETS_FOUND' && (
                          <div
                            className="p-6 rounded-[6px] border text-center space-y-3"
                            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                          >
                            <FileSpreadsheet className="w-7 h-7 mx-auto" style={{ color: 'var(--text-muted)' }} />
                            <div>
                              <h4 className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                No spreadsheets found
                              </h4>
                              <p className="text-[12px] max-w-sm mx-auto mt-1" style={{ color: 'var(--text-muted)' }}>
                                No Google Spreadsheets were found in your Google Drive matching filter: <code>mimeType='application/vnd.google-apps.spreadsheet' and trashed=false</code>.
                              </p>
                            </div>
                            <div className="flex items-center justify-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={checkGoogleConnection}
                                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[11px] font-medium border"
                                style={{
                                  backgroundColor: 'var(--bg-raised)',
                                  borderColor: 'var(--border-main)',
                                  color: 'var(--text-primary)'
                                }}
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Refresh Drive list</span>
                              </button>
                              <a
                                href="https://sheets.new"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[11px] font-medium border"
                                style={{
                                  borderColor: 'var(--border-main)',
                                  color: 'var(--text-secondary)'
                                }}
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Create new Google Sheet</span>
                              </a>
                            </div>
                          </div>
                        )}

                        {/* 5. Generic Google API Error */}
                        {sheetsError.category === 'GOOGLE_ERROR' && (
                          <div
                            className="p-4 rounded-[6px] border space-y-2.5 text-left"
                            style={{
                              backgroundColor: 'var(--bg-raised)',
                              borderColor: 'var(--status-danger)'
                            }}
                          >
                            <div className="flex items-center gap-2 font-medium text-[13px]" style={{ color: 'var(--status-danger)' }}>
                              <AlertCircle className="w-4 h-4 shrink-0" />
                              <span>Google API error (HTTP {sheetsError.status || 500})</span>
                            </div>
                            <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                              {sheetsError.userMessage || 'An error occurred while querying the Google Drive API.'}
                            </p>
                            <div className="text-[11px] font-mono p-2 rounded border break-all" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}>
                              Google error: {sheetsError.googleMessage}
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={checkGoogleConnection}
                                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[11px] font-medium border"
                                style={{
                                  backgroundColor: 'var(--bg-raised)',
                                  borderColor: 'var(--border-main)',
                                  color: 'var(--text-primary)'
                                }}
                              >
                                <RefreshCw className="w-3 h-3" />
                                <span>Retry</span>
                              </button>
                              <a
                                href={`/api/auth/google?workspaceId=${encodeURIComponent(db.currentWorkspaceId)}&userId=${encodeURIComponent(db.currentUserId)}`}
                                className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[11px] font-medium"
                                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
                              >
                                <span>Reconnect</span>
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <select
                        value={selectedObjectId}
                        onChange={(e) => {
                          const newId = e.target.value;
                          setSelectedObjectId(newId);
                          loadSheetSchema(newId);
                        }}
                        className="w-full h-9 px-3 text-[13px] rounded-[6px] border outline-none font-sans"
                        style={{
                          backgroundColor: 'var(--bg-card)',
                          borderColor: 'var(--border-main)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        {spreadsheets.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {destHeaders.length > 0 && (
                    <div
                      className="p-3.5 rounded-[6px] border text-[12px] space-y-1.5"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                        Sheet Row 1 Header Columns ({destHeaders.length}):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {destHeaders.map((h) => (
                          <span
                            key={h}
                            className="px-2 py-0.5 rounded-[4px] border text-[11px] font-mono"
                            style={{
                              backgroundColor: 'var(--bg-raised)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-secondary)'
                            }}
                          >
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: FIELD MAPPINGS & UNIQUE KEY */}
          {currentStep === 3 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Field mapping & Unique key column
                </h3>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Fields have been auto-matched by name. Select which column uniquely correlates records (e.g. Email) to eliminate duplicates.
                </p>
              </div>

              {/* Unique Key Column Selector */}
              <div
                className="p-4 rounded-[6px] border space-y-2.5"
                style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border-main)' }}
              >
                <div className="flex items-center gap-1.5 text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  <KeyRound className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  <span>Unique Correlation Key Column</span>
                </div>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  The sync engine uses this column to match records against the <code>record_links</code> table. If a row exists with the same key, it is updated; if unchanged, it is skipped without creating duplicates.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  {sourceColumns.map((col) => (
                    <label
                      key={col.key}
                      className="p-2 rounded-[6px] border flex items-center gap-2 cursor-pointer text-[12px]"
                      style={{
                        backgroundColor: keyColumn === col.key ? 'var(--bg-card)' : 'transparent',
                        borderColor: keyColumn === col.key ? 'var(--accent)' : 'var(--border-subtle)'
                      }}
                    >
                      <input
                        type="radio"
                        name="keyColumn"
                        checked={keyColumn === col.key}
                        onChange={() => setKeyColumn(col.key)}
                        className="accent-[var(--accent)]"
                      />
                      <span className="font-mono text-[11px]" style={{ color: 'var(--text-primary)' }}>
                        {col.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Mappings Table with Loading & Error States */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Field Mappings ({mappings.length}):
                  </label>
                  {!isLoadingSchema && !schemaError && (
                    <button
                      type="button"
                      onClick={handleAddMapping}
                      className="inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer"
                      style={{ color: 'var(--accent)' }}
                    >
                      <Plus className="w-3 h-3" /> Add mapping
                    </button>
                  )}
                </div>

                {isLoadingSchema ? (
                  <div
                    className="p-10 rounded-[6px] border flex flex-col items-center justify-center space-y-2.5 text-center"
                    style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
                  >
                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--accent)' }} />
                    <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                      Loading columns...
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Reading Row 1 header cells from Google Sheet
                    </span>
                  </div>
                ) : schemaError ? (
                  <div
                    className="p-4 rounded-[6px] border space-y-2.5"
                    style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--status-danger)' }}
                  >
                    <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: 'var(--status-danger)' }}>
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>Failed to load sheet columns</span>
                    </div>
                    <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{schemaError}</p>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => loadSheetSchema(selectedObjectId, true)}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-[6px] text-[11px] font-medium border cursor-pointer hover:bg-[var(--bg-card)]"
                        style={{
                          backgroundColor: 'var(--bg-card)',
                          borderColor: 'var(--border-main)',
                          color: 'var(--text-primary)'
                        }}
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="rounded-[6px] border overflow-hidden"
                    style={{ borderColor: 'var(--border-main)' }}
                  >
                    <table className="w-full text-left text-[12px]">
                      <thead
                        className="border-b text-[11px] font-medium"
                        style={{
                          backgroundColor: 'var(--bg-raised)',
                          borderColor: 'var(--border-main)',
                          color: 'var(--text-muted)'
                        }}
                      >
                        <tr>
                          <th className="py-2 px-3">CSV Column (Source)</th>
                          <th className="py-2 px-3">Arrow</th>
                          <th className="py-2 px-3">Google Sheet Column (Destination)</th>
                          <th className="py-2 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                        {mappings.map((m, idx) => (
                          <tr key={m.id}>
                            <td className="py-2 px-3 font-mono font-medium" style={{ color: 'var(--text-primary)' }}>
                              <div className="flex items-center gap-1.5">
                                {m.sourceFieldKey === keyColumn && (
                                  <KeyRound className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                                )}
                                <span>{m.sourceFieldKey}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-[var(--text-muted)]">
                              <ArrowRight className="w-3.5 h-3.5" />
                            </td>
                            <td className="py-2 px-3">
                              <select
                                value={m.destinationFieldKey}
                                onChange={(e) => handleUpdateMappingDest(idx, e.target.value)}
                                className="h-7 px-2 text-[12px] rounded-[4px] border outline-none font-mono"
                                style={{
                                  backgroundColor: 'var(--bg-card)',
                                  borderColor: 'var(--border-main)',
                                  color: 'var(--text-primary)'
                                }}
                              >
                                {destHeaders.map((dh) => (
                                  <option key={dh} value={dh}>
                                    {dh}
                                  </option>
                                ))}
                                {!destHeaders.includes(m.destinationFieldKey) && (
                                  <option value={m.destinationFieldKey}>{m.destinationFieldKey}</option>
                                )}
                              </select>
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveMapping(idx)}
                                className="text-[var(--text-muted)] hover:text-[var(--status-danger)] p-1 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW & RUN NOW */}
          {currentStep === 4 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Review & Execute
                </h3>
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Review pipeline details and choose whether to execute the sync run immediately.
                </p>
              </div>

              {/* Pipeline Name Input */}
              <div className="space-y-1">
                <label className="text-[12px] font-medium block" style={{ color: 'var(--text-secondary)' }}>
                  Pipeline Name
                </label>
                <input
                  type="text"
                  value={syncName}
                  onChange={(e) => setSyncName(e.target.value)}
                  placeholder="e.g. Marketing Leads to Google Sheets"
                  className="w-full h-8 px-3 text-[13px] rounded-[6px] border outline-none font-sans"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-main)',
                    color: 'var(--text-primary)'
                  }}
                />
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  className="p-3.5 rounded-[6px] border space-y-1.5"
                  style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border-main)' }}
                >
                  <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Source (CSV)
                  </div>
                  <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {selectedDataset?.name || 'CSV Dataset'}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {selectedDataset?.rowCount.toLocaleString()} rows · {mappings.length} columns mapped
                  </div>
                </div>

                <div
                  className="p-3.5 rounded-[6px] border space-y-1.5"
                  style={{ backgroundColor: 'var(--bg-raised)', borderColor: 'var(--border-main)' }}
                >
                  <div className="text-[11px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>
                    Destination (Google Sheets)
                  </div>
                  <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {selectedSpreadsheet?.name || selectedObjectId}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Unique Key: <code className="font-mono text-[var(--accent)]">{keyColumn}</code>
                  </div>
                </div>
              </div>

              {/* Engine Specs Box */}
              <div
                className="p-3.5 rounded-[6px] border text-[11px] space-y-1"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                <div className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Sync Engine Guarantees:
                </div>
                <div>• Background execution: Processed on the Node.js server via asynchronous job runner.</div>
                <div>• Deduplication: Hash comparison against <code>record_links</code> skips unchanged records.</div>
                <div>• Idempotency: Unique write key <code>syncId:runId:recordLinkId:action</code> prevents duplicates.</div>
                <div>• Reliability: Automatic retry with exponential backoff on HTTP 429 and 5xx errors.</div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Bottom Footer Actions */}
        <div
          className="p-4 border-t flex items-center justify-between"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-raised)' }}
        >
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-[6px] border text-[12px] font-medium cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-main)',
                color: 'var(--text-secondary)'
              }}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-3 rounded-[6px] border text-[12px] font-medium cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-main)',
                color: 'var(--text-muted)'
              }}
            >
              Cancel
            </button>
          )}

          <div className="flex items-center gap-2">
            {currentStep < 4 ? (
              <button
                type="button"
                disabled={
                  (currentStep === 1 && isSyncLimitReached) ||
                  (currentStep === 3 && (isLoadingSchema || Boolean(schemaError)))
                }
                onClick={() => {
                  if (currentStep === 1) {
                    if (isSyncLimitReached) {
                      setSubmitError(`Sync limit reached: The ${currentPlan.name} plan allows a maximum of ${currentPlan.limits.maxActiveSyncs} sync pipelines. Delete an existing pipeline to create a new one.`);
                      return;
                    }
                    if (!selectedDatasetId) {
                      setSubmitError('Please select or upload a CSV dataset.');
                      return;
                    }
                  }
                  if (currentStep === 2) {
                    if (!sheetsConnected) {
                      setSubmitError('Please connect your Google Sheets account.');
                      return;
                    }
                    if (spreadsheets.length === 0 || !selectedObjectId) {
                      setSubmitError('Please select a destination spreadsheet to proceed.');
                      return;
                    }
                  }
                  if (currentStep === 3) {
                    if (isLoadingSchema) {
                      return;
                    }
                    if (schemaError) {
                      setSubmitError('Please resolve column loading error before continuing.');
                      return;
                    }
                    if (mappings.length === 0) {
                      setSubmitError('At least one field mapping is required.');
                      return;
                    }
                  }
                  setSubmitError(null);
                  setCurrentStep((prev) => (prev + 1) as any);
                }}
                className={`inline-flex items-center gap-1.5 h-8 px-4 rounded-[6px] text-[12px] font-medium ${
                  (currentStep === 1 && isSyncLimitReached) ||
                  (currentStep === 3 && (isLoadingSchema || Boolean(schemaError)))
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                }`}
                style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleFinalSubmit(false)}
                  disabled={isSubmitting}
                  className="h-8 px-3 rounded-[6px] border text-[12px] font-medium cursor-pointer disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: 'var(--border-main)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  Save pipeline
                </button>
                <button
                  type="button"
                  onClick={() => handleFinalSubmit(true)}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 h-8 px-4 rounded-[6px] text-[12px] font-medium cursor-pointer disabled:opacity-50 shadow-xs"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-text)' }}
                >
                  <Play className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
                  <span>{isSubmitting ? 'Starting sync job...' : 'Run now'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
