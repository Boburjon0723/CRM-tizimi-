require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSettings() {
    const { data, error } = await supabase.from('settings').select('*');
    if (error) {
        console.error('Error fetching settings:', error);
    } else {
        console.log('Settings data:', JSON.stringify(data, null, 2));
        if (data.length === 0) {
            console.log('SETTINGS TABLE IS EMPTY!');
        } else {
            console.log('Settings Found (First Row):', data[0].humo_card);
        }
    }
}

checkSettings();
