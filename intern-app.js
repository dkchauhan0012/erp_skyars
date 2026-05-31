// ============================================
//  SKYARS ERP — Intern Dashboard Logic
//  Pure Supabase Version (No Mocks)
// ============================================

'use strict';

let internTasks = [];

// Global Modal helper functions
window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
        if (id === 'submit-dsr-modal') {
            populateDsrTasksDropdown(window.supabaseClient);
        }
    }
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
};

document.addEventListener('DOMContentLoaded', async () => {
    const sb = window.supabaseClient;

    // Hide global loader
    const loader = document.getElementById('loading-screen');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 400);
    }

    // --- Auth Guard ---
    let session = null;
    if (sb) {
        try {
            const { data } = await sb.auth.getSession();
            session = data?.session;
        } catch (err) {
            console.warn('[Skyars] Session check failed:', err);
        }
    }

    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    // Set User details in Sidebar
    try {
        const { data: userData } = await sb.from('users').select('name, designation').eq('id', session.user.id).single();
        const displayName = userData?.name || session.user.email.split('@')[0];
        const designation = userData?.designation || 'Intern';

        if (document.getElementById('intern-name')) document.getElementById('intern-name').textContent = displayName;
        if (document.getElementById('intern-avatar')) document.getElementById('intern-avatar').textContent = displayName.charAt(0).toUpperCase();
    } catch (err) {
        console.error('[Skyars] Load profile failed:', err);
    }

    // Set Date in header
    const dateEl = document.getElementById('today-date');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    // Logout handling
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (sb) await sb.auth.signOut();
            window.location.href = 'index.html';
        });
    }

    // Wire up DSR Modal Handler
    setupDsrModalHandler(sb);
});

// Listen for Router injection to initialize partial-specific logic
document.addEventListener('viewLoaded', async (e) => {
    const route = e.detail.route;
    const sb = window.supabaseClient;

    if (!sb) return;

    if (route.includes('overview.html')) {
        await initInternOverview(sb);
    } else if (route.includes('tasks.html')) {
        await loadInternTasks(sb);
    } else if (route.includes('attendance.html')) {
        await loadInternAttendance(sb);
    }
});

// ============================================
//  OVERVIEW MODULE
// ============================================
async function initInternOverview(sb) {
    // Greeting
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const welcomeEl = document.getElementById('welcome-text');
    if (welcomeEl) welcomeEl.innerHTML = `${greet}! 👋`;

    const btn = document.getElementById('checkin-btn');
    const statusEl = document.getElementById('checkin-status-display');
    const subEl = document.getElementById('welcome-sub');

    if (!btn) return;

    let checkedIn = false;
    let checkInTimeStr = '';

    try {
        const today = new Date().toISOString().split('T')[0];
        const { data: { session } } = await sb.auth.getSession();
        
        const { data, error } = await sb.from('attendance')
            .select('check_in')
            .eq('user_id', session.user.id)
            .eq('date', today)
            .maybeSingle();

        if (error) throw error;
        if (data) {
            checkedIn = true;
            const timeParts = data.check_in.split(':');
            if (timeParts.length >= 2) {
                let hh = parseInt(timeParts[0]);
                const mm = timeParts[1];
                const ampm = hh >= 12 ? 'PM' : 'AM';
                hh = hh % 12 || 12;
                checkInTimeStr = `${String(hh).padStart(2, '0')}:${mm} ${ampm}`;
            } else {
                checkInTimeStr = data.check_in;
            }
        }
    } catch (err) {
        console.error('[Skyars] Load check-in status error:', err);
    }

    // Update UI based on checkin status
    if (checkedIn) {
        markButtonCheckedIn(btn, statusEl, subEl, checkInTimeStr);
    } else {
        // Wire Check-In click action
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = `<span class="loader-ring" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px;"></span> Marking...`;

            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            
            // Calculate status (Late if after 10:00 AM)
            const hours = now.getHours();
            const minutes = now.getMinutes();
            const attendanceStatus = (hours > 10 || (hours === 10 && minutes > 0)) ? 'Late' : 'Present';

            try {
                const { data: { session } } = await sb.auth.getSession();
                const dbTime = now.toTimeString().split(' ')[0]; // 'HH:MM:SS'
                
                const { error } = await sb.from('attendance').insert({
                    user_id: session.user.id,
                    check_in: dbTime,
                    status: attendanceStatus
                });

                if (error) throw error;

                markButtonCheckedIn(btn, statusEl, subEl, timeStr);
                showToast(`Attendance marked as ${attendanceStatus}!`, 'success');
                
                // Reload KPIs
                await loadKPIs(sb);
            } catch (err) {
                console.error('[Skyars] Check-in error:', err);
                showToast(err.message || 'Check-in failed.', 'error');
                btn.disabled = false;
                btn.innerHTML = 'Check In Now';
            }
        });
    }

    // Load Overview KPI values
    await loadKPIs(sb);
}

