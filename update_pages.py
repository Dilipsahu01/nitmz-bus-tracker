import re

# Update admin.html
with open('templates/admin.html', 'r') as f:
    admin_content = f.read()

admin_content = admin_content.replace(
    '<script>',
    '<script src="/static/public/js/api.js"></script>\n<script src="/static/public/js/auth.js"></script>\n<script>'
)

admin_boot = """(async function boot() {
  Auth.requireAuth();
  const user = Auth.getUser();
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('roleTag').style.display = 'inline-flex';
  document.getElementById('roleTag').textContent = user.role.toUpperCase();
  document.getElementById('logoutBtn').style.display = 'block';
  document.getElementById('logoutBtn').onclick = () => Auth.logout();
  
  if (user.role === 'admin' || user.role === 'caretaker') {
    document.getElementById('adminSettings').style.display = 'block';
    document.getElementById('adminDiag').style.display = 'block';
  }
  
  initMap();
  fetchBus();
  S.pollTimer = setInterval(fetchBus, POLL_MS);
})();"""

admin_content = re.sub(r'\(function boot\(\) \{.*?\}\)\(\);', admin_boot, admin_content, flags=re.DOTALL)

with open('templates/admin.html', 'w') as f:
    f.write(admin_content)

# Update index.html
with open('templates/index.html', 'r') as f:
    index_content = f.read()

index_content = index_content.replace(
    '<script>',
    '<script src="/static/public/js/api.js"></script>\n<script src="/static/public/js/auth.js"></script>\n<script>'
)

index_boot = """(function boot() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  
  const btn = document.getElementById('logoutBtn');
  btn.style.display = 'block';
  btn.textContent = 'Admin Login';
  btn.style.background = 'var(--white)';
  btn.style.color = '#000';
  btn.onclick = () => { window.location.href = '/login'; };
  
  // Hide admin elements strictly on public map
  document.getElementById('roleTag').style.display = 'none';
  document.getElementById('adminSettings').style.display = 'none';
  document.getElementById('adminDiag').style.display = 'none';
  
  initMap();
  fetchBus();
  S.pollTimer = setInterval(fetchBus, POLL_MS);
})();"""

index_content = re.sub(r'\(function boot\(\) \{.*?\}\)\(\);', index_boot, index_content, flags=re.DOTALL)

with open('templates/index.html', 'w') as f:
    f.write(index_content)

print("Pages updated successfully")
