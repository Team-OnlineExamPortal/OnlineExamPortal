import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Shell({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  function logout() { signOut(); navigate('/login'); }
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" to="/"><span className="brand-mark">O</span><span>OEP<span className="brand-sub">STUDENT PORTAL</span></span></Link>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav">
        <NavLink end to="/"><span>▦</span> Overview</NavLink>
        <NavLink to="/history"><span>◷</span> Exam history</NavLink>
      </nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">?</span><strong>Need help?</strong><small>Contact your course administrator.</small></div></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div className="breadcrumb">Student workspace <span>/</span> Portal</div><div className="profile"><div className="avatar">{(user?.name || 'S').slice(0, 1).toUpperCase()}</div><div className="profile-copy"><strong>{user?.name || 'Student'}</strong><small>Student account</small></div><button className="text-button" onClick={logout}>Sign out</button></div></header>
      <main className="content">{children}</main>
      <footer className="footer">Online Exam Portal <span>·</span> Secure student workspace</footer>
    </div>
  </div>;
}
