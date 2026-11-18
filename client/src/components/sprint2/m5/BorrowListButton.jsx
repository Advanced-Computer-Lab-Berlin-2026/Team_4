// BorrowListButton - Owner: Member 5 - Requirement: 46. Contract: docs/sprint2/member5.md §8.2
// Props: { itemId, ownerId?, maxBorrowDays?, startDate?, endDate?, onAdded?(borrowList) }
// Embedded by Member 7 on ItemDetailsPage: asks for the dates and adds the item to my borrow list.
// startDate / endDate (YYYY-MM-DD, optional) fill the form, e.g. with the range picked in the availability calendar.
//   <BorrowListButton itemId={item._id} ownerId={item.owner?._id} maxBorrowDays={item.rules?.maxBorrowDays}
//     startDate={range.start} endDate={range.end} />
// Guests see "Log in to borrow"; admins and the item's owner see nothing (the server refuses them too).
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { getErrorMessage, getFieldErrors } from '../../../api/axios';
import { addBorrowListEntry, getMyBorrowList } from '../../../api/borrowLists.api';
import Alert from '../../common/Alert';
import BorrowDateFields from './BorrowDateFields';
import { checkDates, dateErrorsFrom, dayCount, showRange } from './borrowDates';
import s from '../../../styles/sprint2/member5.module.css';

const EMPTY = { startDate: '', endDate: '' };

export default function BorrowListButton({ itemId, ownerId, maxBorrowDays, startDate = '', endDate = '', onAdded }) {
  const { user, loading: authLoading, isMember } = useAuth();
  const location = useLocation();
  const isOwner = !!user && !!ownerId && String(ownerId) === String(user._id);
  const canBorrow = isMember && !isOwner;

  const [list, setList] = useState(null);   // my borrow list, to know if this item is in it or the list is full
  const [checking, setChecking] = useState(true);
  const [dates, setDates] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canBorrow) return undefined;
    let ignore = false;
    setChecking(true);
    setList(null); setErrors({}); setError(''); setJustAdded(false);
    getMyBorrowList()
      .then((d) => { if (!ignore) setList(d.borrowList); })
      .catch(() => { /* the form still works: the server checks everything when adding */ })
      .finally(() => { if (!ignore) setChecking(false); });
    return () => { ignore = true; };
  }, [itemId, canBorrow, user?._id]);

  // The form starts with the dates the page passes (or empty), and follows them when they change.
  useEffect(() => {
    setDates({ startDate: startDate || '', endDate: endDate || '' });
    setErrors({}); setError('');
  }, [itemId, startDate, endDate]);

  if (authLoading) return null;
  if (!user) {
    return (
      <div className={s.addBox}>
        <Link to="/login" state={{ from: location.pathname }} className="btn">Log in to borrow</Link>
      </div>
    );
  }
  if (!canBorrow) return null;

  const entry = list?.entries.find((e) => e.item && String(e.item._id) === String(itemId));
  const isFull = !!list && list.count >= list.max;

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    const found = checkDates(dates, maxBorrowDays);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const { borrowList } = await addBorrowListEntry({ itemId, startDate: dates.startDate, endDate: dates.endDate });
      setList(borrowList);
      setJustAdded(true);
      if (onAdded) onAdded(borrowList);
    } catch (err) {
      const fieldErrors = dateErrorsFrom(getFieldErrors(err));
      setErrors(fieldErrors);
      if (Object.keys(fieldErrors).length === 0) setError(getErrorMessage(err));
      // "Already in your list" or "list is full": show the real state instead of the form.
      if (err?.response?.status === 409) getMyBorrowList().then((d) => setList(d.borrowList)).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  if (checking) return <p className={`muted ${s.addBox}`} role="status">Checking your borrow list...</p>;

  if (entry) {
    return (
      <section className={s.addBox} aria-label="Borrow list">
        <Alert variant="success">{justAdded ? 'Added to your borrow list.' : ''}</Alert>
        <Alert variant="error">{error}</Alert>
        <p className={s.addState}>
          <span className={`badge badge-green ${s.badge}`}>In your borrow list</span>
          <span>{entry.days == null ? 'Dates needed' : <><strong>{showRange(entry.startDate, entry.endDate)}</strong> · {dayCount(entry.days)}</>}</span>
        </p>
        {entry.problemMessage && <p className={s.problemText}>{entry.problemMessage}</p>}
        <p className={`muted ${s.addNote}`}>You can change the dates or remove it in your borrow list.</p>
        <Link to="/borrow-list" className="btn btn-secondary">View borrow list</Link>
      </section>
    );
  }

  if (isFull) {
    return (
      <section className={s.addBox} aria-label="Borrow list">
        <Alert variant="info">Your borrow list is full ({list.count} of {list.max} items). Remove an item to add this one.</Alert>
        <Link to="/borrow-list" className="btn btn-secondary">View borrow list</Link>
      </section>
    );
  }

  return (
    <section className={s.addBox} aria-label="Borrow list">
      <form onSubmit={onSubmit} noValidate>
        <h3 className={s.addTitle}>Borrow this item</h3>
        <BorrowDateFields value={dates} errors={errors} maxBorrowDays={maxBorrowDays} disabled={busy}
          onChange={(next) => { setDates(next); setErrors({}); setError(''); }} />
        <Alert variant="error">{error}</Alert>
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Adding...' : 'Add to borrow list'}</button>
        {list && (
          <p className={`muted ${s.addNote}`}>
            {list.count === 0 ? 'Your borrow list is empty.' : <>{list.count} of {list.max} items in your <Link to="/borrow-list">borrow list</Link>.</>}
            {' '}Add everything you need, then collect it in one trip.
          </p>
        )}
      </form>
    </section>
  );
}
