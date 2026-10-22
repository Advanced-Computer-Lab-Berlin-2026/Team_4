// DEV ONLY (rendered only by `vite dev`). One click to be logged in as a seeded user, so nobody has to wait
// for Register/Login to be finished. Requires `npm run seed` in /server. Hidden in production builds.
import { useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

const ROLES = ['admin', 'member', 'member2', 'lender', 'applicant'];

export default function DevRoleSwitcher() {
  const { user, refreshUser, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState('');

  const loginAs = async (role) => {
    setErr('');
    try {
      await api.post('/dev/login-as', { role });
      await refreshUser();
    } catch (e) {
      setErr(e?.response?.data?.message || 'Dev login failed - did you run "npm run seed"?');
    }
  };
  const logoutDev = async () => { await api.post('/dev/logout').catch(() => {}); setUser(null); };

  return (
    <div className="dev-switcher">
      <button className="btn btn-small" onClick={() => setOpen((o) => !o)}>DEV {user ? `· ${user.username}` : '· guest'}</button>
      {open && (
        <div className="dev-panel">
          {ROLES.map((r) => <button key={r} className="btn btn-small" onClick={() => loginAs(r)}>as {r}</button>)}
          <button className="btn btn-small" onClick={logoutDev}>as guest</button>
          {err && <div className="field-error">{err}</div>}
        </div>
      )}
    </div>
  );
}
