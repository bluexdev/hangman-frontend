import { createClient } from "@supabase/supabase-js"

// Ensure these are set in your Vercel project environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase URL or Anon Key is not set. Please check your environment variables.")
}

// Server-side client (for Server Actions)
export const createServerClient = () => {
  return createClient(supabaseUrl, supabaseAnonKey)
}

// Client-side client (singleton pattern)
let supabaseClient: ReturnType<typeof createClient>

export const createBrowserClient = () => {
  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
  }
  return supabaseClient
}