function markButtonCheckedIn(btn, statusEl, subEl, timeStr) {
    btn.disabled = true;
    btn.style.cssText = 'background:rgba(34,197,94,0.15);box-shadow:0 0 20px rgba(34,197,94,0.2);border:1px solid rgba(34,197,94,0.25);color:#4ADE80;max-width:240px;margin:0 auto;font-size:14px;cursor:default;';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Checked In at ${timeStr}`;
    
    if (statusEl) {
        statusEl.className = 'checkin-status checked-in';
        statusEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Checked in at ${timeStr}`;
    }
    if (subEl) subEl.textContent = "You're all set! Your attendance has been recorded for today.";
}

async function loadKPIs(sb) {
    let tasksDone = 0;
    let tasksPending = 0;
    let daysPresent = 0;
    let dsrsCount = 0;

    try {
        const { data: { session } } = await sb.auth.getSession();
        const uid = session.user.id;

        const [doneRes, progressRes, todoRes, attendanceRes, dsrRes] = await Promise.all([
            sb.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'Done'),
            sb.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'In Progress'),
            sb.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('status', 'To-Do'),
            sb.from('attendance').select('*', { count: 'exact', head: true }).eq('user_id', uid),
            sb.from('dsrs').select('*', { count: 'exact', head: true }).eq('user_id', uid)
        ]);

        tasksDone = doneRes.count || 0;
        tasksPending = (progressRes.count || 0) + (todoRes.count || 0);
        daysPresent = attendanceRes.count || 0;
        dsrsCount = dsrRes.count || 0;
    } catch (err) {
        console.error('[Skyars] Load KPIs error:', err);
    }

    animateCount('my-tasks-done', tasksDone);
    animateCount('my-tasks-pending', tasksPending);
    animateCount('my-attendance', daysPresent);
    animateCount('my-dsrs', dsrsCount);
}

// ============================================
//  TASKS MODULE
// ============================================
async function loadInternTasks(sb) {
    const tbody = document.getElementById('intern-tasks-table-body');
    if (!tbody) return;

    try {
        const { data: { session } } = await sb.auth.getSession();
        const { data, error } = await sb.from('tasks').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
        if (error) throw error;

        internTasks = data;
        renderInternTasksTable(data);
    } catch (err) {
        console.error('[Skyars] Load tasks error:', err);
        showToast('Failed to load assigned tasks.', 'error');
    }
}

function renderInternTasksTable(tasks) {
    const tbody = document.getElementById('intern-tasks-table-body');
    if (!tbody) return;

    if (!tasks || tasks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:48px;color:var(--text-dim);">No tasks assigned yet.</td></tr>`;
        return;
    }

    tbody.innerHTML = tasks.map(t => {
        const badgeClass = t.status === 'Done' ? 'badge-done' : t.status === 'In Progress' ? 'badge-progress' : 'badge-todo';
        return `
            <tr>
                <td class="td-mono">${t.id}</td>
                <td class="td-primary">${t.title}</td>
                <td>${t.created_at?.split('T')[0] || '—'}</td>
                <td>${t.due_date || '—'}</td>
                <td><span class="badge ${badgeClass}">${t.status}</span></td>
            </tr>`;
    }).join('');
}

// ============================================
//  ATTENDANCE HISTORY MODULE
// ============================================
async function loadInternAttendance(sb) {
    const tbody = document.getElementById('intern-attendance-table-body');
    if (!tbody) return;

    let list = [];

    try {
        const { data: { session } } = await sb.auth.getSession();
        const { data, error } = await sb.from('attendance').select('*').eq('user_id', session.user.id).order('date', { ascending: false });
        if (error) throw error;

        list = data.map(d => {
            let checkInTime = '—';
            if (d.check_in) {
                const timeParts = d.check_in.split(':');
                if (timeParts.length >= 2) {
                    let hh = parseInt(timeParts[0]);
                    const mm = timeParts[1];
                    const ampm = hh >= 12 ? 'PM' : 'AM';
                    hh = hh % 12 || 12;
                    checkInTime = `${String(hh).padStart(2, '0')}:${mm} ${ampm}`;
                } else {
                    checkInTime = d.check_in;
                }
            }
            return {
                date: d.date,
                check_in: checkInTime,
                status: d.status
            };
        });

        renderInternAttendanceTable(list);
        setupInternAttendanceExport(list);
    } catch (err) {
        console.error('[Skyars] Load attendance history error:', err);
        showToast('Failed to load attendance logs.', 'error');
    }
}

