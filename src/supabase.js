import { createClient } from "@supabase/supabase-js";

// Only the Supabase publishable/anon key belongs in a browser bundle. Never
// place a service_role key in VITE_* variables or client-side source.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);
export const supabase = supabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.");
  return supabase;
}

export const currentUser = async () => (await requireSupabase().auth.getUser()).data.user;
export const isAdmin = (user) => user?.app_metadata?.role === "admin";
