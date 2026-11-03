import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import { examApi } from '../api';
import { useAuth } from '../auth';

function prettyDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function Dashboard() {
  const { token, user } = useAuth();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setLoading(true); setError('');
    examApi.available(token).then((data) => setExams(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);
  const firstName = (user?.name || 'Student').trim().split(/\s+/)[0];

  return <Shell>
    <section className="welcome-banner"><div className="welcome-orb orb-one"/><div className="welcome-orb orb-two"/><div className="banner-copy"><div className="eyebrow banner-eyebrow">YOUR STUDENT OVERVIEW <span className="tiny-star">✳</span></div><h1>Good to see you, {firstName}.</h1><p>Your next opportunity to learn is one exam away.</p></div><div className="banner-art" aria-hidden="true"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="paper-card"><span className="paper-heading"/><span/><span/><span className="paper-check">✓</span></div><div className="art-spark">✦</div></div></section>
    <div className="section-heading"><div><div className="eyebrow muted">READY WHEN YOU ARE</div><h2>Available exams</h2><p className="section-description">Exams currently open for you to take.</p></div><button className="button subtle" onClick={load} disabled={loading}><span className={loading ? 'refresh spinning' : 'refresh'}>↻</span> Refresh</button></div>
    {error && <div className="notice error">{error}<button className="inline-action" onClick={load}>Try again</button></div>}
    {loading ? <div className="exam-grid"><div className="skeleton-card"/><div className="skeleton-card"/></div> : exams.length === 0 && !error ? <div className="empty-state"><div className="empty-icon">▤</div><h3>You’re all caught up</h3><p>There are no exams open right now. Check back when your next exam window begins.</p></div> : <div className="exam-grid">{exams.map((exam) => <article className="exam-card" key={exam.examId || exam.id}><div className="exam-card-top"><span className="category-pill"><span/> {exam.category}</span><span className="open-label">OPEN NOW</span></div><h3>{exam.title}</h3><div className="exam-meta"><span><b>◷</b>{exam.durationMinutes} min</span><span><b>▤</b>{exam.questionCount} questions</span></div><div className="exam-window"><span>Window closes</span><strong>{prettyDate(exam.endTime)}</strong></div><div className="exam-actions"><Link className="button primary card-button" to={`/exam/${encodeURIComponent(exam.examId || exam.id)}?start=1`}>Start exam <span>→</span></Link><Link className="details-link" to={`/exam/${encodeURIComponent(exam.examId || exam.id)}`}>View details</Link></div></article>)}</div>}
    <div className="dashboard-note"><span>i</span><p><strong>Before you begin</strong> Find a quiet place and make sure you have a stable internet connection. Your exam timer begins when you start.</p></div>
  </Shell>;
}
