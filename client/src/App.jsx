import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Exam from './pages/Exam';
import History from './pages/History';

function Protected({ children }) {
  const { token, user, loading } = useAuth();
  if (loading) return <main className="center-page"><span className="spinner" />Loading your workspace…</main>;
  if (!token || !user) return <Navigate to="/login" replace />;
  if (user.role !== 'Student') return <main className="center-page"><section className="panel"><h1>Student portal</h1><p>This workspace is for student accounts.</p></section></main>;
  return children;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<Protected><Dashboard /></Protected>} />
    <Route path="/exam/:examId" element={<Protected><Exam /></Protected>} />
    <Route path="/history" element={<Protected><History /></Protected>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
