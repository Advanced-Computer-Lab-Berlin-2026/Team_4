// FOUNDATION (Member 1 maintains). Responsive: collapses into a hamburger on small screens (NFR 1).
import { useState } from 'react';
import Alert from '../common/Alert';
import { getErrorMessage } from '../../api/axios';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { accountLinks, adminLinks, applyLink, guestLinks, lenderLinks, memberLinks } from './navLinks';

export default function Navbar() {
  const { user, isAdmin, isVerifiedLender, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();

  let links = guestLinks;
  if (user && isAdmin) links = [...adminLinks, ...accountLinks.filter((l) => !l.memberOnly)];
  else if (user) {
    links = [...memberLinks, ...(isVerifiedLender ? lenderLinks : [applyLink]), ...accountLinks];
  }

  const handleLogout = async () => {
    setLoggingOut(true); setLogoutError('');
    try {
      await logout();
      setOpen(false);
      navigate('/');
    } catch (err) { setLogoutError(getErrorMessage(err)); }
    finally { setLoggingOut(false); }
  };

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>🛠️ ShareShed</Link>
        <button className="nav-toggle" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen((o) => !o)}>☰</button>
        <nav className={`nav-links ${open ? 'open' : ''}`}>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/admin'} onClick={() => setOpen(false)}>{l.label}</NavLink>
          ))}
          {user && (
            <button className="btn btn-link" disabled={loggingOut} onClick={handleLogout}>{loggingOut ? 'Logging out…' : `Logout (${user.username})`}</button>
          )}
        </nav>
      </div>
      <Alert variant="error">{logoutError}</Alert>
    </header>
  );
}
