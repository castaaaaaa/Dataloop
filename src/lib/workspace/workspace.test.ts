import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/store';
import { createSignedOAuthState, verifySignedOAuthState } from '../security/crypto';
import { supabaseRepo } from '../db/supabase-repo';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe('Workspace Handling & Signed OAuth State', () => {
  const testWorkspaceId = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
  const testUserId = 'f9e8d7c6-b5a4-4321-9876-543210fedcba';

  it('generates HMAC-SHA256 signed OAuth state containing workspace_id and user_id', async () => {
    const signedState = await createSignedOAuthState(testWorkspaceId, testUserId);
    expect(signedState).toBeDefined();
    expect(typeof signedState).toBe('string');

    // Decode and verify structure
    const verified = await verifySignedOAuthState(signedState);
    expect(verified.valid).toBe(true);
    expect(verified.workspaceId).toBe(testWorkspaceId);
    expect(verified.userId).toBe(testUserId);
  });

  it('rejects tampered OAuth state and includes workspace_id and user_id in the error report', async () => {
    const signedState = await createSignedOAuthState(testWorkspaceId, testUserId);
    // Tamper with payload
    const decoded = JSON.parse(Buffer.from(signedState, 'base64url').toString('utf8'));
    decoded.workspaceId = 'hacked-workspace-id-0000-000000000000';
    const tamperedState = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

    const result = await verifySignedOAuthState(tamperedState);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid OAuth state signature');
    expect(result.error).toContain('workspace_id: hacked-workspace-id-0000-000000000000');
    expect(result.error).toContain(`user_id: ${testUserId}`);
  });

  it('uses database-generated UUIDs for new workspaces and never generates "ws_" timestamp prefixes', () => {
    const newWs = db.createWorkspace('Analytics Team');
    expect(newWs.id).toBeDefined();
    expect(newWs.id).not.toContain('ws_');
    expect(newWs.id).not.toMatch(/^ws_\d+/);
    expect(newWs.id).toMatch(UUID_REGEX);
  });

  it('returns existing workspace on subsequent logins and does not create a new workspace in local/offline mode', async () => {
    const testUser = '00000000-0000-4000-8000-000000000099';
    // User already has a workspace in store
    const existingWs = db.createWorkspace('Existing Workspace');
    db.members.push({
      id: '00000000-0000-4000-8000-000000000088',
      workspaceId: existingWs.id,
      userId: testUser,
      role: 'owner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Mock getClient to return null to test offline/fallback logic
    const clientSpy = (supabaseRepo as any).getClient;
    (supabaseRepo as any).getClient = () => null;

    try {
      const initialWorkspaceCount = db.workspaces.length;
      const resolved = await supabaseRepo.ensureUserWorkspace(testUser, 'test@example.com', 'Existing User');

      // Verify existing workspace was reused without creating a new one
      expect(resolved.workspace.id).toBe(existingWs.id);
      expect(db.workspaces.length).toBe(initialWorkspaceCount);
    } finally {
      (supabaseRepo as any).getClient = clientSpy;
    }
  });

  it('queries workspace_members in Supabase on login and returns existing workspace without calling insert', async () => {
    const existingWsId = '11111111-2222-4333-8444-555555555555';
    const testUser = '66666666-7777-4888-8999-000000000000';

    let insertCalled = false;
    const fakeClient: any = {
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            upsert: async () => ({ data: null, error: null })
          };
        }
        if (table === 'workspace_members') {
          return {
            select: () => ({
              eq: () => ({
                order: async () => ({
                  data: [{ workspace_id: existingWsId, role: 'owner' }],
                  error: null
                })
              })
            }),
            insert: () => {
              insertCalled = true;
              return { select: () => ({ single: async () => ({ data: {}, error: null }) }) };
            }
          };
        }
        if (table === 'workspaces') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: existingWsId,
                    name: 'Existing Supabase Workspace',
                    slug: 'existing-supabase-workspace',
                    owner_id: testUser,
                    plan_id: 'plan_pro',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  },
                  error: null
                })
              })
            }),
            insert: () => {
              insertCalled = true;
              return { select: () => ({ single: async () => ({ data: {}, error: null }) }) };
            }
          };
        }
        return {};
      }
    };

    const clientSpy = (supabaseRepo as any).getClient;
    (supabaseRepo as any).getClient = () => fakeClient;

    try {
      const resolved = await supabaseRepo.ensureUserWorkspace(testUser, 'user@supabase.test', 'Supabase User');
      expect(resolved.workspace.id).toBe(existingWsId);
      expect(resolved.workspace.name).toBe('Existing Supabase Workspace');
      expect(resolved.role).toBe('owner');
      // Must NOT have called insert
      expect(insertCalled).toBe(false);
    } finally {
      (supabaseRepo as any).getClient = clientSpy;
    }
  });
});
