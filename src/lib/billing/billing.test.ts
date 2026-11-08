import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/store';
import { billingProvider, UnimplementedBillingProvider } from './interface';

describe('Provider-Agnostic Billing & Plan Management', () => {
  beforeEach(() => {
    // Reset test workspace
    db.currentWorkspaceId = 'ws_acme_agency';
  });

  it('provides an unimplemented provider that fails gracefully without payment keys', async () => {
    expect(billingProvider).toBeInstanceOf(UnimplementedBillingProvider);
    expect(billingProvider.name).toBe('none');

    await expect(
      billingProvider.createCheckout({
        workspaceId: 'ws_test',
        userEmail: 'user@example.com',
        planKey: 'starter',
        successUrl: 'http://localhost:3000/success',
        cancelUrl: 'http://localhost:3000/cancel'
      })
    ).rejects.toThrow('Payments are coming soon');

    const sub = await billingProvider.getSubscription('ws_test');
    expect(sub).toBeNull();
  });

  it('records early access upgrade requests in the upgrade_requests table', () => {
    const prevCount = db.getUpgradeRequests().length;
    const req = db.requestUpgrade('agency.lead@growth.co', 'starter');

    expect(req).toBeDefined();
    expect(req.email).toBe('agency.lead@growth.co');
    expect(req.requestedPlanKey).toBe('starter');
    expect(req.status).toBe('pending');
    expect(req.workspaceId).toBe(db.currentWorkspaceId);
    expect(db.getUpgradeRequests().length).toBe(prevCount + 1);
  });

  it('provides Free (testing) plan with 1,000 records and 3 syncs when billing is disabled', () => {
    const ws = db.getCurrentWorkspace();
    ws.planId = 'plan_free';
    ws.trialEndsAt = undefined;

    expect(db.isTrialActive()).toBe(false);
    expect(db.getTrialDaysRemaining()).toBe(0);
    expect(db.getCurrentPlan().key).toBe('free');
    expect(db.getCurrentPlan().name).toBe('Free (testing)');
    expect(db.getLimits().maxRecords).toBe(1000);
    expect(db.getLimits().maxActiveSyncs).toBe(3);
  });

  it('allows owner/admin to change any workspace plan manually', () => {
    const targetWs = db.workspaces[0];
    db.adminSetWorkspacePlan(targetWs.id, 'plan_business');

    expect(targetWs.planId).toBe('plan_business');
    expect(db.getCurrentPlan().key).toBe('business');
    expect(db.getLimits().maxRecords).toBe(100000);
    expect(db.getLimits().maxActiveSyncs).toBe(75);

    // Verify audit log entry was created
    const log = db.auditLogs.find((l) => l.action === 'admin.plan_changed');
    expect(log).toBeDefined();
    expect(log?.targetId).toBe(targetWs.id);
  });
});
