import re

with open('templates/index.html', 'r') as f:
    content = f.read()

# Update fetchBus to hit the new protected endpoint
content = content.replace("fetch('/api/public/buses')", "apiFetch('/buses/live')")
content = content.replace(".then(r => { if(!r.ok) throw new Error(); return r.json(); })\n    .then(json => {", ".then(json => {")

# Update boot function to require auth and handle dynamic roles
boot_code = """(function boot() {
  Auth.requireAuth();
  const user = Auth.getUser();
  if (!user) return; // will redirect anyway

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  
  const btn = document.getElementById('logoutBtn');
  btn.style.display = 'block';
  btn.textContent = 'Logout';
  btn.style.background = '';
  btn.style.color = '';
  btn.onclick = () => Auth.logout();
  
  if (user.role === 'admin' || user.role === 'caretaker') {
    document.getElementById('roleTag').style.display = 'inline-flex';
    document.getElementById('roleTag').textContent = user.role.toUpperCase();
    document.getElementById('adminSettings').style.display = 'block';
    document.getElementById('adminDiag').style.display = 'block';
  } else {
    document.getElementById('roleTag').style.display = 'none';
    document.getElementById('adminSettings').style.display = 'none';
    document.getElementById('adminDiag').style.display = 'none';
  }
  
  initMap();
  fetchBus();
  S.pollTimer = setInterval(fetchBus, POLL_MS);
})();"""

content = re.sub(r'\(function boot\(\) \{.*?\}\)\(\);', boot_code, content, flags=re.DOTALL)

with open('templates/index.html', 'w') as f:
    f.write(content)

print("index.html locked down.")
