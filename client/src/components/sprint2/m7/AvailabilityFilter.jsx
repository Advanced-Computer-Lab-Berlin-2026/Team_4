// AvailabilityFilter - Owner: Member 7 - Req 44
// Props: { from, to, onChange({ from, to }) } - "available between" date filter for the catalog.
import { useEffect, useState } from 'react';
import FormField from '../../common/FormField';
import styles from '../../../styles/sprint2/member7.module.css';
import { todayDay } from './dateUtils';

export default function AvailabilityFilter({ from = '', to = '', onChange }) {
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [error, setError] = useState('');
  useEffect(() => { setF(from); setT(to); setError(''); }, [from, to]);
  const today = todayDay();

  const apply = (e) => {
    e.preventDefault();
    if (!f || !t) return setError('Choose both a pickup day and a return day.');
    if (f < today) return setError('The pickup day cannot be in the past.');
    if (t <= f) return setError('The return day must be after the pickup day.');
    setError('');
    onChange?.({ from: f, to: t });
  };
  const clear = () => { setF(''); setT(''); setError(''); onChange?.({ from: '', to: '' }); };

  return (
    <form className={styles.filter} onSubmit={apply} aria-label="Filter by availability">
      <FormField label="Available from"><input type="date" value={f} min={today} onChange={(e) => setF(e.target.value)} /></FormField>
      <FormField label="Available until" error={error}><input type="date" value={t} min={f || today} onChange={(e) => setT(e.target.value)} /></FormField>
      <div className={styles.filterActions}>
        <button type="submit" className="btn">Check availability</button>
        {(from || to) && <button type="button" className="btn btn-secondary" onClick={clear}>Clear dates</button>}
      </div>
    </form>
  );
}
