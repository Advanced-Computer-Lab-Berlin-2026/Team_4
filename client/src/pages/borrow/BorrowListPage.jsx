// MY BORROW LIST - Owner: Member 5 - Requirements: 46, 47, 48. Contract: docs/sprint2/member5.md §3
// Route: /borrow-list   Access: member   (registered in src/routes/sprint2/member5.routes.jsx)
// The list is a draft for one pickup trip (Req 46), so the page reads as a trip plan: a summary of the trip,
// then the items grouped by the lender they are collected from. Each item can be re-dated (Req 48) or removed (Req 47).
// Entries the server marks with a problem are shown first and are left out of the trip totals.
// Checkout (Req 49) is Member 1's page (/checkout). It books every entry at once, so it stays disabled while any
// entry needs attention.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/axios';
import { getMyBorrowList, removeBorrowListEntry, updateBorrowListEntry } from '../../api/borrowLists.api';
import { formatMoney } from '../../utils/format';
import Spinner from '../../components/common/Spinner';
import Alert from '../../components/common/Alert';
import BorrowListEntry from '../../components/sprint2/m5/BorrowListEntry';
import { showDay, showRange } from '../../components/sprint2/m5/borrowDates';
import s from '../../styles/sprint2/member5.module.css';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const byStart = (a, b) => a.startDate.localeCompare(b.startDate) || a.item.title.localeCompare(b.item.title);

/** Ready entries grouped by lender, the lender you visit first on top. */
function groupByLender(entries) {
  const groups = new Map();
  [...entries].sort(byStart).forEach((entry) => {
    const key = String(entry.item.owner?._id || 'unknown');
    if (!groups.has(key)) groups.set(key, { key, name: entry.item.owner?.name || 'Unknown lender', entries: [] });
    groups.get(key).entries.push(entry);
  });
  return [...groups.values()].map((group) => {
    const places = new Set(group.entries.map((e) => (e.item.pickup?.location || '').trim()));
    // One shared pickup place goes in the heading; different places are shown on each item instead.
    return { ...group, location: places.size === 1 ? [...places][0] : null, mixed: places.size > 1 };
  });
}

