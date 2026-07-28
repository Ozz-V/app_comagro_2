require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function testInsert() {
  const { data, error } = await supabase.from('producto_analytics').insert([{
    modelo: 'TEST_MODEL',
    marca: 'TEST_MARCA',
    sku: 'TEST_SKU',
    action: 'view',
    user_email: 'test@comagro.com.py'
  }]);
  
  console.log("Insert result:", { data, error });
}

testInsert();
