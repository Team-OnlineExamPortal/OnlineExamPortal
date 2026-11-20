import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Exam from './pages/Exam';
import History from './pages/History';
import Admin from './pages/Admin';

function Protected({ children, role = 'Student' }) {
  const { token, user, loading } = useAuth();
  if (loading) return <main className="center-page"><span className="spinner" />Loading your workspace…</main>;
  if (!token || !user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'Administrator' ? '/admin' : '/'} replace />;
  return children;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<Protected><Dashboard /></Protected>} />
    <Route path="/exam/:examId" element={<Protected><Exam /></Protected>} />
    <Route path="/history" element={<Protected><History /></Protected>} />
    <Route path="/admin" element={<Protected role="Administrator"><Admin /></Protected>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}