function renderInternAttendanceTable(list) {
    const tbody = document.getElementById('intern-attendance-table-body');
    if (!tbody) return;
    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:48px;color:var(--text-dim);">No check-in history found.</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map(row => {
        const badgeClass = row.status === 'Present' ? 'badge-done' : row.status === 'Late' ? 'badge-progress' : 'badge-absent';
        return `
            <tr>
                <td class="td-primary">${row.date}</td>
                <td class="td-mono">${row.check_in}</td>
                <td><span class="badge ${badgeClass}">${row.status}</span></td>
            </tr>`;
    }).join('');
}

function setupInternAttendanceExport(list) {
    const btn = document.getElementById('intern-attendance-export-btn');
    if (!btn) return;
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
        const headers = ['Date', 'Check-In Time', 'Status'];
        const csvRows = list.map(r => [r.date, r.check_in, r.status].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
        const csv = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-attendance-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Attendance report downloaded!', 'success');
    });
}

// ============================================
//  DSR SUBMISSION MODAL
// ============================================
function setupDsrModalHandler(sb) {
    const form = document.getElementById('submit-dsr-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const taskId = document.getElementById('dsr-task-select').value;
        const content = document.getElementById('dsr-content-input').value.trim();
        const hours = parseFloat(document.getElementById('dsr-hours-input').value);
        const nextStatus = document.getElementById('dsr-status-select').value;
        const submitBtn = document.getElementById('submit-dsr-submit');

        if (!taskId || !content || isNaN(hours)) {
            showToast('Please fill all required fields.', 'warning');
            return;
        }

        setLoading(submitBtn, true, 'Submitting DSR...');

        try {
            const { data: { session } } = await sb.auth.getSession();
            
            // Insert report into dsrs table
            const { error: dsrErr } = await sb.from('dsrs').insert({
                user_id: session.user.id,
                task_id: taskId,
                content: content,
                hours_spent: hours
            });

            if (dsrErr) throw dsrErr;

            // Update status of the task
            const { error: taskErr } = await sb.from('tasks')
                .update({ status: nextStatus })
                .eq('id', taskId)
                .eq('user_id', session.user.id);

            if (taskErr) throw taskErr;

            showToast('DSR submitted successfully!', 'success');
            closeModal('submit-dsr-modal');
            form.reset();

            // Refresh view
            const activeNav = document.querySelector('.sidebar-nav .nav-item.active');
            const route = activeNav?.getAttribute('data-route');
            if (route?.includes('overview.html')) {
                await initInternOverview(sb);
            } else if (route?.includes('tasks.html')) {
                await loadInternTasks(sb);
            }
        } catch (err) {
            console.error('[Skyars] DSR Submit error:', err);
            showToast(err.message || 'Error submitting DSR.', 'error');
        } finally {
            setLoading(submitBtn, false, 'Submit DSR');
        }
    });
}

async function populateDsrTasksDropdown(sb) {
    const select = document.getElementById('dsr-task-select');
    if (!select) return;

    try {
        const { data: { session } } = await sb.auth.getSession();
        const { data, error } = await sb.from('tasks')
            .select('id, title')
            .eq('user_id', session.user.id)
            .not('status', 'eq', 'Done')
            .order('created_at', { ascending: false });

        if (error) throw error;
        select.innerHTML = '<option value="">Select task...</option>' + data.map(t => `<option value="${t.id}">${t.id} - ${t.title}</option>`).join('');
    } catch (err) {
        console.error('[Skyars] Error populating DSR tasks dropdown:', err);
    }
}

// ============================================
//  UTILITY FUNCTIONS
// ============================================
function animateCount(elId, target) {
    const el = document.getElementById(elId);
    if (!el) return;
    const start = performance.now(), from = parseInt(el.textContent) || 0;
    const update = (now) => {
        const p = Math.min((now - start) / 800, 1);
        el.textContent = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const colors = { success: '#22C55E', error: '#EF4444', warning: '#F59E0B', info: '#7C3AED' };
    toast.style.cssText = `
        position:fixed;bottom:24px;right:24px;z-index:9999;
        background:var(--bg-raised);border:1px solid var(--border);
        border-left:3px solid ${colors[type] || colors.info};
        color:var(--text-primary);padding:12px 18px;border-radius:10px;
        font-size:13px;font-family:'Outfit',sans-serif;
        box-shadow:0 8px 32px rgba(0,0,0,0.4);
        animation:fadeUp 0.3s ease;
        max-width:320px;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}

function setLoading(btn, loading, text) {
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading
        ? `<span class="loader-ring" style="width:16px;height:16px;border-width:2px;margin-right:8px; display:inline-block; vertical-align:middle;"></span>${text}`
        : text;
}