"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
export { ROOM_UPDATED_EVENT, roomChannelName } from "./channels";

let cached: SupabaseClient | null = null;

/**
 * Browser client used only to listen to Realtime broadcasts: the anon key has
 * no table access at all (see supabase/migrations), so this cannot read or
 * write room data.
 */
export function getRealtimeClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  cached ??= createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
