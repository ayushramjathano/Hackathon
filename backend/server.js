import express from 'express';
import cors from 'cors';
import { register, login, requireAuth, me, supabaseAdmin } from './auth.js';


const app = express();

app.use(cors());
app.use(express.json());

// Browser hitting http://localhost:PORT/ is fine — this is an API, not a website.
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    message: 'Hackathon API is running',
    endpoints: {
      register: 'POST /api/register',
      login: 'POST /api/login',
      me: 'GET /api/me (Authorization: Bearer <token>)',
      createJobListing: 'POST /api/joblisting'
    },
  });
});

// Auth APIs for the frontend (or curl) to call
app.post('/api/register', register);
app.post('/api/login', login);
app.get('/api/me', requireAuth, me);
app.post('/api/joblisting', requireAuth, createJobListing);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export async function createJobListing(req, res) {
  const job_name = String(req.body?.job_name ?? '').trim();
  const pay_range = String(req.body?.pay_range ?? req.body?.pay ?? '').trim();
  const job_description = String(req.body?.job_description ?? req.body?.job_desc ?? '').trim();
  const required_experience = String(req.body?.required_experience ?? req.body?.required_exp ?? '').trim();
  const contact_email = String(req.body?.contact_email ?? '').trim();
  const contact_phone = String(req.body?.contact_phone).trim() || null;

  // 2) Validate
  if (!job_name || !pay_range || !job_description || !required_experience || !contact_email) {
    return res.status(400).json({ error: 'Need to fill in all required fields'});
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', req.user.id)
    .maybeSingle();

  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }
  if (!profile || profile.role !== 'employer') {
    return res.status(403).json({ error: 'Only employers can create job listings' });
  }

  // 4) Insert with correct column names + owner
  const { data: job, error } = await supabaseAdmin
    .from('job_listings')
    .insert({
      user_id: req.user.id,
      job_name,
      pay_range,
      job_description,
      required_experience,
      contact_email,
      contact_phone,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // 5) Return the created job
  return res.status(201).json({
    message: 'Job listing created',
    job,
  });
}