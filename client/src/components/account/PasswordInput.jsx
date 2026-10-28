// PasswordInput - Owner: Member 2 - Requirements: 10, 11
// Props: { value, onChange, label, name, error, autoComplete, showRules }
// Password field with a show/hide toggle and (when showRules) a live checklist of the strength rules.
import { useState } from 'react';
import FormField from '../common/FormField';
import { passwordChecks } from '../../utils/validators';
import './account.css';

export default function PasswordInput({ value, onChange, label = 'Password', name = 'password', error, autoComplete = 'new-password', showRules = false }) {
  const [visible, setVisible] = useState(false);
  return <>
    <FormField label={label} error={error}>
      <input name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required
        value={value} onChange={onChange} />
    </FormField>
    <div className="pw-tools">
      <button type="button" className="btn-link btn-small" onClick={() => setVisible(!visible)} aria-pressed={visible}>
        {visible ? 'Hide' : 'Show'} {label.toLowerCase()}
      </button>
    </div>
    {showRules && <ul className="pw-rules" aria-label="Password requirements">
      {passwordChecks(value).map(({ label: rule, ok }) =>
        <li key={rule} className={ok ? 'ok' : ''}>{ok ? '✓' : '○'} {rule}</li>)}
    </ul>}
  </>;
}
