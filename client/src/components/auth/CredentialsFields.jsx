import FormField from '../common/FormField';
import { PASSWORD_HINT } from '../../utils/validators';

export default function CredentialsFields({ values, onChange, errors = {}, newPassword = false }) {
  return <>
    <FormField label="Username" error={errors.username} hint="3–30 letters, numbers, underscores or periods.">
      <input name="username" type="text" autoComplete="username" required minLength={3} maxLength={30}
        pattern="[A-Za-z0-9_.]{3,30}" value={values.username} onChange={onChange} />
    </FormField>
    <FormField label="Password" error={errors.password} hint={newPassword ? PASSWORD_HINT : undefined}>
      <input name="password" type="password" autoComplete={newPassword ? 'new-password' : 'current-password'}
        required value={values.password} onChange={onChange} />
    </FormField>
  </>;
}
