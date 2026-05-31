// ============================================
//  SKYARS ERP — Supabase Configuration
// ============================================

const SUPABASE_URL     = 'https://tzkqyciojbchnfmlxgjk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_8AHzXU24C0VY7AP14vVKIQ_wE11Qalv';

window.supabaseClient = null;

(function initSupabase() {
    try {
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: false
                }
            });
            console.log('[Skyars] Supabase client ready.');
        } else {
            console.error('[Skyars] Supabase CDN not loaded.');
        }
    } catch (err) {
        console.error('[Skyars] Supabase init error:', err);
    }
})();