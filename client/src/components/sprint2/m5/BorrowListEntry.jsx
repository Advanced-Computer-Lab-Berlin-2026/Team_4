// BorrowListEntry - Owner: Member 5 - Requirements: 47, 48
// Props: { entry, showLocation, editing, busy: ''|'save'|'remove', locked, onEdit(entry), onCancel(), onSave(entry, dates), onRemove(entry) }
// One line of my borrow list: the item, its dates, and "Change dates" (opens in place) / "Remove".
// onSave returns a promise; when it rejects, the server's message is shown here under the right field.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, getFieldErrors } from '../../../api/axios';
import { formatMoney } from '../../../utils/format';
import Alert from '../../common/Alert';
import BorrowDateFields from './BorrowDateFields';
import { checkDates, dateErrorsFrom, dayCount, showRange } from './borrowDates';
import s from '../../../styles/sprint2/member5.module.css';

const PROBLEMS = {
  unavailable: { label: 'No longer available', tone: 'red' },
  dates_passed: { label: 'Dates passed', tone: 'amber' },
  too_long: { label: 'Too long', tone: 'amber' },
  invalid_dates: { label: 'Check the dates', tone: 'amber' },
};

export default function BorrowListEntry({ entry, showLocation = true, editing, busy = '', locked = false, onEdit, onCancel, onSave, onRemove }) {
  const { item, problem } = entry;
  const title = item?.title || 'Unavailable item';
  const canChangeDates = !!item && problem !== 'unavailable';
  const stored = { startDate: entry.startDate, endDate: entry.endDate };

  const [dates, setDates] = useState(stored);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const formRef = useRef(null);
  const editButtonRef = useRef(null);
  const wasEditing = useRef(false);

  useEffect(() => {
    if (editing) {
      setDates(stored);
      setError('');
      setErrors(problem ? checkDates(stored, item?.maxBorrowDays) : {}); // say right away what is wrong with a stale entry
      formRef.current?.querySelector('input')?.focus();
    } else if (wasEditing.current) {
      editButtonRef.current?.focus(); // back to where the member was
    }
    wasEditing.current = editing;
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const unchanged = dates.startDate === entry.startDate && dates.endDate === entry.endDate;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    const found = checkDates(dates, item?.maxBorrowDays);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (unchanged) { onCancel(); return; }
    try {
      await onSave(entry, dates);
    } catch (err) {
      const fieldErrors = dateErrorsFrom(getFieldErrors(err));
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setError(getErrorMessage(err));
    }
  };

  const tone = problem ? PROBLEMS[problem]?.tone || 'amber' : '';

  return (
    <li>
      <article className={`card ${s.entry} ${tone === 'red' ? s.entryGone : ''} ${tone === 'amber' ? s.entryStale : ''}`} aria-label={title}>
        <div className={s.entryMain}>
          <div className={s.thumb}>
            <img src={item?.photo || '/uploads/placeholder.svg'} alt={item ? title : ''} loading="lazy" />
          </div>
          <div className={s.entryInfo}>
            <h3 className={s.entryTitle}>
              {item && problem !== 'unavailable' ? <Link to={`/catalog/${item._id}`}>{title}</Link> : title}
            </h3>
            {item?.category?.name && <div className="muted">{item.category.name}</div>}
            {problem && (
              <p className={s.problem}>
                <span className={`badge badge-${tone} ${s.badge}`}>{PROBLEMS[problem]?.label || 'Needs attention'}</span>
                <span className={s.problemText}>{entry.problemMessage}</span>
              </p>
            )}
          </div>
        </div>
        <dl className={s.facts}>
          <div><dt>Dates</dt><dd>{showRange(entry.startDate, entry.endDate)} <span className={s.days}>· {dayCount(entry.days)}</span></dd></div>
          {item && <div><dt>Deposit</dt><dd>{formatMoney(item.depositAmount)}</dd></div>}
          {item && problem && <div><dt>Lender</dt><dd>{item.owner?.name || 'Unknown'}</dd></div>}
          {item && showLocation && <div><dt>Pickup</dt><dd>{item.pickup?.location || 'The lender has not set a pickup location yet'}</dd></div>}
        </dl>

        {editing ? (
          <form ref={formRef} className={s.editor} onSubmit={onSubmit} noValidate aria-label={`Change dates for ${title}`}>
            <BorrowDateFields value={dates} errors={errors} maxBorrowDays={item?.maxBorrowDays} disabled={busy === 'save'}
              onChange={(next) => { setDates(next); setErrors({}); setError(''); }} />
            <Alert variant="error">{error}</Alert>
            <div className="row">
              <button type="submit" className="btn" disabled={busy === 'save'}>{busy === 'save' ? 'Saving...' : 'Save dates'}</button>
              <button type="button" className="btn btn-secondary" disabled={busy === 'save'} onClick={onCancel}>Cancel</button>
            </div>
          </form>
        ) : (
          <div className={`row ${s.entryActions}`}>
            {canChangeDates && (
              <button ref={editButtonRef} type="button" className="btn btn-secondary" disabled={locked || !!busy}
                aria-label={`Change dates for ${title}`} onClick={() => onEdit(entry)}>Change dates</button>
            )}
            <button type="button" className="btn btn-danger" disabled={locked || !!busy}
              aria-label={`Remove ${title} from your borrow list`} onClick={() => onRemove(entry)}>
              {busy === 'remove' ? 'Removing...' : 'Remove'}
            </button>
          </div>
        )}
      </article>
    </li>
  );
}
