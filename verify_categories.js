require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCategories() {
    const { data, error } = await supabase.from('categories').select('*');
    if (error) {
        console.log('Error:', error);
    } else {
        console.log('Categories:', JSON.stringify(data, null, 2));
    }
}
checkCategories();
