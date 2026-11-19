import { cloneElement, isValidElement, useId } from 'react';

export default function FormField({ label, error, hint, children }) {
  const generatedId = useId();
  const id = children?.props?.id || generatedId;
  const descriptionId = error || hint ? id + '-description' : undefined;
  const child = isValidElement(children) ? cloneElement(children, {
    id,
    'aria-invalid': error ? true : children.props['aria-invalid'],
    'aria-describedby': [children.props['aria-describedby'], descriptionId].filter(Boolean).join(' ') || undefined,
  }) : children;
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {child}
      {hint && !error && <div className="field-hint" id={descriptionId}>{hint}</div>}
      {error && <div className="field-error" id={descriptionId}>{error}</div>}
    </div>
  );
}
