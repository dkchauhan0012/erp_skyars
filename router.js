// ============================================
//  SKYARS ERP — SPA Router
//  Fetches HTML partials from views/ folder
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const appContent = document.getElementById('app-content');
    const pageTitle = document.getElementById('page-title');
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');

    async function loadPage(url, title) {
        if (!appContent) return;
        
        // Load hote waqt loader show karna
        appContent.innerHTML = '<div class="loader-ring" style="margin: 40px auto; border-top-color: var(--accent);"></div>';

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const html = await response.text();
            
            // Fetch kiya hua HTML container me daal do
            appContent.innerHTML = html; 
            
            // Topbar ka title update karo
            if (pageTitle && title) {
                pageTitle.textContent = title; 
            }

            // BOHOT ZAROORI: Ye custom event dispatch karna jisko admin-app.js aur intern-app.js listen kar rahe hain
            const event = new CustomEvent('viewLoaded', { detail: { route: url } });
            document.dispatchEvent(event);

        } catch (err) {
            console.error('Error loading view:', err);
            appContent.innerHTML = `
                <div style="color:var(--red); padding: 20px; text-align: center; border: 1px solid rgba(239,68,68,0.2); border-radius: 10px; background: rgba(239,68,68,0.05); margin-top: 20px;">
                    <h3>Failed to load page content.</h3>
                    <p style="font-size:13px; margin-top:10px;">Aap is file ko direct browser me open nahi kar sakte CORS restrictions ki wajah se. VS Code me 'Live Server' extension ka use karein.</p>
                </div>
            `;
        }
    }

    // Sidebar ke saare links pe click events lagana
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const route = item.getAttribute('data-route');
            const title = item.getAttribute('data-title');

            if (route) {
                e.preventDefault();
                // Baaki sab se 'active' class hatake current pe lagana
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                
                // Page load karna
                loadPage(route, title);
            }
        });
    });

    // Jab app pehli baar load ho toh jo tab pehle se 'active' hai usko load kar dena
    const activeNav = document.querySelector('.sidebar-nav .nav-item.active');
    if (activeNav && activeNav.getAttribute('data-route')) {
        loadPage(activeNav.getAttribute('data-route'), activeNav.getAttribute('data-title'));
    }
});