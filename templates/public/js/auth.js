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
  isLoggedIn: () => !!localStorage.getItem('jwt_token'),
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem('user_info'));
    } catch {
      return null;
    }
  },
  login: async (email, password) => {
    try {
      const data = await apiFetch('/auth/login', 'POST', { email, password });
      localStorage.setItem('jwt_token', data.token);
      localStorage.setItem('user_info', JSON.stringify(data.user));
      return data.user;
    } catch (e) {
      throw e;
  register: async (name, email, password, hostelId) => {
    try {
      const data = await apiFetch('/auth/register', 'POST', { name, email, password, role: 'student', hostelId });
      localStorage.setItem('jwt_token', data.token);
      localStorage.setItem('user_info', JSON.stringify(data.user));
      return data.user;
    } catch (e) {
      throw e;
    }
  },
  logout: () => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_info');
    window.location.href = '/login';
  },
  requireAuth: () => {
    if (!Auth.isLoggedIn()) {
      window.location.href = '/login';
    }
  },
  requireNoAuth: () => {
    if (Auth.isLoggedIn()) {
      window.location.href = '/';
    }
  }
};
window.Auth = Auth;
