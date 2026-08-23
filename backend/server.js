import express from 'express';
import cors from 'cors';
import { register, login, requireAuth, me, supabaseAdmin } from './auth.js';
import { getAiJobRecommendations } from './ai.js';


const app = express();

app.use(cors());
app.use(express.json());

// Browser hitting http://localhost:PORT/ 
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    message: 'Hackathon API is running',
    endpoints: {
      register: 'POST /api/register',
      login: 'POST /api/login',
      me: 'GET /api/me (Authorization: Bearer <token>)',
      createJobListing: 'POST /api/joblisting',
      addStudentInfo: 'POST /api/studentInfo',
      getJobListings: 'GET /api/joblisting',
      getReccomendedJobListings: 'GET /api/reccomendedJobs'
    },
  });
});

// APIs for the front end to call
// posts - make stuff
app.post('/api/register', register);
app.post('/api/login', login);
app.post('/api/joblisting', requireAuth, createJobListing);
app.post('/api/studentInfo', requireAuth, addStudentInfo);

//get - gets stuff
app.get('/api/me', requireAuth, me);
app.get('/api/joblisting', requireAuth, getJobListings);
app.get('/api/recommendedJobs', requireAuth, getRecommendedJobListings);


const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});




// functions that handle the the making and getting of the the student and job stuff.

// creates a job listing
export async function createJobListing(req, res) {
  const job_name = String(req.body?.job_name ?? '').trim();
  const pay_range = String(req.body?.pay_range ?? req.body?.pay ?? '').trim();
  const job_description = String(req.body?.job_description ?? req.body?.job_desc ?? '').trim();
  const required_experience = String(req.body?.required_experience ?? req.body?.required_exp ?? '').trim();
  const contact_email = String(req.body?.contact_email ?? '').trim();
  const contact_phone = String(req.body?.contact_phone).trim() || null;

  // makes sure all data is in, validates it
  if (!job_name || !pay_range || !job_description || !required_experience || !contact_email) {
    return res.status(400).json({ error: 'Need to fill in all required fields' });
  }

  //gets the user informations
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', req.user.id)
    .maybeSingle();

  //ensures that the logged in user is a employer
  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }
  if (!profile || profile.role !== 'employer') {
    return res.status(403).json({ error: 'Only employers can create job listings' });
  }

  // puts the info into the correct table
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

  // returns the output
  return res.status(201).json({
    message: 'Job listing created',
    job,
  });
}


// adds student info into the database
export async function addStudentInfo(req, res) {
  const skills_raw_input = String(req.body?.skills_raw_input ?? '').trim();
  const project_description = String(req.body?.project_description ?? '').trim();

  // make sure everything that is required is filled
  if (!skills_raw_input || !project_description) {
    return res.status(400).json({ error: 'Need to fill in all required fields' });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', req.user.id)
    .maybeSingle();

  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }
  if (!profile || profile.role !== 'student') {
    return res.status(403).json({ error: 'Only students can add profile information' });
  }

  // insert into table with correct stuff
  const { data: info, error } = await supabaseAdmin
    .from('student_info')
    .insert({
      user_id: req.user.id,
      skills_raw_input,
      project_description,
    })
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  //Return the created student information 
  return res.status(201).json({
    message: 'Student info added',
    info,
  });
}

export async function getJobListings(req, res) {
  const { data: jobs, error } = await supabaseAdmin
    .from('job_listings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.json({
    message: "job listings gotten",
    jobs: jobs ?? [],
  });
}

export async function getRecommendedJobListings(req, res) {
  // 1) student only
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', req.user.id)
    .maybeSingle();

  if (profileError) return res.status(500).json({ error: profileError.message });
  if (!profile || profile.role !== 'student') {
    return res.status(403).json({ error: 'Only students can get recommendations' });
  }

  // 2) student info required
  const { data: studentInfo, error: studentError } = await supabaseAdmin
    .from('student_info')
    .select('skills_raw_input, project_description')
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (studentError) return res.status(500).json({ error: studentError.message });
  if (!studentInfo) {
    return res.status(400).json({ error: 'Add student info before getting recommendations' });
  }

  // 3) jobs for AI to choose from
  const { data: allJobs, error: jobsError } = await supabaseAdmin
    .from('job_listings')
    .select('id, job_name, pay_range, job_description, required_experience')
    .order('created_at', { ascending: false });

  if (jobsError) return res.status(500).json({ error: jobsError.message });
  if (!allJobs?.length) {
    return res.json({ message: 'Recommended jobs', jobs: [] });
  }

  // 4) AI stub (later: real model)
  const aiRecs = await getAiJobRecommendations(studentInfo, allJobs);
  const ids = aiRecs.map((r) => r.id);
  if (!ids.length) {
    return res.json({ message: 'Recommended jobs', jobs: [] });
  }

  // 5) fetch full rows for those ids
  const { data: rows, error } = await supabaseAdmin
    .from('job_listings')
    .select('*')
    .in('id', ids);

  if (error) return res.status(500).json({ error: error.message });

  // 6) merge reasons, keep AI order
  const byId = new Map((rows ?? []).map((job) => [job.id, job]));
  const jobs = aiRecs
    .map((rec) => {
      const job = byId.get(rec.id);
      if (!job) return null;
      return { ...job, reason: rec.reason };
    })
    .filter(Boolean);

  // 7) single response
  return res.json({
    message: 'Recommended jobs',
    jobs,
  });
}
