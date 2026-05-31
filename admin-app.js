// ============================================
//  SKYARS ERP — Admin Dashboard Logic
//  Pure Supabase Version (No Mocks)
// ============================================

'use strict';

let allTaskData = [];
let allAttendanceData = [];

// Global Modal helper functions
window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('active');
        if (id === 'assign-task-modal') {
            populateInternsDropdown(window.supabaseClient);
        }
    }
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
};

// Base UI Initialization (Auth, User Info, Topbar)
document.addEventListener('DOMContentLoaded', async () => {
    const sb = window.supabaseClient;

    if (!sb) {
        showToast('Database connection error. Please refresh.', 'error');
        hideLoader();
        return;
    }

    // --- Auth Guard ---
    let session = null;
    try {
        const { data } = await sb.auth.getSession();
        session = data?.session;
    } catch (err) {
        console.warn('[Skyars] Supabase session fetch failed:', err);
    }

    if (!session) {
        window.location.href = 'index.html';
        return;
    }

    // --- DB Role check ---
    try {
        const { data: userData, error } = await sb.from('users').select('role, name').eq('id', session.user.id).single();
        if (error || !userData || userData.role !== 'admin') {
            console.warn('[Skyars] Admin guard redirecting to intern. Data:', userData, 'Error:', error);
            window.location.href = 'intern-dashboard.html';
            return;
        }
        const displayName = userData.name || session.user.email.split('@')[0];
        if (document.getElementById('admin-name')) document.getElementById('admin-name').textContent = displayName;
        if (document.getElementById('avatar-letter')) document.getElementById('avatar-letter').textContent = displayName.charAt(0).toUpperCase();
    } catch (err) {
        console.error('[Skyars] Fetch role failed:', err);
        window.location.href = 'index.html';
        return;
    }

    showPage();

    const todayEl = document.getElementById('today-date');
    if (todayEl) {
        todayEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (sb) await sb.auth.signOut();
            window.location.href = 'index.html';
        });
    }

    // Wire up Modal Submission Handlers
    setupModalHandlers(sb);
});

// ============================================
// SPA ROUTE LISTENER - Jab koi partial HTML inject ho
// ============================================
document.addEventListener('viewLoaded', async (e) => {
    const route = e.detail.route;
    const sb = window.supabaseClient;

    if (!sb) return;

    if (route.includes('overview.html')) {
        await loadDashboardData(sb);
        setupFilters('table-body');
    } else if (route.includes('tasks.html')) {
        await loadTasksData(sb);
    } else if (route.includes('interns.html')) {
        await loadInternsData(sb);
    } else if (route.includes('attendance.html')) {
        await loadAttendanceData(sb);
    }
});

// ============================================
//  DATA LOADING
// ============================================

async function loadDashboardData(sb) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const [internRes, presentRes, doneRes, progressRes, todoRes, tasksRes] = await Promise.allSettled([
            sb.from('users').select('*', { count: 'exact', head: true }).eq('role', 'intern').eq('status', 'Active'),
            sb.from('attendance').select('*', { count: 'exact', head: true }).eq('date', today).not('check_in', 'is', null),
            sb.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'Done'),
            sb.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'In Progress'),
            sb.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'To-Do'),
            sb.from('tasks').select('id, created_at, title, status, user_id, users(name)').order('created_at', { ascending: false }).limit(20)
        ]);

        const internsCount = internRes.status === 'fulfilled' ? internRes.value.count : 0;
        const presentCount = presentRes.status === 'fulfilled' ? presentRes.value.count : 0;
        const doneCount = doneRes.status === 'fulfilled' ? doneRes.value.count : 0;
        const progressCount = progressRes.status === 'fulfilled' ? progressRes.value.count : 0;
        const todoCount = todoRes.status === 'fulfilled' ? todoRes.value.count : 0;

        animateCount('kpi-interns', internsCount);
        animateCount('kpi-present', presentCount);
        animateCount('kpi-tasks', doneCount);
        animateCount('kpi-reviews', progressCount);
        updateDonut(doneCount, progressCount, todoCount);

        // Fetch Weekly Completed Tasks dynamically
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const { data: completedTasks } = await sb.from('tasks')
            .select('created_at')
            .eq('status', 'Done')
            .gte('created_at', sevenDaysAgo.toISOString());
        
        const dayCounts = [0, 0, 0, 0, 0, 0, 0];
        const dayNames = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dayNames.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
        }

        if (completedTasks) {
            completedTasks.forEach(t => {
                const dateStr = new Date(t.created_at).toLocaleDateString('en-US', { weekday: 'short' });
                const idx = dayNames.indexOf(dateStr);
                if (idx !== -1) {
                    dayCounts[idx]++;
                }
            });
        }
        renderBarChart(dayCounts, dayNames);

        if (tasksRes.status === 'fulfilled' && tasksRes.value.data) {
            allTaskData = tasksRes.value.data.map(t => ({
                id: t.id, date: t.created_at?.split('T')[0] || '—', intern: t.users?.name || 'Unassigned', title: t.title || '—', status: t.status || '—'
            }));
            renderTable(allTaskData, 'table-body');
        }
    } catch (err) {
        console.error("[Skyars] Dashboard Load Error:", err);
    }
}

