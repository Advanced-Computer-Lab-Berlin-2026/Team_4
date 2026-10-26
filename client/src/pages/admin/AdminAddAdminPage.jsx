import { useState } from 'react';
import { createAdmin } from '../../api/admins.api';
import { getErrorMessage, getFieldErrors } from '../../api/axios';
import { isValidPassword, PASSWORD_HINT } from '../../utils/validators';
import AuthFormLayout from '../../components/auth/AuthFormLayout';
import CredentialsFields from '../../components/auth/CredentialsFields';
import Alert from '../../components/common/Alert';

export default function AdminAddAdminPage() {
  const [values, setValues] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setSuccess(''); setErrors({});
    if (!isValidPassword(values.password)) { setErrors({ password: PASSWORD_HINT }); return; }
    setBusy(true);
    try {
      const { user } = await createAdmin(values);
      setSuccess(`Admin ${user.username} created. You are still signed in to your own account.`);
      setValues({ username: '', password: '' });
    } catch (err) {
      setError(getErrorMessage(err));
      setErrors(Object.fromEntries(getFieldErrors(err).map(({ field, message }) => [field, message])));
    } finally { setBusy(false); }
  }
  return <AuthFormLayout title="Add admin">
    <p className="muted">Create an account with full administrator access.</p>
    <Alert variant="error">{error}</Alert><Alert variant="success">{success}</Alert>
    <form onSubmit={submit} aria-busy={busy}>
      <CredentialsFields values={values} onChange={(e) => setValues({ ...values, [e.target.name]: e.target.value })} errors={errors} newPassword />
      <button className="btn" disabled={busy}>{busy ? 'Creating admin…' : 'Create admin'}</button>
    </form>
  </AuthFormLayout>;
}
