// functions.js (frontend)
const API = 'http://localhost:3001';

function authHeaders() {
  const token = localStorage.getItem('access_token');
  return token
    ? { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

 async function login(email, password) {
  const res = await fetch(API + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  if (data.session?.access_token) {
    localStorage.setItem('access_token', data.session.access_token);
  }
  return data;
}


async function register(email, password, first_name, last_name, role) {
    const res = await fetch(API + '/api/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, first_name, last_name, role }),
  });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Register failed');
    if (data.session?.access_token) {
    localStorage.setItem('access_token', data.session.access_token);
  }
  return data
}


 async function getRecommendedJobs() {
  const res = await fetch(API + '/api/recommendedJobs', {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load recommendations');
  return data.jobs; // array ready for the UI
}