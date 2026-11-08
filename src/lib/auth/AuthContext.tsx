/**
 * Authentication Context & Provider
 * Manages Supabase Auth session, email/password signup, login, Google OAuth, password reset, and workspace provisioning.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase, isRealSupabaseConfigured } from '../supabase/client';
import { db } from '../db/store';
import { UserRow } from '../db/schema';

interface AuthContextType {
  user: UserRow | null;
  session: any | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string) => Promise<{ user: UserRow | null; error: string | null }>;
  signInWithPassword: (email: string, password: string) => Promise<{ user: UserRow | null; error: string | null }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_AUTH_KEY = 'dataloop_auth_session_v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserRow | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Sync real workspace from database via verified session
  const syncWorkspaceFromServer = async (token: string, supaUser: any) => {
    try {
      const res = await fetch('/api/workspaces/current', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-user-id': supaUser.id
        }
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload.workspace) {
          db.currentWorkspaceId = payload.workspace.id;
          db.currentUserId = supaUser.id;
          db.workspaces = [payload.workspace];
          db.members = [
            {
              id: `${payload.workspace.id}_${supaUser.id}`,
              workspaceId: payload.workspace.id,
              userId: supaUser.id,
              role: payload.role || 'owner',
              createdAt: payload.workspace.createdAt,
              updatedAt: payload.workspace.updatedAt
            }
          ];
          db.saveToStorage();
        }
      }

      // Also load all user workspaces from database (workspace_members)
      const wsRes = await fetch('/api/workspaces', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-user-id': supaUser.id
        }
      });
      if (wsRes.ok) {
        const wsPayload = await wsRes.json();
        if (wsPayload.workspaces && wsPayload.workspaces.length > 0) {
          db.workspaces = wsPayload.workspaces;
          db.saveToStorage();
        }
      }
    } catch (err) {
      console.warn('[Auth] Failed to load workspace from server:', err);
    }
  };

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        if (isRealSupabaseConfigured && supabase) {
          // Real Supabase Auth session check
          const { data } = await supabase.auth.getSession();
          if (data.session && mounted) {
            setSession(data.session);
            const supaUser = data.session.user;
            let current = db.users.find(
              (u) => u.id === supaUser.id || (supaUser.email && u.email.toLowerCase() === supaUser.email.toLowerCase())
            );
            if (current) {
              current.id = supaUser.id;
              if (supaUser.email) current.email = supaUser.email;
              const nameFromMeta = (supaUser.user_metadata?.full_name as string) || (supaUser.user_metadata?.name as string);
              if (nameFromMeta) current.name = nameFromMeta;
              const avatarFromMeta = (supaUser.user_metadata?.avatar_url as string) || (supaUser.user_metadata?.picture as string);
              if (avatarFromMeta) current.avatarUrl = avatarFromMeta;
              db.setCurrentUser(current.id);
              setUser(current);
            } else {
              const newUser: UserRow = {
                id: supaUser.id,
                email: supaUser.email || '',
                name:
                  (supaUser.user_metadata?.full_name as string) ||
                  (supaUser.user_metadata?.name as string) ||
                  (supaUser.email ? supaUser.email.split('@')[0] : 'User'),
                avatarUrl: (supaUser.user_metadata?.avatar_url as string) || (supaUser.user_metadata?.picture as string) || undefined,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              db.users.push(newUser);
              db.setCurrentUser(newUser.id);
              setUser(newUser);
            }

            // Sync verified workspace directly from Postgres workspace_members
            await syncWorkspaceFromServer(data.session.access_token, supaUser);
          }

          // Clean up OAuth tokens from URL after exchange
          if (
            typeof window !== 'undefined' &&
            (window.location.hash.includes('access_token=') || window.location.search.includes('code='))
          ) {
            window.history.replaceState(null, '', window.location.pathname);
          }

          // Listen for real Supabase auth state changes (e.g. after Google OAuth redirect)
          const { data: authListener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
            if (!mounted) return;
            setSession(newSession);
            if (newSession?.user) {
              const supaUser = newSession.user;
              let current = db.users.find(
                (u) => u.id === supaUser.id || (supaUser.email && u.email.toLowerCase() === supaUser.email.toLowerCase())
              );
              if (!current) {
                current = {
                  id: supaUser.id,
                  email: supaUser.email || '',
                  name:
                    (supaUser.user_metadata?.full_name as string) ||
                    (supaUser.user_metadata?.name as string) ||
                    (supaUser.email ? supaUser.email.split('@')[0] : 'User'),
                  avatarUrl: (supaUser.user_metadata?.avatar_url as string) || (supaUser.user_metadata?.picture as string) || undefined,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                };
                db.users.push(current);
              } else {
                current.id = supaUser.id;
              }
              db.setCurrentUser(current.id);
              setUser(current);
              await syncWorkspaceFromServer(newSession.access_token, supaUser);
            } else if (event === 'SIGNED_OUT') {
              setUser(null);
            }
          });

          return () => {
            authListener?.subscription?.unsubscribe();
          };
        } else {
          // Development / Preview mode session retrieval
          const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LOCAL_AUTH_KEY) : null;
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.user) {
              let existing: UserRow | undefined = db.users.find((u) => u.id === parsed.user.id);
              if (!existing) {
                db.users.push(parsed.user as UserRow);
                existing = parsed.user as UserRow;
              }
              setUser(existing ?? null);
              setSession(parsed);
              if (existing) {
                db.setCurrentUser(existing.id);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  // 1. Sign Up (Email/Password)
  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanName = fullName.trim() || cleanEmail.split('@')[0];

      if (isRealSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: cleanName }
          }
        });

        if (error) {
          return { user: null, error: error.message };
        }

        if (data.user) {
          const newUser: UserRow = {
            id: data.user.id,
            email: cleanEmail,
            name: cleanName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          db.users.push(newUser);
          db.setCurrentUser(newUser.id);
          setUser(newUser);
          setSession(data.session);

          if (data.session?.access_token) {
            await syncWorkspaceFromServer(data.session.access_token, data.user);
          }

          return { user: newUser, error: null };
        }
      }

      // Preview / Dev fallback flow
      const existing = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
      if (existing) {
        return { user: null, error: 'A user with this email already exists. Please log in.' };
      }

      const generatedId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newUser: UserRow = {
        id: generatedId,
        email: cleanEmail,
        name: cleanName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.users.push(newUser);
      db.setCurrentUser(newUser.id);

      const fakeSession = {
        access_token: `mock_jwt_${Date.now()}`,
        user: newUser,
        expires_at: Date.now() + 86400 * 7 * 1000
      };

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(fakeSession));
      }

      setUser(newUser);
      setSession(fakeSession);

      return { user: newUser, error: null };
    } catch (err: any) {
      return { user: null, error: err.message || 'Failed to sign up.' };
    }
  };

  // 2. Sign In With Password
  const signInWithPassword = async (email: string, password: string) => {
    try {
      const cleanEmail = email.trim().toLowerCase();

      if (isRealSupabaseConfigured && supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password
        });

        if (error) {
          return { user: null, error: error.message };
        }

        if (data.user) {
          let appUser = db.users.find((u) => u.id === data.user.id);
          if (!appUser) {
            appUser = {
              id: data.user.id,
              email: cleanEmail,
              name: (data.user.user_metadata?.full_name as string) || cleanEmail.split('@')[0],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            db.users.push(appUser);
          }
          db.setCurrentUser(appUser.id);
          setUser(appUser);
          setSession(data.session);

          if (data.session?.access_token) {
            await syncWorkspaceFromServer(data.session.access_token, data.user);
          }

          return { user: appUser, error: null };
        }
      }

      // Preview / Dev fallback flow
      let foundUser = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
      if (!foundUser) {
        // If first time logging into this preview workspace, automatically provision user
        foundUser = {
          id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          email: cleanEmail,
          name: cleanEmail.split('@')[0].replace(/\./g, ' '),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        db.provisionUserWithWorkspace(foundUser);
      }

      const fakeSession = {
        access_token: `mock_jwt_${Date.now()}`,
        user: foundUser,
        expires_at: Date.now() + 86400 * 7 * 1000
      };

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LOCAL_AUTH_KEY, JSON.stringify(fakeSession));
      }

      setUser(foundUser);
      setSession(fakeSession);
      db.setCurrentUser(foundUser.id);

      return { user: foundUser, error: null };
    } catch (err: any) {
      return { user: null, error: err.message || 'Failed to sign in.' };
    }
  };

  // 3. Real Supabase Google OAuth Sign-In
  const signInWithGoogle = async () => {
    try {
      if (!isRealSupabaseConfigured || !supabase) {
        return {
          error:
            'Supabase is not configured with valid credentials. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
        };
      }

      const redirectUrl =
        typeof window !== 'undefined' ? `${window.location.origin}` : 'http://localhost:3000';

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account'
          }
        }
      });

      if (error) {
        return { error: error.message };
      }

      if (data?.url && typeof window !== 'undefined') {
        window.location.href = data.url;
      }

      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Google sign-in failed.' };
    }
  };

  // 4. Sign Out
  const signOut = async () => {
    try {
      if (isRealSupabaseConfigured && supabase) {
        await supabase.auth.signOut();
      }
    } catch (_e) {
      // ignore
    } finally {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(LOCAL_AUTH_KEY);
      }
      setUser(null);
      setSession(null);
    }
  };

  // 5. Password Reset
  const resetPassword = async (email: string) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (isRealSupabaseConfigured && supabase) {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/reset-password`
        });
        if (error) return { error: error.message };
        return { error: null };
      }

      // Preview mock response
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Failed to send password reset.' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signUp,
        signInWithPassword,
        signInWithGoogle,
        signOut,
        resetPassword
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