async function loadTasksData(sb) {
    try {
        const { data, error } = await sb.from('tasks').select('id, created_at, title, status, user_id, users(name)').order('created_at', { ascending: false });
        if (error) throw error;

        allTaskData = data.map(t => ({
            id: t.id,
            date: t.created_at?.split('T')[0] || '—',
            intern: t.users?.name || 'Unassigned',
            title: t.title,
            status: t.status
        }));

        renderTable(allTaskData, 'tasks-page-table-body');
        setupFilters('tasks-page-table-body');
    } catch (err) {
        console.error('[Skyars] Error loading tasks:', err);
        showToast('Failed to load tasks.', 'error');
    }
}

async function loadInternsData(sb) {
    const tbody = document.getElementById('interns-table-body');
    if (!tbody) return;

    try {
        const { data, error } = await sb.from('users').select('*').eq('role', 'intern').order('created_at', { ascending: false });
        if (error) throw error;
        renderInternsTable(data);
    } catch (err) {
        console.error('[Skyars] Error loading interns:', err);
        showToast('Failed to load interns.', 'error');
    }
}

function renderInternsTable(interns) {
    const tbody = document.getElementById('interns-table-body');
    if (!tbody) return;
    if (!interns || interns.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:48px;color:var(--text-dim);">No interns registered yet.</td></tr>`;
        return;
    }
    tbody.innerHTML = interns.map(i => {
        const badgeClass = i.status === 'Active' ? 'badge-done' : 'badge-todo';
        return `
            <tr>
                <td class="td-primary clickable-name" onclick="window.showInternMonthlyAttendance('${i.id}', '${i.name.replace(/'/g, "\\'")}')" title="Click to view monthly attendance">${i.name}</td>
                <td>${i.email || '—'}</td>
                <td>${i.designation || '—'}</td>
                <td><span class="badge ${badgeClass}">${i.status}</span></td>
                <td style="text-align:right;">
                    <button class="btn btn-ghost" style="padding:5px 10px;font-size:11px;" onclick="window.showEditInternModal('${i.id}', '${i.name.replace(/'/g, "\\'")}', '${(i.designation || '').replace(/'/g, "\\'")}', '${i.status}')">Edit</button>
                </td>
            </tr>`;
    }).join('');
}

