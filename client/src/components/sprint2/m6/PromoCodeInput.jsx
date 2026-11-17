import { useState } from 'react';
import { formatEGP } from './FulfilmentSelector';
import styles from '../../../styles/sprint2/member6.module.css';

export default function PromoCodeInput({ value = '', onApply, discount, disabled = false }) {
  const [draft, setDraft] = useState(value);
  const code = draft.trim().toUpperCase();

  return (
    <fieldset className={`${styles.fieldset} ${styles.stack}`} disabled={disabled}>
      <legend>Promo code</legend>
      <label className={styles.field}>Code
        <input type="text" value={draft} maxLength={80} autoComplete="off" spellCheck={false}
          onChange={(event) => setDraft(event.target.value)} />
      </label>
      <div className={styles.actions}>
        <button type="button" className="btn" disabled={!code || code === value} onClick={() => onApply(code)}>Apply code</button>
        {value && <button type="button" className="btn btn-secondary" onClick={() => { setDraft(''); onApply(''); }}>Remove code</button>}
      </div>
      {value && Number.isFinite(discount) && <p role="status">{value} applied · Deposit discount {formatEGP(discount)}</p>}
    </fieldset>
  );
}
