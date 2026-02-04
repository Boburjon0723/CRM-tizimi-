require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching orders:', error);
    } else {
        if (data.length > 0) {
            console.log('Columns in orders table:', Object.keys(data[0]));
            if (data[0].hasOwnProperty('receipt_url')) {
                console.log('✅ receipt_url column EXISTS.');
            } else {
                console.log('❌ receipt_url column MISSING.');
            }
        } else {
            console.log('Orders table is empty, cannot verify columns dynamically easily without inspection schema (which requires admin). trying insert to test.');
        }
    }
}

checkColumns();
