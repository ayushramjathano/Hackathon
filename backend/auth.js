import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing Supabase env vars. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in backend/.env'
  );
}

// Anon client: signUp / signIn / getUser (acts like a public client on the server)
export const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

// Service role: trusted server-only writes (bypasses RLS). Never send this key to the browser.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const ALLOWED_ROLES = new Set(['student', 'employer']);

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function validateRegisterBody(body) {
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  const firstName = String(body?.firstName ?? '').trim();
  const lastName = String(body?.lastName ?? '').trim();
  const roleInput = body?.role == null || body?.role === '' ? 'student' : String(body.role).trim();

  const errors = [];

  if (!email) errors.push('email is required');
  if (!password) errors.push('password is required');
  else if (String(password).length < 6) errors.push('password must be at least 6 characters');
  if (!firstName) errors.push('firstName is required');
  if (!lastName) errors.push('lastName is required');
  if (!ALLOWED_ROLES.has(roleInput)) {
    errors.push(`role must be one of: ${[...ALLOWED_ROLES].join(', ')}`);
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      email,
      password: String(password),
      firstName,
      lastName,
      role: roleInput,
    },
  };
}

/**
 * POST /api/register
 * 1) Create Auth identity (email/password) via Supabase Auth
 * 2) Insert profile row into public.users (matches your SQL schema)
 */
export async function register(req, res) {
  const parsed = validateRegisterBody(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.errors.join('; ') });
  }

  const { email, password, firstName, lastName, role } = parsed.value;

  const { data: authData, error: authError } = await supabaseAnon.auth.signUp({
    email,
    password,
  });

  if (authError) {
    return res.status(400).json({ error: authError.message });
  }

  const userId = authData.user?.id;
  if (!userId) {
    return res.status(400).json({ error: 'User creation failed.' });
  }

  const { data: profile, error: dbError } = await supabaseAdmin
    .from('users')
    .insert({
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      role,
    })
    .select()
    .single();

  if (dbError) {
    console.error('Profile insert failed after auth signup:', dbError);
    return res.status(500).json({
      error: 'Account was created in Auth but saving profile failed.',
      details: dbError.message,
    });
  }

  const session = authData.session ?? null;
  const message = session
    ? 'Registration successful!'
    : 'Registration successful! Confirm your email before logging in (if confirmations are enabled).';

  return res.status(201).json({
    message,
    user: authData.user,
    profile,
    session,
  });
}

/**
 * POST /api/login
 */
export async function login(req, res) {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const { data, error } = await supabaseAnon.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.json({
    message: 'Login successful!',
    session: data.session,
    user: data.user,
  });
}

/**
 * Middleware: require Authorization: Bearer <access_token>
 * Attaches Supabase auth user to req.user
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({ error: 'Missing access token' });
  }

  const { data, error } = await supabaseAnon.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: error?.message || 'Invalid or expired token' });
  }

  req.user = data.user;
  req.accessToken = token;
  return next();
}

/**
 * GET /api/me — profile for the token's user from public.users
 */
export async function me(req, res) {
  const userId = req.user.id;

  const { data: profile, error } = await supabaseAdmin
    .from('users')
    .select('id, email, first_name, last_name, role, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Failed to load profile for /api/me:', error);
    return res.status(500).json({ error: error.message });
  }

  if (!profile) {
    return res.status(404).json({ error: 'Profile not found for this user' });
  }

  return res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
    },
    profile,
  });
}
