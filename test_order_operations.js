const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testDelete() {
    console.log('Testing order deletion...');

    // Get the latest order
    const { data: orders, error: fetchError } = await supabase
        .from('orders')
        .select('id, customer_name, total')
        .order('created_at', { ascending: false })
        .limit(1);

    if (fetchError) {
        console.error('Error fetching order:', fetchError);
        return;
    }

    if (!orders || orders.length === 0) {
        console.log('No orders found to test with');
        return;
    }

    const testOrder = orders[0];
    console.log('Found order:', testOrder);

    // Try to delete (we'll rollback by not actually deleting)
    console.log('\nAttempting to check delete permissions...');
    const { error: deleteError } = await supabase
        .from('orders')
        .delete()
        .eq('id', 'non-existent-id-test'); // Using fake ID to test permission without deleting

    if (deleteError) {
        console.error('❌ Delete permission ERROR:', deleteError.message);
    } else {
        console.log('✅ Delete permission OK (no error with test query)');
    }

    // Check RLS policies
    console.log('\nChecking if receipt_url exists in latest order:');
    const { data: fullOrder } = await supabase
        .from('orders')
        .select('*')
        .eq('id', testOrder.id)
        .single();

    console.log('Receipt URL:', fullOrder?.receipt_url || 'NOT SET');
    console.log('Payment method:', fullOrder?.payment_method_detail || 'NOT SET');
}

testDelete();
