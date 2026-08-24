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

async function getAllJobs() {
  const res = await fetch(API + '/api/joblisting', {
    headers: authHeaders(),
  });
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed to get job listings');
  return data.jobs
}

 async function getRecommendedJobs() {
  const res = await fetch(API + '/api/recommendedJobs', {
    headers: authHeaders(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load job listings');
  return data.jobs;
}

async function createJobListing(job_name, pay_range, job_description, required_experience, contact_email, contact_phone) {
  const res = await fetch(API + '/api/joblisting', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({job_name,pay_range,job_description,required_experience,contact_email,contact_phone,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Job listing failed');
  return data;
}

async function addStudentInfo(skills_raw_input, project_description) {
  const res = await fetch(API + '/api/studentInfo', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({skills_raw_input, project_description
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Adding student info Failed');
  return data;
}