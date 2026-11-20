import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Shell({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const admin = user?.role === 'Administrator';
  function logout() { signOut(); navigate('/login'); }
  return <div className="app-shell">
    <aside className="sidebar">
      <Link className="brand" to={admin ? '/admin' : '/'}><span className="brand-mark">O</span><span>OEP<span className="brand-sub">{admin ? 'ADMINISTRATOR' : 'STUDENT PORTAL'}</span></span></Link>
      <div className="nav-label">WORKSPACE</div>
      <nav className="side-nav">
        {admin ? <NavLink to="/admin"><span>▦</span> Administration</NavLink> : <>
          <NavLink end to="/"><span>▦</span> Overview</NavLink>
          <NavLink to="/history"><span>◷</span> Exam history</NavLink>
        </>}
      </nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon">?</span><strong>Need help?</strong><small>Contact your course administrator.</small></div></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div className="breadcrumb">{admin ? 'Administrator' : 'Student'} workspace <span>/</span> Portal</div><div className="profile"><div className="avatar">{(user?.name || 'S').slice(0, 1).toUpperCase()}</div><div className="profile-copy"><strong>{user?.name || 'Student'}</strong><small>{admin ? 'Administrator' : 'Student'} account</small></div><button className="text-button" onClick={logout}>Sign out</button></div></header>
      <main className="content">{children}</main>
      <footer className="footer">Online Exam Portal <span>·</span> {admin ? 'Administrator' : 'Student'} workspace</footer>
    </div>
  </div>;
}
