import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Login() {
  const { token, user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (token && user) return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const profile = registering ? await signUp(name, email, password) : await signIn(email, password);
      if (profile.role !== 'Student') throw new Error('This portal is for student accounts.');
      navigate('/');
    } catch (err) { setError(err.message || 'Unable to sign in.'); }
    finally { setBusy(false); }
  }

  return <div className="auth-layout">
    <section className="auth-story"><Link className="brand brand-light" to="/login"><span className="brand-mark">O</span><span>OEP<span className="brand-sub">ONLINE EXAM PORTAL</span></span></Link><div className="story-copy"><div className="eyebrow"><span className="live-dot" /> YOUR LEARNING, IN FOCUS</div><h1>Make every<br />attempt count.</h1><p>One calm place to prepare, take your exams, and see how far you’ve come.</p><div className="story-stat"><div className="stat-icon">✓</div><div><strong>Built for focused learning</strong><small>Your exams and progress, all together.</small></div></div></div><div className="story-foot">A clearer way to take your next step.</div></section>
    <main className="auth-main"><div className="auth-card"><div className="mobile-brand"><span className="brand-mark">O</span> OEP</div><div className="eyebrow muted">STUDENT ACCESS</div><h2>{registering ? 'Create your account' : 'Welcome back'}</h2><p className="auth-intro">{registering ? 'Set up your student account to get started.' : 'Sign in to continue to your student workspace.'}</p>
      <form onSubmit={submit} className="form-stack">
        {registering && <label>Full name<input autoComplete="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></label>}
        <label>Email address<input autoComplete="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
        <label>Password<input autoComplete={registering ? 'new-password' : 'current-password'} type="password" minLength={registering ? 8 : undefined} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={registering ? 'At least 8 characters' : 'Enter your password'} /></label>
        {error && <div className="notice error" role="alert">{error}</div>}
        <button className="button primary full" disabled={busy}>{busy ? 'Please wait…' : registering ? 'Create student account' : 'Sign in'}<span>→</span></button>
      </form>
      <div className="switch-auth">{registering ? 'Already have an account?' : 'New to the portal?'} <button type="button" onClick={() => { setRegistering(!registering); setError(''); }}>{registering ? 'Sign in' : 'Create account'}</button></div>
      <div className="auth-security"><span>◈</span> Your account is protected with secure sign-in.</div>
    </div><div className="auth-copyright">© 2026 Online Exam Portal</div></main>
  </div>;
}
