// ============================================
//  SKYARS ERP — Auth (Login Handler)
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    const sb = window.supabaseClient;
    const loader = document.getElementById('loading-screen');
    const form  = document.getElementById('login-form');
    const btn   = document.getElementById('login-btn');
    const errEl = document.getElementById('login-error');

    // Auto-redirect if already logged in (Supabase)
    if (sb) {
        try {
            const { data } = await sb.auth.getSession();
            if (data?.session) {
                if (loader) loader.style.display = 'flex';
                await redirectByRole(sb, data.session.user.id, data.session.user.email);
                return;
            }
        } catch (err) {
            console.warn('[Skyars] Session fetch failed:', err);
        }
    }

    // Hide loader initially
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 400);
    }

    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email    = document.getElementById('login-email').value.trim().toLowerCase();
        const password = document.getElementById('login-password').value;

        if (!email || !password) {
            showError('Please fill in all fields.', errEl);
            return;
        }

        setLoading(btn, true, 'Authenticating…');
        hideError(errEl);

        if (!sb) {
            showError('Database disconnected. Please check connection.', errEl);
            setLoading(btn, false, 'Sign In →');
            return;
        }

        try {
            const { data, error } = await sb.auth.signInWithPassword({ email, password });
            if (error) throw error;
            
            setLoading(btn, true, 'Loading workspace…');
            await redirectByRole(sb, data.user.id, email);

        } catch (err) {
            console.error('[Skyars] Login error:', err);
            showError(err.message.includes('Invalid') ? 'Invalid email or password.' : 'Login failed.', errEl);
            setLoading(btn, false, 'Sign In →');
        }
    });
});

async function redirectByRole(sb, userId, email) {
    try {
        const { data, error } = await sb.from('users').select('role').eq('id', userId).single();
        if (error) throw error;

        console.log('[Skyars] Login success. DB Role:', data?.role);

        if (data?.role === 'admin') {
            window.location.href = 'admin-dashboard.html';
        } else {
            window.location.href = 'intern-dashboard.html';
        }
    } catch (err) {
        console.warn('[Skyars] Role fetch failed. Error details:', err);
        if (email.includes('admin')) {
            window.location.href = 'admin-dashboard.html';
        } else {
            window.location.href = 'intern-dashboard.html';
        }
    }
}

function showError(msg, el) {
    if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function hideError(el) {
    if (el) el.style.display = 'none';
}

function setLoading(btn, loading, text) {
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
        ? `<span class="loader-ring" style="width:16px;height:16px;border-width:2px;margin-right:8px; display:inline-block; vertical-align:middle;"></span>${text}`
        : text;
}