import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseKey) {
  throw new Error('VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY wajib diisi di .env')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true }
})

// STORE_ID dan STORE_NAME sekarang diambil dari user yang login
// bukan dari env variable — lihat auth store
export const APP_NAME = 'Coco Puff POS'
