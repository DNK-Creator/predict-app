import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SUPABASE_API_KEY = process.env.VITE_SUPABASE_API_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_API_KEY)
export default supabase