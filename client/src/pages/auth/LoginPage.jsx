import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AuthFormLayout from '../../components/auth/AuthFormLayout';
import CredentialsFields from '../../components/auth/CredentialsFields';
import Alert from '../../components/common/Alert';
import { getErrorMessage } from '../../api/axios';

export default function LoginPage() {
  const [values, setValues] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const user = await login(values.username, values.password);
      const from = location.state?.from;
      const safeFrom = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !['/login', '/register'].includes(from);
      navigate(safeFrom ? from : user.role === 'admin' ? '/admin' : '/', { replace: true });
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }
  return <AuthFormLayout title="Welcome back">
    <Alert variant="error">{error}</Alert>
    <form onSubmit={submit} aria-busy={busy}>
      <CredentialsFields values={values} onChange={(e) => setValues({ ...values, [e.target.name]: e.target.value })} />
      <button className="btn" disabled={busy}>{busy ? 'Signing in…' : 'Login'}</button>
    </form>
    <p><Link to="/forgot-password">Forgot password?</Link></p>
    <p>New to ShareShed? <Link to="/register">Create an account</Link></p>
  </AuthFormLayout>;
}
