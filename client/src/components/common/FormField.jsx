// <FormField label="Email" error={errors.email}><input .../></FormField>  - accessible label + error text
import { useId } from 'react';
import { cloneElement, isValidElement } from 'react';

export default function FormField({ label, error, hint, children }) {
  const id = useId();
  const child = isValidElement(children) ? cloneElement(children, { id, 'aria-invalid': !!error }) : children;
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {child}
      {hint && !error && <div className="field-hint">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
