import React, { useState } from 'react';
import { db } from '../../lib/db/store';
import { ThemeToggle } from '../common/ThemeToggle';
import {
  Users,
  CreditCard,
  Key,
  Shield,
  Download,
  Trash2,
  Check,
  CheckCircle2,
  Copy,
  Clock,
  Sparkles,
  Sliders,
  Mail,
  X,
  Sun
} from 'lucide-react';
import { ApiKeyRow, PlanRow } from '../../lib/db/schema';
import { BILLING_ENABLED } from '../../lib/billing/config';

interface SettingsViewProps {
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'general' | 'team' | 'billing' | 'api_keys' | 'audit' | 'privacy' | 'admin_plans'>('billing');

  const currentWorkspace = db.getCurrentWorkspace();
  const currentPlan = db.getCurrentPlan();
  const plans = db.plans;
  const members = db.members.filter((m) => m.workspaceId === db.currentWorkspaceId);
  const apiKeys = db.apiKeys.filter((k) => k.workspaceId === db.currentWorkspaceId);
  const auditLogs = db.auditLogs.filter((a) => a.workspaceId === db.currentWorkspaceId);
  const isOwnerOrAdmin = db.getCurrentRole() === 'owner' || db.getCurrentRole() === 'admin';

  // Modals & form state
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKeyRevealed, setCreatedKeyRevealed] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [notification, setNotification] = useState<string | null>(null);

  // Early access request modal
  const currentUser = db.users.find((u) => u.id === db.currentUserId);
  const [earlyAccessPlan, setEarlyAccessPlan] = useState<PlanRow | null>(null);
  const [earlyAccessEmail, setEarlyAccessEmail] = useState(currentUser?.email || '');
  const [earlyAccessSuccess, setEarlyAccessSuccess] = useState(false);

  // Admin plan editing state
  const [adminPlans, setAdminPlans] = useState<Record<string, string>>({});
  const [adminTrials, setAdminTrials] = useState<Record<string, string>>({});

  const totalLinkedRecords = db.recordLinks.length;
  const activeSyncsCount = db.getSyncConfigs().filter((s) => s.status === 'active').length;
  const isTrialActive = db.isTrialActive();
  const trialDaysRemaining = db.getTrialDaysRemaining();
  const invitations = db.getWorkspaceInvitations();

  const handleCreateApiKey = () => {
    if (!newKeyName.trim()) return;

    const rawToken = `sync_live_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;
    const prefix = rawToken.substring(0, 14);

    const newKeyRow: ApiKeyRow = {
      id: `key_${Date.now()}`,
      workspaceId: db.currentWorkspaceId,
      name: newKeyName.trim(),
      keyPrefix: prefix,
      keyHash: `hash_${Date.now()}`,
      createdBy: db.currentUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.apiKeys.push(newKeyRow);
    db.logAudit('api_key.created', 'api_key', newKeyRow.id, { name: newKeyRow.name });

    setCreatedKeyRevealed(rawToken);
    setNewKeyName('');
    onRefresh();
  };

  const handleRevokeKey = (keyId: string) => {
    const k = db.apiKeys.find((item) => item.id === keyId);
    if (k) {
      k.revokedAt = new Date().toISOString();
      db.logAudit('api_key.revoked', 'api_key', keyId);
      setNotification('API key revoked.');
      onRefresh();
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleInviteMember = () => {
    if (!inviteEmail.trim()) return;
    try {
      db.inviteTeammate(inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      setNotification(`Invitation record created for ${inviteEmail.trim()} (role: ${inviteRole}).`);
      onRefresh();
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      setNotification(err.message || 'Failed to create invitation');
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleOpenEarlyAccess = (plan: PlanRow) => {
    setEarlyAccessPlan(plan);
    setEarlyAccessSuccess(false);
  };

  const handleSubmitEarlyAccess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!earlyAccessEmail.trim() || !earlyAccessPlan) return;
    db.requestUpgrade(earlyAccessEmail.trim(), earlyAccessPlan.key);
    setEarlyAccessSuccess(true);
    setNotification(`Early access requested for ${earlyAccessPlan.name} plan.`);
    onRefresh();
    setTimeout(() => {
      setEarlyAccessPlan(null);
      setEarlyAccessSuccess(false);
      setNotification(null);
    }, 2000);
  };

  const handleAdminSavePlan = (wsId: string) => {
    const targetWs = db.workspaces.find((w) => w.id === wsId);
    if (!targetWs) return;
    const newPlanId = adminPlans[wsId] || targetWs.planId;
    const newTrial = adminTrials[wsId] !== undefined ? adminTrials[wsId] : targetWs.trialEndsAt;

    db.adminSetWorkspacePlan(wsId, newPlanId, newTrial);
    setNotification(`Plan for "${targetWs.name}" updated successfully.`);
    onRefresh();
    setTimeout(() => setNotification(null), 3000);
  };

  const handleExportWorkspace = () => {
    const jsonStr = db.exportWorkspaceData();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentWorkspace.slug}-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotification('Workspace exported and downloaded.');
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDeleteWorkspace = () => {
    if (deleteConfirmText !== currentWorkspace.name) return;
    db.deleteCurrentWorkspace();
    setNotification('Workspace soft-deleted. Scheduled for permanent purge in 7 days.');
    onRefresh();
    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="max-w-[1100px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-[24px] font-semibold text-[var(--text-primary)] tracking-tight">
          Settings
        </h1>
        <p className="text-[14px] text-[var(--text-muted)] mt-1">
          Manage team members, billing plans, REST API keys, security audit logs, and data exports.
        </p>
      </div>

      {notification && (
        <div className="p-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] font-medium text-[var(--text-primary)] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-[var(--status-success)] shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--border-main)] pb-2 overflow-x-auto">
        {[
          { id: 'general', label: 'Appearance', icon: Sun },
          { id: 'billing', label: BILLING_ENABLED ? 'Billing & plans' : 'Plan & limits', icon: CreditCard },
          { id: 'team', label: 'Team members', icon: Users },
          { id: 'api_keys', label: 'API keys', icon: Key },
          { id: 'audit', label: 'Audit log', icon: Shield },
          { id: 'privacy', label: 'Data & privacy', icon: Download },
          ...(BILLING_ENABLED && isOwnerOrAdmin
            ? [{ id: 'admin_plans', label: 'Admin plans', icon: Sliders }]
            : [])
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`h-8 px-3 text-[12px] font-medium rounded-[6px] flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-raised)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB: GENERAL & APPEARANCE */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <div className="p-5 rounded-[6px] border border-[var(--border-main)] bg-[var(--bg-card)] space-y-4">
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                Interface theme
              </h3>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                Select how Dataloop looks to you. Choose System to automatically mirror your device preference.
              </p>
            </div>

            <div className="pt-2">
              <ThemeToggle variant="segmented" />
            </div>
          </div>

          <div className="p-5 rounded-[6px] border border-[var(--border-main)] bg-[var(--bg-card)] space-y-3">
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                Workspace information
              </h3>
              <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                Organization tenant and metadata details.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[12px] pt-1">
              <div>
                <span className="block font-medium mb-1 text-[var(--text-muted)]">
                  Workspace name
                </span>
                <span className="font-semibold block text-[var(--text-primary)]">
                  {currentWorkspace.name}
                </span>
              </div>
              <div>
                <span className="block font-medium mb-1 text-[var(--text-muted)]">
                  Workspace slug
                </span>
                <span className="font-mono block text-[var(--text-secondary)]">
                  {currentWorkspace.slug}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: BILLING & PLANS */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          {/* Plan Status Banner */}
          {BILLING_ENABLED && isTrialActive ? (
            <div className="p-4 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <div>
                  <span className="font-semibold text-[var(--text-primary)] text-[12px] block">
                    14-day Pro trial active
                  </span>
                  <span className="text-[var(--text-muted)] text-[12px]">
                    {trialDaysRemaining} days remaining · Full Pro plan limits enabled. Drops to Free plan automatically when the trial concludes.
                  </span>
                </div>
              </div>
              <div className="px-2.5 py-1 bg-[var(--bg-card)] border border-[var(--border-main)] text-[var(--text-primary)] rounded-[4px] text-[12px] font-medium">
                Trial active ({trialDaysRemaining}d)
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <div>
                  <span className="font-semibold text-[var(--text-primary)] text-[12px] block">
                    {currentPlan.name} plan active
                  </span>
                  <span className="text-[var(--text-muted)] text-[12px]">
                    {BILLING_ENABLED
                      ? '14-day trial period completed. You can submit early access requests for paid plans below.'
                      : 'Free testing plan active. Standard plan limits (3 pipelines, 1,000 records) are enforced below.'}
                  </span>
                </div>
              </div>
              <div className="px-2.5 py-1 bg-[var(--bg-card)] border border-[var(--border-main)] text-[var(--text-primary)] rounded-[4px] text-[12px] font-medium">
                {currentPlan.name}
              </div>
            </div>
          )}

          {/* Usage Meters */}
          <div className="p-5 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[6px] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                Current plan usage & limits ({currentPlan.name})
              </h3>
              <span className="text-[12px] text-[var(--text-muted)]">
                Fastest schedule: {currentPlan.limits.minIntervalMinutes}m · Realtime: {currentPlan.limits.realtime ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[12px]">
              <div className="p-3 bg-[var(--bg-raised)] rounded-[6px] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block text-[11px]">Records linked</span>
                <span className="text-[20px] font-semibold font-mono text-[var(--text-primary)] tabular-nums">
                  {totalLinkedRecords.toLocaleString()} / {currentPlan.limits.maxRecords.toLocaleString()}
                </span>
                <div className="mt-2 w-full h-1 bg-[var(--border-main)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full"
                    style={{ width: `${Math.min(100, (totalLinkedRecords / currentPlan.limits.maxRecords) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="p-3 bg-[var(--bg-raised)] rounded-[6px] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block text-[11px]">Active pipelines</span>
                <span className="text-[20px] font-semibold font-mono text-[var(--text-primary)] tabular-nums">
                  {activeSyncsCount} / {currentPlan.limits.maxActiveSyncs}
                </span>
                <div className="mt-2 w-full h-1 bg-[var(--border-main)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full"
                    style={{ width: `${Math.min(100, (activeSyncsCount / currentPlan.limits.maxActiveSyncs) * 100)}%` }}
                  />
                </div>
              </div>

              <div className="p-3 bg-[var(--bg-raised)] rounded-[6px] border border-[var(--border-subtle)]">
                <span className="text-[var(--text-muted)] block text-[11px]">Team seats</span>
                <span className="text-[20px] font-semibold font-mono text-[var(--text-primary)] tabular-nums">
                  {members.length} / {currentPlan.limits.teamSeats}
                </span>
                <div className="mt-2 w-full h-1 bg-[var(--border-main)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)] rounded-full"
                    style={{ width: `${Math.min(100, (members.length / currentPlan.limits.teamSeats) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Plan Comparison Cards (Hidden when billing is turned off) */}
          {BILLING_ENABLED && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  Available plans & features
                </h3>
                <span className="text-[12px] text-[var(--text-muted)]">
                  Billing system upgrade in progress · Early access requests open
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {plans.map((p) => {
                  const isCurrent = p.id === currentPlan.id;
                  return (
                    <div
                      key={p.id}
                      className={`p-4 rounded-[6px] border flex flex-col justify-between transition-colors bg-[var(--bg-card)] ${
                        isCurrent
                          ? 'border-[var(--accent)]'
                          : 'border-[var(--border-main)]'
                      }`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[var(--text-primary)] text-[14px]">{p.name}</span>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent)]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                              Current
                            </span>
                          )}
                        </div>

                        <div className="flex items-baseline gap-1">
                          <span className="text-[24px] font-semibold font-mono text-[var(--text-primary)]">
                            ${p.priceMonthlyCents / 100}
                          </span>
                          <span className="text-[var(--text-muted)] text-[12px]">/month</span>
                        </div>

                        <ul className="space-y-1.5 text-[12px] text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]">
                          <li>• {p.limits.maxRecords.toLocaleString()} linked records</li>
                          <li>• {p.limits.maxActiveSyncs} active pipelines</li>
                          <li>• Fastest: {p.limits.minIntervalMinutes}m schedule</li>
                          <li>• {p.limits.teamSeats} team seats</li>
                          <li>• {p.limits.realtime ? 'Webhooks enabled' : 'Interval polling'}</li>
                          <li>• {p.limits.premiumConnectors ? 'All connectors' : 'Basic connectors'}</li>
                        </ul>
                      </div>

                      <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] space-y-2">
                        {isCurrent ? (
                          <div className="w-full h-8 rounded-[6px] text-[12px] font-medium bg-[var(--bg-raised)] text-[var(--text-primary)] border border-[var(--border-main)] text-center flex items-center justify-center gap-1.5">
                            <Check className="w-3.5 h-3.5 text-[var(--status-success)]" />
                            <span>Current plan</span>
                          </div>
                        ) : (
                          <>
                            <button
                              disabled
                              className="w-full h-8 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--bg-raised)] text-[var(--text-muted)] border border-[var(--border-subtle)] cursor-not-allowed text-center"
                            >
                              Payments coming soon
                            </button>
                            <button
                              onClick={() => handleOpenEarlyAccess(p)}
                              className="w-full h-8 px-3 rounded-[6px] text-[12px] font-medium bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              <span>Request early access</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: TEAM MEMBERS */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          {/* Invite Box */}
          <div className="p-5 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[6px] space-y-3">
            <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
              Invite team member
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="email"
                placeholder="colleague@agency.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 h-8 px-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                className="h-8 px-2.5 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
              <button
                onClick={handleInviteMember}
                className="h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[6px] text-[12px] font-medium transition-colors"
              >
                Create invitation
              </button>
            </div>
            <p className="text-[12px] text-[var(--text-muted)]">
              Invitations create an active record in the database. When email sending is configured, an email notification will be dispatched.
            </p>
          </div>

          {/* Active Members Table */}
          <div className="space-y-2">
            <h4 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
              Active workspace members ({members.length})
            </h4>
            <div className="border border-[var(--border-main)] rounded-[6px] overflow-hidden bg-[var(--bg-card)]">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Joined at</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] text-[12px]">
                  {members.map((m) => {
                    const memberUser = db.users.find((u) => u.id === m.userId);
                    return (
                      <tr key={m.id} className="hover:bg-[var(--bg-raised)] transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-[var(--text-primary)]">
                            {memberUser?.name || 'Workspace user'}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] font-mono">
                            {memberUser?.email || m.userId}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 capitalize">
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-[4px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                            {m.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[var(--text-muted)] font-sans">
                          {new Date(m.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {m.role !== 'owner' && (
                            <button
                              onClick={() => {
                                db.members = db.members.filter((item) => item.id !== m.id);
                                onRefresh();
                              }}
                              className="text-[var(--text-muted)] hover:text-[var(--status-danger)] text-[12px] transition-colors"
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pending Invitations Section */}
          <div className="space-y-2">
            <h4 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
              Pending invitations ({invitations.length})
            </h4>
            {invitations.length === 0 ? (
              <div className="p-6 bg-[var(--bg-card)] border border-dashed border-[var(--border-main)] rounded-[6px] text-center text-[12px] text-[var(--text-muted)]">
                No pending invitations. Enter an email address above to invite a new teammate.
              </div>
            ) : (
              <div className="border border-[var(--border-main)] rounded-[6px] overflow-hidden bg-[var(--bg-card)]">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Invitee email</th>
                      <th className="py-2.5 px-3">Assigned role</th>
                      <th className="py-2.5 px-3">Invited at</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)] text-[12px]">
                    {invitations.map((inv) => (
                      <tr key={inv.id} className="hover:bg-[var(--bg-raised)] transition-colors">
                        <td className="py-2.5 px-3 font-medium text-[var(--text-primary)] font-mono">
                          {inv.email}
                        </td>
                        <td className="py-2.5 px-3 capitalize">
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-[4px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                            {inv.role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[var(--text-muted)]">
                          {new Date(inv.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center gap-1.5 text-[12px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-warning)]" />
                            <span className="capitalize text-[var(--text-secondary)]">{inv.status}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => {
                              db.revokeInvitation(inv.id);
                              onRefresh();
                            }}
                            className="text-[var(--text-muted)] hover:text-[var(--status-danger)] text-[12px] transition-colors"
                          >
                            Revoke
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

      {/* TAB: API KEYS */}
      {activeTab === 'api_keys' && (
        <div className="space-y-6">
          {/* Create Key Box */}
          <div className="p-5 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[6px] space-y-3">
            <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider">
              Generate new API key
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="e.g. Automation CLI Key"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="flex-1 h-8 px-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
              />
              <button
                onClick={handleCreateApiKey}
                className="h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[6px] text-[12px] font-medium transition-colors"
              >
                Create secret key
              </button>
            </div>

            {createdKeyRevealed && (
              <div className="p-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] space-y-2 mt-3">
                <span className="text-[12px] font-medium text-[var(--text-primary)] block">
                  Copy your API secret key now (it will never be shown again):
                </span>
                <div className="flex items-center gap-2 bg-[var(--bg-card)] p-2 rounded-[4px] border border-[var(--border-main)] font-mono text-[12px] text-[var(--text-primary)]">
                  <span className="flex-1 truncate select-all">{createdKeyRevealed}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdKeyRevealed);
                      setNotification('API key copied to clipboard.');
                      setTimeout(() => setNotification(null), 2500);
                    }}
                    className="p-1 hover:bg-[var(--bg-raised)] rounded-[4px] text-[var(--text-secondary)] transition-colors"
                    title="Copy key"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Keys Table */}
          <div className="border border-[var(--border-main)] rounded-[6px] overflow-hidden bg-[var(--bg-card)]">
            {apiKeys.length === 0 ? (
              <div className="p-12 text-center text-[12px] text-[var(--text-muted)]">
                No API keys generated yet. Create a key above to access the REST API.
              </div>
            ) : (
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Key label</th>
                    <th className="py-2.5 px-3">Prefix</th>
                    <th className="py-2.5 px-3">Last used</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[12px]">
                  {apiKeys.map((k) => (
                    <tr key={k.id} className="hover:bg-[var(--bg-raised)] transition-colors">
                      <td className="py-2.5 px-3 font-sans font-medium text-[var(--text-primary)]">{k.name}</td>
                      <td className="py-2.5 px-3 text-[var(--text-secondary)]">{k.keyPrefix}...</td>
                      <td className="py-2.5 px-3 text-[var(--text-muted)] font-sans">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-sans">
                        {!k.revokedAt ? (
                          <button
                            onClick={() => handleRevokeKey(k.id)}
                            className="text-[var(--status-danger)] hover:underline text-[12px] font-medium"
                          >
                            Revoke
                          </button>
                        ) : (
                          <span className="text-[var(--text-muted)] text-[11px]">Revoked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB: SECURITY & AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="border border-[var(--border-main)] rounded-[6px] overflow-hidden bg-[var(--bg-card)]">
          {auditLogs.length === 0 ? (
            <div className="p-12 text-center text-[12px] text-[var(--text-muted)]">
              No audit log entries recorded yet.
            </div>
          ) : (
            <table className="w-full text-left text-[12px]">
              <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Target type</th>
                  <th className="py-2.5 px-3 text-right">IP address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[12px]">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--bg-raised)] transition-colors">
                    <td className="py-2.5 px-3 text-[var(--text-muted)] font-sans">
                      {new Date(log.createdAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-[var(--text-primary)] font-medium">
                      {log.actorEmail || 'System'}
                    </td>
                    <td className="py-2.5 px-3 text-[var(--accent)] font-medium">{log.action}</td>
                    <td className="py-2.5 px-3 font-sans text-[var(--text-secondary)]">{log.targetType}</td>
                    <td className="py-2.5 px-3 text-right text-[var(--text-muted)]">{log.ip || '127.0.0.1'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB: DATA & PRIVACY */}
      {activeTab === 'privacy' && (
        <div className="space-y-6">
          <div className="p-5 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[6px] space-y-3">
            <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Export workspace data</h3>
            <p className="text-[12px] text-[var(--text-muted)]">
              Download a complete JSON export of all sync configs, field mappings, record links, runs, and security audit logs.
            </p>
            <button
              onClick={handleExportWorkspace}
              className="h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[6px] text-[12px] font-medium flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Download workspace archive
            </button>
          </div>

          <div className="p-5 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[6px] space-y-3">
            <h3 className="text-[14px] font-semibold text-[var(--status-danger)]">Delete workspace</h3>
            <p className="text-[12px] text-[var(--text-muted)]">
              Soft-deletes this workspace for 7 days. During the grace period, it can be restored by the workspace owner. After 7 days, all stored tokens, credentials, and configurations are permanently purged.
            </p>
            <div className="space-y-2">
              <label className="text-[12px] text-[var(--text-secondary)] block">
                Type <strong>{currentWorkspace.name}</strong> to confirm:
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={currentWorkspace.name}
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="h-8 px-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] text-[var(--text-primary)] flex-1 focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={handleDeleteWorkspace}
                  disabled={deleteConfirmText !== currentWorkspace.name}
                  className="h-8 px-3 bg-[var(--status-danger)] text-white rounded-[6px] text-[12px] font-medium disabled:opacity-40 transition-colors"
                >
                  Delete workspace
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: ADMIN WORKSPACE PLAN MANAGEMENT (Owner Only) */}
      {activeTab === 'admin_plans' && isOwnerOrAdmin && (
        <div className="space-y-6">
          <div className="p-5 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[6px] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[var(--accent)]" />
                  <span>Manual workspace plan management</span>
                </h3>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
                  As workspace owner/admin, you can manually change any workspace's plan tier and trial expiration.
                </p>
              </div>
              <span className="px-2 py-0.5 bg-[var(--bg-raised)] text-[var(--text-secondary)] text-[11px] font-medium rounded-[4px] border border-[var(--border-main)]">
                Admin privilege active
              </span>
            </div>

            <div className="border border-[var(--border-main)] rounded-[6px] overflow-hidden">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Workspace</th>
                    <th className="py-2.5 px-3">Current plan</th>
                    <th className="py-2.5 px-3">Trial expiration</th>
                    <th className="py-2.5 px-3">Change plan</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {db.workspaces.map((ws) => {
                    const assignedPlan = db.plans.find((p) => p.id === ws.planId) || db.plans[0];
                    const selectedPlanId = adminPlans[ws.id] || ws.planId;
                    const isTrialActive = ws.trialEndsAt ? new Date(ws.trialEndsAt).getTime() > Date.now() : false;
                    const daysRemaining = ws.trialEndsAt
                      ? Math.max(0, Math.ceil((new Date(ws.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                      : 0;

                    return (
                      <tr key={ws.id} className="hover:bg-[var(--bg-raised)] transition-colors">
                        <td className="py-2.5 px-3">
                          <span className="font-medium text-[var(--text-primary)] block">{ws.name}</span>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">{ws.id} · /{ws.slug}</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-[4px] bg-[var(--bg-raised)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                            {assignedPlan.name}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="space-y-1">
                            <span className="text-[12px] block">
                              {isTrialActive ? (
                                <span className="text-[var(--accent)] font-medium">
                                  {daysRemaining} days left ({new Date(ws.trialEndsAt).toLocaleDateString()})
                                </span>
                              ) : (
                                <span className="text-[var(--text-muted)]">Trial concluded</span>
                              )}
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const plus14 = new Date(Date.now() + 14 * 86400 * 1000).toISOString();
                                  setAdminTrials((prev) => ({ ...prev, [ws.id]: plus14 }));
                                }}
                                className="h-6 px-1.5 bg-[var(--bg-raised)] hover:bg-[var(--border-main)] text-[10px] text-[var(--text-secondary)] rounded-[4px] font-medium transition-colors"
                              >
                                +14d trial
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAdminTrials((prev) => ({ ...prev, [ws.id]: new Date(Date.now() - 1000).toISOString() }));
                                }}
                                className="h-6 px-1.5 bg-[var(--bg-raised)] hover:bg-[var(--border-main)] text-[10px] text-[var(--text-secondary)] rounded-[4px] font-medium transition-colors"
                              >
                                End trial
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={selectedPlanId}
                            onChange={(e) => setAdminPlans((prev) => ({ ...prev, [ws.id]: e.target.value }))}
                            className="h-8 px-2 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] font-medium text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                          >
                            {db.plans.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} (${p.priceMonthlyCents / 100}/mo)
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleAdminSavePlan(ws.id)}
                            className="h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[6px] text-[12px] font-medium transition-colors"
                          >
                            Save plan
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Upgrade Requests Table (Hidden when billing is turned off) */}
          {BILLING_ENABLED && (
            <div className="p-5 bg-[var(--bg-card)] border border-[var(--border-main)] rounded-[6px] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[12px] font-semibold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[var(--accent)]" />
                    <span>Early access upgrade requests</span>
                  </h3>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Users who requested early access to paid tiers while payment integrations are pending.
                  </p>
                </div>
                <span className="px-2 py-0.5 bg-[var(--bg-raised)] text-[var(--text-secondary)] text-[11px] font-mono font-medium rounded-[4px] border border-[var(--border-subtle)]">
                  {db.upgradeRequests.length} requests
                </span>
              </div>

              {db.upgradeRequests.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-[var(--border-main)] rounded-[6px]">
                  <Mail className="w-6 h-6 text-[var(--text-muted)] mx-auto mb-1.5" />
                  <p className="text-[12px] text-[var(--text-primary)] font-medium">No early access requests yet.</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    Requests submitted from the "Request early access" buttons will appear here.
                  </p>
                </div>
              ) : (
                <div className="border border-[var(--border-main)] rounded-[6px] overflow-hidden">
                  <table className="w-full text-left text-[12px]">
                    <thead className="bg-[var(--bg-raised)] border-b border-[var(--border-main)] text-[var(--text-muted)] font-medium">
                      <tr>
                        <th className="py-2.5 px-3">Email</th>
                        <th className="py-2.5 px-3">Requested plan</th>
                        <th className="py-2.5 px-3">Workspace</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Requested at</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] font-mono text-[12px]">
                      {db.upgradeRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-[var(--bg-raised)] transition-colors">
                          <td className="py-2.5 px-3 font-sans font-medium text-[var(--text-primary)]">
                            {req.email}
                          </td>
                          <td className="py-2.5 px-3 uppercase text-[var(--accent)] font-medium font-sans">
                            {req.requestedPlanKey}
                          </td>
                          <td className="py-2.5 px-3 text-[var(--text-secondary)]">{req.workspaceId}</td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1.5 font-sans text-[12px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--status-warning)]" />
                              <span className="capitalize text-[var(--text-secondary)]">{req.status}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right text-[var(--text-muted)] font-sans">
                            {new Date(req.createdAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Early Access Request Modal */}
      {earlyAccessPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--bg-card)] rounded-[6px] border border-[var(--border-main)] shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[var(--accent)]" />
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                  Request early access — {earlyAccessPlan.name} plan
                </h3>
              </div>
              <button
                onClick={() => setEarlyAccessPlan(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-[4px]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {earlyAccessSuccess ? (
              <div className="p-4 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-center space-y-1.5">
                <CheckCircle2 className="w-6 h-6 text-[var(--status-success)] mx-auto" />
                <p className="text-[14px] font-semibold text-[var(--text-primary)]">Request recorded</p>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  Thank you! We've saved your request to the early access list.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitEarlyAccess} className="space-y-4">
                <p className="text-[12px] text-[var(--text-secondary)]">
                  Self-serve checkout is temporarily disabled while we upgrade our payment infrastructure. Enter your email below to request early onboarding for the <strong>{earlyAccessPlan.name}</strong> plan (${earlyAccessPlan.priceMonthlyCents / 100}/mo).
                </p>

                <div className="p-3 bg-[var(--bg-raised)] rounded-[6px] border border-[var(--border-subtle)] text-[12px] text-[var(--text-secondary)] space-y-1">
                  <div className="font-semibold text-[var(--text-primary)]">Plan limits included:</div>
                  <div>• {earlyAccessPlan.limits.maxRecords.toLocaleString()} records/month</div>
                  <div>• {earlyAccessPlan.limits.maxActiveSyncs} active pipelines</div>
                  <div>• {earlyAccessPlan.limits.minIntervalMinutes} minute sync frequency</div>
                </div>

                <div className="space-y-1">
                  <label className="text-[12px] font-medium text-[var(--text-primary)] block">
                    Your work email
                  </label>
                  <input
                    type="email"
                    required
                    value={earlyAccessEmail}
                    onChange={(e) => setEarlyAccessEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full h-8 px-3 bg-[var(--bg-raised)] border border-[var(--border-main)] rounded-[6px] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEarlyAccessPlan(null)}
                    className="h-8 px-3 border border-[var(--border-main)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-raised)] rounded-[6px] text-[12px] font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-8 px-3 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-[6px] text-[12px] font-medium transition-colors"
                  >
                    Submit early access request
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
