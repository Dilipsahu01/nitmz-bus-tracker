/**
 * auth.js - Authentication management
 */

// UI Utils
function showToast(msg, type = 'white', duration = 4000) {
  const box = document.getElementById('toastBox');
  if (!box) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(30px)';
    setTimeout(() => el.remove(), 350);
  }, duration);
}
window.showToast = showToast;

const Auth = {
  isLoggedIn: () => {
    try {
      return !!localStorage.getItem('jwt_token');
    } catch (e) {
      return false;
    }
  },
  getUser: () => {
    try {
      const data = localStorage.getItem('user_info');
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },
  login: async (email, password) => {
    const data = await apiFetch('/auth/login', 'POST', { email, password });
    try {
      localStorage.setItem('jwt_token', data.token);
      localStorage.setItem('user_info', JSON.stringify(data.user));
    } catch (e) {
      console.warn('LocalStorage not available');
    }
    return data.user;
  },
  register: async (name, email, password, hostelId) => {
    const data = await apiFetch('/auth/register', 'POST', { name, email, password, role: 'student', hostelId });
    try {
      localStorage.setItem('jwt_token', data.token);
      localStorage.setItem('user_info', JSON.stringify(data.user));
    } catch (e) {
      console.warn('LocalStorage not available');
    }
    return data.user;
  },
  logout: () => {
    try {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('user_info');
    } catch (e) {}
    window.location.href = '/login';
  },
  requireAuth: () => {
    if (!Auth.isLoggedIn()) {
      window.location.replace('/login');
    }
  },
  requireNoAuth: () => {
    if (Auth.isLoggedIn()) {
      window.location.replace('/');
    }
  }
};
window.Auth = Auth;
