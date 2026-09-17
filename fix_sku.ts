import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const url = Deno.env.get('EXPO_PUBLIC_SUPABASE_URL');
const key = Deno.env.get('EXPO_PUBLIC_SUPABASE_ANON_KEY');
// We need the service role key to bypass RLS for edge function emulation.
// Let's read it from .env or just run it via the edge function locally if we can.