async function loadAttendanceData(sb) {
    const tbody = document.getElementById('attendance-table-body');
    if (!tbody) return;

    try {
        const today = new Date().toISOString().split('T')[0];

        // 1. Fetch all active interns
        const { data: interns, error: iErr } = await sb.from('users')
            .select('id, name')
            .eq('role', 'intern')
            .eq('status', 'Active')
            .order('name', { ascending: true });
        if (iErr) throw iErr;

        // 2. Fetch today's attendance check-ins
        const { data: attendance, error: aErr } = await sb.from('attendance')
            .select('date, check_in, status, user_id')
            .eq('date', today);
        if (aErr) throw aErr;

        // Map today's attendance records by user_id
        const attendanceMap = {};
        if (attendance) {
            attendance.forEach(att => {
                attendanceMap[att.user_id] = att;
            });
        }

        // 3. Construct attendance rows for all active interns
        allAttendanceData = interns.map(intern => {
            const att = attendanceMap[intern.id];
            let checkInTime = '—';
            let status = 'Absent';

            if (att) {
                status = att.status;
                if (att.check_in) {
                    const timeParts = att.check_in.split(':');
                    if (timeParts.length >= 2) {
                        let hh = parseInt(timeParts[0]);
                        const mm = timeParts[1];
                        const ampm = hh >= 12 ? 'PM' : 'AM';
                        hh = hh % 12 || 12;
                        checkInTime = `${String(hh).padStart(2, '0')}:${mm} ${ampm}`;
                    } else {
                        checkInTime = att.check_in;
                    }
                }
            }

            return {
                user_id: intern.id,
                name: intern.name || 'Unknown',
                date: today,
                check_in: checkInTime,
                status: status
            };
        });

        renderAttendanceTable(allAttendanceData);
        setupAttendanceExport(allAttendanceData);

        // Bind Search Input dynamic filtering
        const searchInput = document.getElementById('attendance-search-input');
        if (searchInput) {
            // Remove previous listeners
            const newSearchInput = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearchInput, searchInput);

            newSearchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                const filtered = allAttendanceData.filter(row => row.name.toLowerCase().includes(query));
                renderAttendanceTable(filtered);
            });
        }
    } catch (err) {
        console.error('[Skyars] Error loading attendance:', err);
        showToast('Failed to load attendance logs.', 'error');
    }
}

function renderAttendanceTable(list) {
    const tbody = document.getElementById('attendance-table-body');
    if (!tbody) return;
    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:48px;color:var(--text-dim);">No attendance records found.</td></tr>`;
        return;
    }
    tbody.innerHTML = list.map(row => {
        const badgeClass = row.status === 'Present' ? 'badge-done' : row.status === 'Late' ? 'badge-progress' : 'badge-absent';
        return `
            <tr>
                <td class="td-primary clickable-name" onclick="showInternMonthlyAttendance('${row.user_id}', '${row.name}')" title="Click to view monthly attendance">${row.name}</td>
                <td>${row.date}</td>
                <td class="td-mono">${row.check_in}</td>
                <td><span class="badge ${badgeClass}">${row.status}</span></td>
            </tr>`;
    }).join('');
}

function setupAttendanceExport(list) {
    const btn = document.getElementById('attendance-export-btn');
    if (!btn) return;
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
        const headers = ['Intern Name', 'Date', 'Check-In Time', 'Status'];
        const csvRows = list.map(r => [r.name, r.date, r.check_in, r.status].map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
        const csv = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance-report-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Attendance report exported!', 'success');
    });
}

