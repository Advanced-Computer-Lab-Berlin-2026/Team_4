// CHANGE PASSWORD - Owner: Member 2 - Requirements: 10
// Route: /account/password   Access: auth   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
import { useState } from 'react';
import { changePassword } from '../../api/account.api';
import { getErrorMessage, getFieldErrors } from '../../api/axios';
import { isValidPassword, PASSWORD_HINT } from '../../utils/validators';
import PasswordInput from '../../components/account/PasswordInput';
import Alert from '../../components/common/Alert';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function ChangePasswordPage() {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const change = (e) => setValues({ ...values, [e.target.name]: e.target.value });

  async function submit(event) {
    event.preventDefault(); setError(''); setSuccess(''); setErrors({});
    // Client checks are only for quick feedback; the server re-validates everything.
    if (!isValidPassword(values.newPassword)) { setErrors({ newPassword: PASSWORD_HINT }); return; }
    if (values.newPassword !== values.confirmPassword) { setErrors({ confirmPassword: 'Passwords do not match' }); return; }
    setBusy(true);
    try {
      const { message } = await changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
      setSuccess(message);
      setValues(EMPTY);
    } catch (err) {
      setError(getErrorMessage(err));
      setErrors(Object.fromEntries(getFieldErrors(err).map(({ field, message }) => [field, message])));
    } finally { setBusy(false); }
  }

  return <div className="container"><section className="card form-card"><div className="card-body">
    <h1>Change password</h1>
    <Alert variant="error">{error}</Alert>
    <Alert variant="success">{success}</Alert>
    <form onSubmit={submit} aria-busy={busy}>
      <PasswordInput name="currentPassword" label="Current password" autoComplete="current-password"
        value={values.currentPassword} onChange={change} error={errors.currentPassword} />
      <PasswordInput name="newPassword" label="New password" showRules
        value={values.newPassword} onChange={change} error={errors.newPassword} />
      <PasswordInput name="confirmPassword" label="Confirm new password"
        value={values.confirmPassword} onChange={change} error={errors.confirmPassword} />
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
    </form>
  </div></section></div>;
}
