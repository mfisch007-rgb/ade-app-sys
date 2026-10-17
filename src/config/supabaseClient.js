// NON-CANONICAL / LEGACY-ONLY Supabase client.
// NOT imported by the canonical runtime (src/app.js). Only retained for the
// legacy engines (subscriptionAutomation, fraudEngine, branchRelay,
// analyticsEngine), which are themselves not mounted canonically.
// Canonical durable persistence is SupabaseStorageAdapter
// (src/storage/SupabaseStorageAdapter.js) with key precedence:
//   SUPABASE_SECRET_KEY > SUPABASE_SERVICE_ROLE_KEY > SUPABASE_STORAGE_KEY.
// This module mirrors that precedence for alias consistency. It still throws
// when URL/key are absent (fail closed) and introduces no new init path.
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    transport: ws,
  },
});
