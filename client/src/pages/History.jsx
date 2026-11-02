import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Shell from '../components/Shell';
import { ApiError, examApi } from '../api';
import { useAuth } from '../auth';

export default function History() {
  const { token } = useAuth();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    examApi.history(token).then((data) => setResults(Array.isArray(data) ? data : []))
      .catch((err) => setError(err instanceof ApiError && err.status === 404
        ? 'Your results history will appear here once the result service is available.'
        : err.message)).finally(() => setLoading(false));
  }, [token]);
  return <Shell><div className="eyebrow muted">YOUR PROGRESS</div><h1 className="page-title">Exam history</h1><p className="section-description history-intro">Review completed exams and results from your account.</p>
    {loading ? <div className="center-inline"><span className="spinner"/>Loading history…</div> : error ? <div className="empty-state"><div className="empty-icon">◷</div><h3>No results to show yet</h3><p>{error}</p><Link className="button subtle" to="/">Browse available exams</Link></div> : results.length === 0 ? <div className="empty-state"><div className="empty-icon">◷</div><h3>Your journey starts here</h3><p>Once you complete an exam, your result and attempt details will appear on this page.</p><Link className="button primary" to="/">Browse available exams <span>→</span></Link></div> : <div className="history-table-wrap"><table className="history-table"><thead><tr><th>Exam</th><th>Completed</th><th>Score</th><th>Status</th></tr></thead><tbody>{results.map((item) => <tr key={item.resultId || item.id}><td><strong>{item.examTitle || item.title}</strong></td><td>{item.completedAt ? new Date(item.completedAt).toLocaleString() : '—'}</td><td>{item.score ?? '—'}</td><td><span className="status-pill">{item.status || 'Completed'}</span></td></tr>)}</tbody></table></div>}
  </Shell>;
}
