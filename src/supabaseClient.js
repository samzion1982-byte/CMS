import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wjasjrthijpxlarreics.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqYXNqcnRoaWpweGxhcnJlaWNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxODAzMDAsImV4cCI6MjA5MTc1NjMwMH0.cCWk_U3kbLvCRuk916hoYP7cIlWusHTRbgSpvHnuktY'

export const supabase = createClient(supabaseUrl, supabaseKey)