// Global function to show specific intern monthly details
window.showInternMonthlyAttendance = async function(userId, userName) {
    const modal = document.getElementById('intern-attendance-modal');
    const title = document.getElementById('intern-attendance-modal-title');
    const tbody = document.getElementById('intern-attendance-modal-tbody');

    if (!modal || !tbody) return;

    if (title) title.textContent = `Monthly Attendance — ${userName}`;
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-dim);"><span class="loader-ring" style="margin:0 auto 8px;width:24px;height:24px;display:inline-block;vertical-align:middle;"></span>Loading monthly logs...</td></tr>`;

    window.openModal('intern-attendance-modal');

    const sb = window.supabaseClient;
    if (!sb) return;

    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const todayDay = now.getDate();

        // Generate list of dates from today back to the 1st of the month
        const dateList = [];
        for (let day = todayDay; day >= 1; day--) {
            const dateObj = new Date(year, month, day);
            const yyyy = dateObj.getFullYear();
            const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
            const dd = String(dateObj.getDate()).padStart(2, '0');
            dateList.push(`${yyyy}-${mm}-${dd}`);
        }

        const startOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;

        const { data, error } = await sb.from('attendance')
            .select('date, check_in, status')
            .eq('user_id', userId)
            .gte('date', startOfMonth)
            .order('date', { ascending: false });

        if (error) throw error;

        const recordsMap = {};
        if (data) {
            data.forEach(r => {
                recordsMap[r.date] = r;
            });
        }

        tbody.innerHTML = dateList.map(dateStr => {
            const record = recordsMap[dateStr];
            let checkInTime = '—';
            let status = 'Absent';
            let badgeClass = 'badge-absent';

            if (record) {
                status = record.status;
                badgeClass = status === 'Present' ? 'badge-done' : status === 'Late' ? 'badge-progress' : 'badge-absent';

                if (record.check_in) {
                    const timeParts = record.check_in.split(':');
                    if (timeParts.length >= 2) {
                        let hh = parseInt(timeParts[0]);
                        const mm = timeParts[1];
                        const ampm = hh >= 12 ? 'PM' : 'AM';
                        hh = hh % 12 || 12;
                        checkInTime = `${String(hh).padStart(2, '0')}:${mm} ${ampm}`;
                    } else {
                        checkInTime = record.check_in;
                    }
                }
            } else {
                // Check if Sunday
                const dObj = new Date(dateStr);
                const dayOfWeek = dObj.getDay();
                if (dayOfWeek === 0) {
                    status = 'Weekend';
                    badgeClass = 'badge-todo';
                }
            }

            return `
                <tr>
                    <td style="padding:10px 16px;">${dateStr}</td>
                    <td class="td-mono" style="padding:10px 16px;">${checkInTime}</td>
                    <td style="padding:10px 16px;"><span class="badge ${badgeClass}">${status}</span></td>
                </tr>`;
        }).join('');
    } catch (err) {
        console.error('[Skyars] Error loading monthly attendance:', err);
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--red);">Failed to load monthly logs.</td></tr>`;
    }
};

// Global function to show Edit Intern modal
window.showEditInternModal = function(id, name, designation, status) {
    const modal = document.getElementById('edit-intern-modal');
    if (!modal) return;

    const idInput = document.getElementById('edit-intern-id-input');
    const nameInput = document.getElementById('edit-intern-name-input');
    const designationInput = document.getElementById('edit-intern-designation-input');
    const statusSelect = document.getElementById('edit-intern-status-select');

    if (idInput) idInput.value = id;
    if (nameInput) nameInput.value = name;
    if (designationInput) designationInput.value = designation;
    if (statusSelect) statusSelect.value = status;

    window.openModal('edit-intern-modal');
};

