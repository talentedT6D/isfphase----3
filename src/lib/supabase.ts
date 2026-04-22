import { createClient } from "@supabase/supabase-js";

// Hardcoded per event-ops request. Anon key is safe for client bundles;
// Row-Level Security policies are the actual access control (see
// frontend/supabase-setup.sql).
const SUPABASE_URL = "https://tdpbcpafwldgtvcgsgpz.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkcGJjcGFmd2xkZ3R2Y2dzZ3B6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDcwNjQsImV4cCI6MjA5MjQyMzA2NH0.gT-ig6_4qDiUUXY21iVKXPmJlLOv5wE4OI9tn3hl7No";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});
