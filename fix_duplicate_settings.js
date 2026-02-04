require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixDuplicates() {
    const incorrectId = "2a90a19e-c2a3-47c0-b5dd-38db3b06ac2a";

    console.log(`Deleting incorrect settings row with ID: ${incorrectId}...`);

    const { error } = await supabase
        .from('settings')
        .delete()
        .eq('id', incorrectId);

    if (error) {
        console.error('Error deleting row:', error);
    } else {
        console.log('Successfully deleted incorrect row.');
    }

    // Verify remaining rows
    const { data: rows, error: fetchError } = await supabase.from('settings').select('*');
    if (fetchError) {
        console.error('Error fetching remaining rows:', fetchError);
    } else {
        console.log('Remaining settings rows:', rows.length);
        console.log(JSON.stringify(rows, null, 2));
    }
}

fixDuplicates();
