import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
serve(async (req) => {
    return new Response(JSON.stringify({ key: Deno.env.get('GEMINI_API_KEY') }), { headers: { 'Content-Type': 'application/json' } });
});
