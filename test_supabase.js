import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gesvmarujxkwunikexsw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlc3ZtYXJ1anhrd3VuaWtleHN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjI2MjQsImV4cCI6MjA5NTAzODYyNH0.IrxM-wKuPfdPAnK0uLR-9S1x0HFuoVOfAuoCbCVkwh0';

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("Fetching...");
  try {
    const { data, error } = await supabaseClient.from('community_posts').select('*').limit(50);
    console.log("Data:", data ? data.length : null);
    console.log("Error:", error);
  } catch (e) {
    console.error("Exception:", e);
  }
}
run();