export default function BorrowListPage() {
  const [list, setList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState({ variant: '', text: '' });
  const [editingId, setEditingId] = useState('');
  const [busy, setBusy] = useState({ id: '', action: '' });
  const headingRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setList((await getMyBorrowList()).borrowList);
    } catch (e) {
      setLoadError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const titleOf = (entry) => entry.item?.title || 'The unavailable item';
  // The entry was removed somewhere else (another tab or device): show what the list really holds now.
  const refreshIfGone = (err) => { if (err?.response?.status === 404) { setEditingId(''); load(); } };

  const onSave = async (entry, dates) => {
    setMessage({ variant: '', text: '' });
    setBusy({ id: entry._id, action: 'save' });
    try {
      const { borrowList } = await updateBorrowListEntry(entry._id, dates);
      setList(borrowList);
      setEditingId('');
      setMessage({ variant: 'success', text: `"${titleOf(entry)}" is now ${showRange(dates.startDate, dates.endDate)}.` });
    } catch (err) {
      if (err?.response?.status === 404) setMessage({ variant: 'error', text: getErrorMessage(err) });
      refreshIfGone(err);
      throw err; // the entry shows the message under its date fields
    } finally {
      setBusy({ id: '', action: '' });
    }
  };

  const onRemove = async (entry) => {
    if (!window.confirm(`Remove "${titleOf(entry)}" from your borrow list?`)) return;
    setMessage({ variant: '', text: '' });
    setBusy({ id: entry._id, action: 'remove' });
    try {
      const { borrowList } = await removeBorrowListEntry(entry._id);
      setList(borrowList);
      setMessage({ variant: 'success', text: `"${titleOf(entry)}" removed from your borrow list.` });
      headingRef.current?.focus(); // the button that had focus is gone
    } catch (err) {
      setMessage({ variant: 'error', text: getErrorMessage(err) });
      refreshIfGone(err);
    } finally {
      setBusy({ id: '', action: '' });
    }
  };

  const trip = useMemo(() => {
    const entries = list?.entries || [];
    const ready = entries.filter((e) => !e.problem && e.item);
    const starts = ready.map((e) => e.startDate).sort();
    const ends = ready.map((e) => e.endDate).sort();
    const groups = groupByLender(ready);
    return {
      ready,
      groups,
      problems: entries.filter((e) => e.problem || !e.item),
      deposit: ready.reduce((sum, e) => sum + Number(e.item.depositAmount || 0), 0),
      firstPickup: starts[0] || '',
      lastReturn: ends[ends.length - 1] || '',
      startDays: new Set(starts).size,
    };
  }, [list]);

  const entryProps = (entry) => ({
    entry,
    editing: editingId === entry._id,
    busy: busy.id === entry._id ? busy.action : '',
    locked: !!busy.id && busy.id !== entry._id,
    onEdit: (e) => { setMessage({ variant: '', text: '' }); setEditingId(e._id); },
    onCancel: () => setEditingId(''),
    onSave,
    onRemove,
  });

  const count = list?.count || 0;
  const max = list?.max || 10;

  return (
    <div className="container">
      <h1 ref={headingRef} tabIndex={-1} className={s.pageTitle}>My borrow list</h1>
      <p className={`muted ${s.lead}`}>Collect the items you need, give each one its dates, then pick them all up in one trip.</p>

      <Alert variant={message.variant || 'info'}>{message.text}</Alert>

      {loading && !list && <Spinner label="Loading your borrow list..." />}

      {loadError && (
        <div className={s.loadError}>
          <Alert variant="error">{loadError}</Alert>
          <button type="button" className="btn btn-secondary" onClick={load}>Try again</button>
        </div>
      )}

      {!loadError && list && count === 0 && (
        <div className={`center ${s.empty}`}>
          <p className="muted">Your borrow list is empty. Open an item, choose your dates and add it here.</p>
          <Link to="/catalog" className="btn">Browse items</Link>
        </div>
      )}

      {!loadError && list && count > 0 && (
        <div className={s.layout} aria-busy={loading}>
          <aside className={`card ${s.summary}`} aria-labelledby="borrow-trip-title">
            <div className="card-body">
              <h2 id="borrow-trip-title" className={s.summaryTitle}>Your trip</h2>
              <p className={s.capacity}><strong>{count} of {max}</strong> items in your list</p>
              <div className={s.meter} aria-hidden="true"><span style={{ width: `${Math.min(100, (count / max) * 100)}%` }} /></div>

              {trip.ready.length > 0 ? (
                <>
                  <dl className={s.summaryFacts}>
                    <div><dt>Ready to borrow</dt><dd>{plural(trip.ready.length, 'item')}</dd></div>
                    <div><dt>Lenders to visit</dt><dd>{trip.groups.length}</dd></div>
                    <div><dt>First pickup</dt><dd>{showDay(trip.firstPickup)}</dd></div>
                    <div><dt>Last return</dt><dd>{showDay(trip.lastReturn)}</dd></div>
                    <div className={s.summaryTotal}><dt>Total deposit</dt><dd>{formatMoney(trip.deposit)}</dd></div>
                  </dl>
                  <p className={`muted ${s.tripNote}`}>
                    {trip.startDays === 1
                      ? `Everything starts on ${showDay(trip.firstPickup)}, so one trip collects it all.`
                      : `Your items start on ${trip.startDays} different days. Give them the same start date to collect everything in one trip.`}
                  </p>
                </>
              ) : (
                <p className={`muted ${s.tripNote}`}>Nothing is ready to borrow yet. Fix the items that need attention.</p>
              )}
              {trip.problems.length > 0 && trip.ready.length > 0 && (
                <p className={`muted ${s.tripNote}`}>{plural(trip.problems.length, 'item')} that {trip.problems.length === 1 ? 'needs' : 'need'} attention {trip.problems.length === 1 ? 'is' : 'are'} not counted.</p>
              )}
              <p className={`muted ${s.tripNote}`}>Deposits are held when you check out. Your list doesn&apos;t reserve the items, so availability is checked again then.</p>
              <div className={s.summaryActions}>
                {trip.problems.length === 0
                  ? <Link to="/checkout" className="btn">Check out</Link>
                  : (
                    <>
                      <button type="button" className="btn" disabled aria-describedby="borrow-checkout-note">Check out</button>
                      <p id="borrow-checkout-note" className={`muted ${s.tripNote}`}>Fix or remove the items that need attention before you check out.</p>
                    </>
                  )}
                {count < max
                  ? <Link to="/catalog" className="btn btn-secondary">Add more items</Link>
                  : <p className={`muted ${s.tripNote}`}>Your list is full. Remove an item to add another.</p>}
              </div>
            </div>
          </aside>

          <div className={s.entries}>
            {trip.problems.length > 0 && (
              <section aria-labelledby="borrow-attention-title">
                <h2 id="borrow-attention-title" className={s.groupTitle}>Needs attention</h2>
                <p className={`muted ${s.groupNote}`}>Fix or remove {trip.problems.length === 1 ? 'this item' : 'these items'} before you check out.</p>
                <ul className={s.list}>
                  {trip.problems.map((entry) => <BorrowListEntry key={entry._id} {...entryProps(entry)} />)}
                </ul>
              </section>
            )}

            {trip.groups.map((group) => (
              <section key={group.key} aria-labelledby={`borrow-group-${group.key}`}>
                <h2 id={`borrow-group-${group.key}`} className={s.groupTitle}>From {group.name}</h2>
                <p className={`muted ${s.groupNote}`}>
                  {plural(group.entries.length, 'item')}
                  {!group.mixed && <> · Pickup: {group.location || 'the lender has not set a pickup location yet'}</>}
                </p>
                <ul className={s.list}>
                  {group.entries.map((entry) => <BorrowListEntry key={entry._id} showLocation={group.mixed} {...entryProps(entry)} />)}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
