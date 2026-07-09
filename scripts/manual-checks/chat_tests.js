/**
 * ============================================================================
 * HERRAMIENTA MANUAL DE TESTING (NO INCLUIDA EN CI/CD AUTOMATIZADO)
 * ============================================================================
 * Este script realiza pruebas funcionales (E2E) contra la Edge Function de Chat.
 * Requiere credenciales reales y NO forma parte de la suite de Jest automatizada.
 * ============================================================================
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://itylpvuzflqlmmqvdhbz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'TU_ANON_KEY_AQUI'; // Reemplazar con anon key actual
const TEST_EMAIL = process.env.TEST_EMAIL || 'TU_EMAIL_TEST';            // Reemplazar
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'TU_PASSWORD_TEST';      // Reemplazar

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runTests() {
  console.log("═══ TESTS FUNCIONALES: Edge Function Chat ═══\n");
  let passed = 0, failed = 0;

  // Login
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });
  if (authErr) { console.error("❌ No se pudo autenticar:", authErr.message, "- Asegúrate de setear TEST_EMAIL y TEST_PASSWORD"); return; }
  const token = auth.session.access_token;
  console.log("✅ Autenticación exitosa\n");

  async function callChat(msgs, testName) {
    const start = Date.now();
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ messages: msgs })
      });
      const ms = Date.now() - start;
      const data = await res.json();
      return { ok: res.ok, data, ms, status: res.status };
    } catch (e) {
      return { ok: false, data: { error: e.message }, ms: Date.now() - start, status: 500 };
    }
  }

  // Test 1: Búsqueda normal
  const t1 = await callChat([{ role: 'user', content: 'motor 2hp' }], "Búsqueda normal");
  if (t1.ok && t1.data.reply && t1.data.reply.includes('[SKU:')) {
    console.log(`✅ Test 1 PASSED: Búsqueda normal (${t1.ms}ms) - Contiene [SKU:]`);
    passed++;
  } else {
    console.log(`❌ Test 1 FAILED: Búsqueda normal (${t1.ms}ms) - Reply: ${t1.data.reply?.substring(0, 80) || t1.data.error}`);
    failed++;
  }

  // Test 2: Respuesta en menos de 5 segundos
  if (t1.ms < 5000) {
    console.log(`✅ Test 2 PASSED: Latencia OK (${t1.ms}ms < 5000ms)`);
    passed++;
  } else {
    console.log(`❌ Test 2 FAILED: Latencia alta (${t1.ms}ms >= 5000ms)`);
    failed++;
  }

  // Test 3: Mensaje vacío → error controlado
  const t3 = await callChat([], "Mensaje vacío");
  if (!t3.ok || t3.data.error) {
    console.log(`✅ Test 3 PASSED: Mensaje vacío rechazado correctamente`);
    passed++;
  } else {
    console.log(`❌ Test 3 FAILED: Mensaje vacío no fue rechazado`);
    failed++;
  }

  // Test 4: Sin token → error de auth
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hola' }] })
    });
    if (!res.ok || res.status >= 400) {
      console.log(`✅ Test 4 PASSED: Sin token rechazado (status ${res.status})`);
      passed++;
    } else {
      console.log(`❌ Test 4 FAILED: Sin token no fue rechazado`);
      failed++;
    }
  } catch(e) {
    console.log(`✅ Test 4 PASSED: Sin token rechazado (error de red)`);
    passed++;
  }

  // Test 5: Pregunta fuera de tema → strike
  const t5 = await callChat([{ role: 'user', content: 'quien gano el partido de futbol ayer' }], "Pregunta fuera de tema");
  if (t5.ok && t5.data.reply && !t5.data.reply.includes('[SKU:')) {
    console.log(`✅ Test 5 PASSED: Pregunta fuera de tema manejada (${t5.ms}ms)`);
    passed++;
  } else {
    console.log(`❌ Test 5 FAILED: Respuesta inesperada a pregunta fuera de tema`);
    failed++;
  }

  console.log(`\n═══ RESULTADO: ${passed}/${passed + failed} tests pasados ═══`);
}

runTests();
