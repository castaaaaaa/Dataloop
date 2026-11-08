/**
 * Supabase Client & Authentication Layer
 * Provides real Supabase Auth integration using @supabase/supabase-js with graceful local development fallback.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Active Supabase instance configuration
const DEFAULT_SUPABASE_URL = 'https://uloisdecdkbrcxguwmqt.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsb2lzZGVjZGticmN4Z3V3bXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4MzQ4NDIsImV4cCI6MjEwODQxMDg0Mn0.y3AxCiSXJxiv9UrA6Mu12b9UbqLngvX-3NyIIiMdBAs';

// Resolve configuration from client-accessible environment variables or process.env, falling back to provisioned project
export const supabaseUrl =
  (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL)) ||
  (typeof process !== 'undefined' && (process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)) ||
  DEFAULT_SUPABASE_URL;

export const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) ||
  (typeof process !== 'undefined' && (process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)) ||
  DEFAULT_SUPABASE_ANON_KEY;

// Check if credentials are valid and not default placeholders
export const isRealSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project.supabase.co') &&
  supabaseAnonKey &&
  supabaseAnonKey.length > 20 &&
  !supabaseAnonKey.includes('...')
);

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});
