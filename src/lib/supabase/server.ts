/**
 * Server-Side Supabase Client (Service Role)
 * Used ONLY on the Node.js backend server and background job runners.
 * Never imported or exposed to browser/client bundles.
 * Bypasses RLS to perform administrative and backend sync operations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const serverSupabaseUrl =
  (typeof process !== 'undefined' && process.env
    ? process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    : '') || 'https://uloisdecdkbrcxguwmqt.supabase.co';

const serverServiceRoleKey =
  (typeof process !== 'undefined' && process.env
    ? process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    : '') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsb2lzZGVjZGticmN4Z3V3bXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4MzQ4NDIsImV4cCI6MjEwODQxMDg0Mn0.y3AxCiSXJxiv9UrA6Mu12b9UbqLngvX-3NyIIiMdBAs';

export const isServerSupabaseConfigured = Boolean(
  serverSupabaseUrl &&
  serverSupabaseUrl.startsWith('https://') &&
  !serverSupabaseUrl.includes('your-project.supabase.co') &&
  serverServiceRoleKey &&
  serverServiceRoleKey.length > 20 &&
  !serverServiceRoleKey.includes('...')
);

let _supabaseAdmin: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient | null {
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
