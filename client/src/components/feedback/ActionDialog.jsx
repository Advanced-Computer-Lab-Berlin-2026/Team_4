import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../common/Icon';

export default function ActionDialog({ title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, inputLabel, maxLength, onResolve }) {
  const dialog = useRef(null);
  const initialFocus = useRef(null);
  const id = useId();
  const [value, setValue] = useState('');

  useLayoutEffect(() => {
    const element = dialog.current;
    element.showModal();
    initialFocus.current.focus();
    return () => element.close();
  }, []);

  return createPortal(
    <dialog ref={dialog} className="action-dialog" role={inputLabel ? 'dialog' : 'alertdialog'}
      aria-modal="true" aria-labelledby={id + '-title'} aria-describedby={description ? id + '-description' : undefined}
      onCancel={(event) => { event.preventDefault(); onResolve(false); }}>
      <form onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); onResolve(true, value.trim()); }}>
        <div className={'action-dialog-icon' + (danger ? ' action-dialog-icon-danger' : '')}>
          <Icon name={danger ? 'warning' : 'check'} size={21} />
        </div>
        <h2 id={id + '-title'}>{title}</h2>
        {description && <p id={id + '-description'}>{description}</p>}
        {inputLabel && (
          <div className="field">
            <label htmlFor={id + '-input'}>{inputLabel}</label>
            <textarea id={id + '-input'} ref={initialFocus} value={value} maxLength={maxLength}
              onChange={(event) => setValue(event.target.value)} rows={3} />
          </div>
        )}
        <div className="action-dialog-buttons">
          <button ref={inputLabel ? undefined : initialFocus} type="button" className="btn btn-secondary"
            onClick={() => onResolve(false)}>{cancelLabel}</button>
          <button type="submit" className={danger ? 'btn btn-danger' : 'btn'}>{confirmLabel}</button>
        </div>
      </form>
    </dialog>,
    document.body,
  );
}