// ============================================
//  MODAL SUBMISSION AND FORM WIRING
// ============================================
function setupModalHandlers(sb) {
    // 1. Add Intern Handler
    const addInternForm = document.getElementById('add-intern-form');
    if (addInternForm) {
        addInternForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('intern-name-input').value.trim();
            const email = document.getElementById('intern-email-input').value.trim().toLowerCase();
            const password = document.getElementById('intern-password-input').value;
            const designation = document.getElementById('intern-designation-input').value.trim();
            const submitBtn = document.getElementById('add-intern-submit');

            if (!name || !email || !password || !designation) {
                showToast('Please fill all fields.', 'warning');
                return;
            }

            setLoading(submitBtn, true, 'Creating Intern...');

            try {
                // Sign up user using a standalone client instance to prevent logging out admin
                const tempClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
                const { data, error } = await tempClient.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            name: name,
                            role: 'intern',
                            designation: designation
                        }
                    }
                });

                if (error) throw error;

                showToast('Intern registered successfully!', 'success');
                closeModal('add-intern-modal');
                addInternForm.reset();

                // Refresh view if current
                const activeNav = document.querySelector('.sidebar-nav .nav-item.active');
                if (activeNav && activeNav.getAttribute('data-route')?.includes('interns.html')) {
                    await loadInternsData(sb);
                }
            } catch (err) {
                console.error('[Skyars] Register intern error:', err);
                showToast(err.message || 'Error registering intern.', 'error');
            } finally {
                setLoading(submitBtn, false, 'Create Intern');
            }
        });
    }

    // 2. Assign Task Handler
    const assignTaskForm = document.getElementById('assign-task-form');
    if (assignTaskForm) {
        assignTaskForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const taskId = document.getElementById('task-id-input').value.trim().toUpperCase();
            const title = document.getElementById('task-title-input').value.trim();
            const description = document.getElementById('task-desc-input').value.trim();
            const internId = document.getElementById('task-intern-select').value;
            const dueDate = document.getElementById('task-due-input').value;
            const submitBtn = document.getElementById('assign-task-submit');

            if (!taskId || !title || !internId || !dueDate) {
                showToast('Please fill required fields.', 'warning');
                return;
            }

            setLoading(submitBtn, true, 'Assigning...');

            try {
                const { error } = await sb.from('tasks').insert({
                    id: taskId,
                    title: title,
                    description: description,
                    user_id: internId,
                    due_date: dueDate,
                    status: 'To-Do'
                });

                if (error) throw error;

                showToast('Task assigned successfully!', 'success');
                closeModal('assign-task-modal');
                assignTaskForm.reset();

                // Refresh active view
                const activeNav = document.querySelector('.sidebar-nav .nav-item.active');
                const route = activeNav?.getAttribute('data-route');
                if (route?.includes('overview.html')) {
                    await loadDashboardData(sb);
                } else if (route?.includes('tasks.html')) {
                    await loadTasksData(sb);
                }
            } catch (err) {
                console.error('[Skyars] Assign task error:', err);
                showToast(err.message || 'Error assigning task.', 'error');
            } finally {
                setLoading(submitBtn, false, 'Assign Task');
            }
        });
    }

    // 3. Edit Intern Handler
    const editInternForm = document.getElementById('edit-intern-form');
    if (editInternForm) {
        editInternForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('edit-intern-id-input').value;
            const name = document.getElementById('edit-intern-name-input').value.trim();
            const designation = document.getElementById('edit-intern-designation-input').value.trim();
            const status = document.getElementById('edit-intern-status-select').value;
            const submitBtn = document.getElementById('edit-intern-submit');

            if (!id || !name || !designation || !status) {
                showToast('Please fill all fields.', 'warning');
                return;
            }

            setLoading(submitBtn, true, 'Saving Changes...');

            try {
                const { error } = await sb.from('users')
                    .update({ name, designation, status })
                    .eq('id', id);

                if (error) throw error;

                showToast('Intern updated successfully!', 'success');
                closeModal('edit-intern-modal');
                editInternForm.reset();

                // Refresh interns table if current view is Interns
                const activeNav = document.querySelector('.sidebar-nav .nav-item.active');
                if (activeNav && activeNav.getAttribute('data-route')?.includes('interns.html')) {
                    await loadInternsData(sb);
                }
            } catch (err) {
                console.error('[Skyars] Update intern error:', err);
                showToast(err.message || 'Error updating intern.', 'error');
            } finally {
                setLoading(submitBtn, false, 'Save Changes');
            }
        });
    }
}

async function populateInternsDropdown(sb) {
    const select = document.getElementById('task-intern-select');
    if (!select) return;

    try {
        const { data, error } = await sb.from('users').select('id, name').eq('role', 'intern').eq('status', 'Active');
        if (error) throw error;
        select.innerHTML = '<option value="">Select an intern...</option>' + data.map(i => `<option value="${i.id}">${i.name}</option>`).join('');
    } catch (err) {
        console.error('[Skyars] Error populating interns dropdown:', err);
    }
}

// ============================================
//  RENDER UTILITIES
// ============================================
function setupFilters(targetTbodyId) {
    const pills = document.querySelectorAll('.filter-pill');
    pills.forEach(pill => {
        const newPill = pill.cloneNode(true);
        pill.parentNode.replaceChild(newPill, pill);
        
        newPill.addEventListener('click', () => {
            const container = newPill.closest('.table-toolbar');
            if(container) {
                container.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            }
            newPill.classList.add('active');
            
            const filter = newPill.dataset.filter;
            const filtered = filter === 'all' ? allTaskData : allTaskData.filter(t => t.status === filter);
            renderTable(filtered, targetTbodyId);
        });
    });

    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        const newExportBtn = exportBtn.cloneNode(true);
        exportBtn.parentNode.replaceChild(newExportBtn, exportBtn);
        newExportBtn.addEventListener('click', () => exportCSV(allTaskData));
    }
}

