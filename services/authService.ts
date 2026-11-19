
import { supabase } from '../lib/supabase';

export const signUpUser = async (
  email: string,
  pass: string,
  username: string
) => {
  const cleanUsername = username.trim();
  const cleanEmail = email.trim().toLowerCase();

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password: pass,
    options: {
      data: {
        username: cleanUsername,
      },
    },
  });

  if (error) throw error;
  return data;
};

export const signInUser = async (email: string, pass: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: pass,
  });

  if (error) throw error;
  return data;
};

export const signOutUser = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};
