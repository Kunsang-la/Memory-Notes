// lib/supabase.ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Replace these two strings with your actual credentials from Supabase:
// Supabase Dashboard -> Project Settings -> API
const SUPABASE_URL = 'https://usyedemldzbnspjvwblg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzeWVkZW1sZHpibnNwanZ3YmxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0Mjk4NDcsImV4cCI6MjEwNzAwNTg0N30.E6HtvqyN5hGn1q6FVV-ac-58b14ymkKePzpEcmmALLw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});