function renderBarChart(data, days) {
    const container = document.getElementById('bar-chart');
    if (!container) return;
    const max = Math.max(...data, 1);
    container.innerHTML = data.map((val, i) => `
        <div class="bar-col" title="${val} tasks">
            <div class="bar-track"><div class="bar-fill" data-height="${(val / max) * 100}" style="height:0%;"></div></div>
            <span class="bar-label">${days[i]}</span>
        </div>
    `).join('');
    
    requestAnimationFrame(() => setTimeout(() => {
        container.querySelectorAll('.bar-fill').forEach(bar => bar.style.height = bar.dataset.height + '%');
    }, 150));
}

function updateDonut(done, progress, todo) {
    const total = done + progress + todo;
    if (document.getElementById('donut-total')) animateCount('donut-total', total);
    if (document.getElementById('legend-done')) document.getElementById('legend-done').textContent = done;
    if (document.getElementById('legend-progress')) document.getElementById('legend-progress').textContent = progress;
    if (document.getElementById('legend-todo')) document.getElementById('legend-todo').textContent = todo;
    
    if (total === 0) return;
    const donePct = (done / total) * 100;
    const progressPct = (progress / total) * 100;
    const todoPct = (todo / total) * 100;
    
    setTimeout(() => {
        if (document.getElementById('donut-done')) document.getElementById('donut-done').setAttribute('stroke-dasharray', `${donePct},100`);
        if (document.getElementById('donut-progress')) {
            document.getElementById('donut-progress').setAttribute('stroke-dasharray', `${progressPct},100`);
            document.getElementById('donut-progress').setAttribute('stroke-dashoffset', `${-donePct}`);
        }
        if (document.getElementById('donut-todo')) {
            document.getElementById('donut-todo').setAttribute('stroke-dasharray', `${todoPct},100`);
            document.getElementById('donut-todo').setAttribute('stroke-dashoffset', `${-(donePct + progressPct)}`);
        }
    }, 200);
}

function renderTable(data, targetTbodyId = 'table-body') {
    const tbody = document.getElementById(targetTbodyId);
    if (!tbody) return;
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:48px;color:var(--text-dim);">No tasks found.</td></tr>`;
        return;
    }
    tbody.innerHTML = data.map(row => {
        const badgeClass = row.status === 'Done' ? 'badge-done' : row.status === 'In Progress' ? 'badge-progress' : 'badge-todo';
        return `
            <tr>
                <td class="td-mono">${row.id}</td>
                <td>${row.date}</td>
                <td class="td-primary">${row.intern}</td>
                <td>${row.title}</td>
                <td><span class="badge ${badgeClass}">${row.status}</span></td>
                <td style="text-align:right;">
                    <button class="btn btn-ghost" style="padding:5px 10px;font-size:11px;" onclick="showToast('Task details can be checked here.', 'info')">View</button>
                </td>
            </tr>`;
    }).join('');
}

// ============================================
//  UTILITIES
// ============================================
function animateCount(elId, target) {
    const el = document.getElementById(elId);
    if (!el) return;
    const start = performance.now(), from = parseInt(el.textContent) || 0;
    function update(now) {
        const progress = Math.min((now - start) / 800, 1);
        el.textContent = Math.round(from + (target - from) * (1 - Math.pow(1 - progress, 3)));
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

function showPage() {
    const body = document.getElementById('main-body');
    const loader = document.getElementById('loading-screen');
    if (body) { body.style.display = 'flex'; body.style.animation = 'fadeIn 0.3s ease'; }
    if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 400); }
}

function hideLoader() {
    const loader = document.getElementById('loading-screen');
    if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 400); }
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

function exportCSV(data) {
    if (!data || data.length === 0) {
        showToast('No data to export.', 'error');
        return;
    }
    const headers = ['Task ID', 'Date', 'Intern', 'Title', 'Status'];
    const rows = data.map(r => [r.id, r.date, r.intern, r.title, r.status]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `skyars-tasks-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported successfully!', 'success');
}