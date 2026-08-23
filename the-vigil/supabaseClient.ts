// react-native-url-polyfill must load before @supabase/supabase-js
// anywhere in the app — RN's built-in URL implementation is incomplete
// and supabase-js's realtime/auth internals rely on the full API.
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No OAuth/magic-link redirect flow in a bare Expo Go app — irrelevant
    // to the headless password sign-in this app actually uses, and
    // enabling it makes supabase-js try to read a URL fragment that
    // won't exist here.
    detectSessionInUrl: false,
  },
});
