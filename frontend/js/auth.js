
// --- AUTHENTICATION BOUNCER ---
function checkAuth() {
    const token = localStorage.getItem('authToken');
    const expiry = localStorage.getItem('authExpiry');

    // If no token, or token is expired
    if (!token || !expiry || Date.now() > parseInt(expiry)) {
        console.warn("Session invalid or expired. Redirecting to login.");
        localStorage.removeItem('authToken');
        localStorage.removeItem('authExpiry');
        window.location.href = 'login.html';
    }
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authExpiry');
    window.location.href = 'login.html';
}

// Run immediately if we are not on the login page
if (!window.location.pathname.endsWith('login.html')) {
    checkAuth();
}
