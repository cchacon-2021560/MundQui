import { createClient } from '@supabase/supabase-js'

// This script expects VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to be
// provided via environment variables when running (no dotenv required).
const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in environment')
  process.exit(1)
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { 'x-test-run': '1' } }
})

async function run() {
  try {
    console.log('Calling matches select...')
    const res = await sb.from('matches').select('*')
    console.log('matches result:', res)
  } catch (err) {
    console.error('Error fetching matches:', err)
  }

  try {
    console.log('Calling predictions select...')
    const res2 = await sb.from('predictions').select('*, prediction_scorers(*)')
    console.log('predictions result:', res2)
  } catch (err) {
    console.error('Error fetching predictions:', err)
  }
}

run()
