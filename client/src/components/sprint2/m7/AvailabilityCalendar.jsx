// AvailabilityCalendar - Owner: Member 7 - Req 43
// Month calendar of one item: booked / on-hold days + pickup/return range selection.
// Props: { itemId, value: { start, end }, onChange({ start, end }), onAvailabilityChange(true | false | null) }
// Accessible: real table/buttons, arrow-key navigation, state in text (aria-label + legend), not colour only.
import { useEffect, useMemo, useRef, useState } from 'react';
import { getAvailability } from '../../../api/catalog.api';
import { getErrorMessage } from '../../../api/axios';
import Alert from '../../common/Alert';
import styles from '../../../styles/sprint2/member7.module.css';
import {
  addDays, daysBetween, daysInMonth, dayToMonth, formatDay, formatDayLong, formatMonth,
  fromDay, monthFirst, shiftMonth, todayDay,
} from './dateUtils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_MONTHS_AHEAD = 12;

export default function AvailabilityCalendar({ itemId, value, onChange, onAvailabilityChange }) {
  const start = value?.start || '';
  const end = value?.end || '';
  const today = todayDay();
  const currentMonth = dayToMonth(today);

  const [month, setMonth] = useState(() => dayToMonth(start || today));
  const [data, setData] = useState(null); // { itemId, from, to, booked }
  const [error, setError] = useState('');
  const [focusDay, setFocusDay] = useState(start || today);
  const dataRef = useRef(null);
  const gridRef = useRef(null);
  const keyNav = useRef(false);

  const first = monthFirst(month);
  const nextFirst = monthFirst(shiftMonth(month, 1));

  useEffect(() => {
    let from = first;
    let to = nextFirst;
    if (start && start < from) from = start;
    if (end && end > to) to = end;
    if (daysBetween(from, to) > 399) { from = first; to = nextFirst; }

    const have = dataRef.current;
    if (have && have.itemId === itemId && have.from <= from && have.to >= to) return undefined; // already covered

    let ignore = false;
    setError('');
    getAvailability(itemId, { from, to })
      .then((d) => {
        if (ignore) return;
        const next = { itemId, from, to, booked: d.booked || [] };
        dataRef.current = next;
        setData(next);
      })
      .catch((e) => { if (!ignore) setError(getErrorMessage(e)); });
    return () => { ignore = true; };
  }, [itemId, first, nextFirst, start, end]);

  // day -> 'booked' | 'held' for the loaded window
  const dayState = useMemo(() => {
    const map = new Map();
    if (!data || data.itemId !== itemId) return map;
    data.booked.forEach((b) => {
      for (let d = b.start < data.from ? data.from : b.start; d < b.end && d < data.to; d = addDays(d, 1)) {
        if (map.get(d) !== 'booked') map.set(d, b.type);
      }
    });
    return map;
  }, [data, itemId]);

  // is the selected range free? null = unknown (nothing selected / still loading)
  const available = useMemo(() => {
    if (!start || !end || !data || data.itemId !== itemId) return null;
    if (data.from > start || data.to < end) return null;
    return !data.booked.some((b) => b.start < end && b.end > start);
  }, [data, itemId, start, end]);

  useEffect(() => { onAvailabilityChange?.(available); }, [available]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!keyNav.current) return;
    keyNav.current = false;
    gridRef.current?.querySelector(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, month]);

  const pick = (day) => {
    if (day < today) return;
    if (!start || end || day <= start) onChange?.({ start: day, end: '' });
    else onChange?.({ start, end: day });
  };

  const onKeyDown = (e, day) => {
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = addDays(day, delta);
    if (next < today) return;
    keyNav.current = true;
    setFocusDay(next);
    const m = dayToMonth(next);
    if (m.y !== month.y || m.m !== month.m) setMonth(m);
  };

  // grid cells, Monday first
  const lead = (fromDay(first).getUTCDay() + 6) % 7;
  const total = daysInMonth(month);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
  const tabStop = focusDay >= first && focusDay < nextFirst ? focusDay : first;

  const atStart = month.y === currentMonth.y && month.m === currentMonth.m;
  const limit = shiftMonth(currentMonth, MAX_MONTHS_AHEAD);
  const atEnd = month.y === limit.y && month.m === limit.m;

  const label = (day) => {
    const parts = [formatDayLong(day)];
    if (day < today) parts.push('in the past');
    else if (dayState.get(day) === 'booked') parts.push('booked');
    else if (dayState.get(day) === 'held') parts.push('on hold for another member');
    else parts.push('available');
    if (day === start) parts.push('selected pickup day');
    if (day === end) parts.push('selected return day');
    else if (start && end && day > start && day < end) parts.push('within your selected dates');
    return parts.join(', ');
  };

  return (
    <div className={styles.calendarWrap}>
      <div className={styles.calendarNav}>
        <button type="button" className="btn btn-small btn-secondary" disabled={atStart} onClick={() => setMonth(shiftMonth(month, -1))}>Previous month</button>
        <h3 aria-live="polite">{formatMonth(month)}</h3>
        <button type="button" className="btn btn-small btn-secondary" disabled={atEnd} onClick={() => setMonth(shiftMonth(month, 1))}>Next month</button>
      </div>

      <Alert variant="error">{error}</Alert>

      <table className={styles.calendar} role="grid" aria-label={`Availability for ${formatMonth(month)}`} ref={gridRef}>
        <thead>
          <tr>{WEEKDAYS.map((w) => <th key={w} scope="col">{w}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((day, ci) => {
                if (!day) return <td key={ci} />;
                const past = day < today;
                const st = dayState.get(day);
                const cls = [
                  styles.day,
                  past && styles.past,
                  !past && st === 'booked' && styles.booked,
                  !past && st === 'held' && styles.held,
                  start && end && day > start && day < end && styles.inRange,
                  (day === start || day === end) && styles.selected,
                ].filter(Boolean).join(' ');
                return (
                  <td key={ci} role="gridcell">
                    <button
                      type="button"
                      className={cls}
                      data-day={day}
                      tabIndex={day === tabStop ? 0 : -1}
                      aria-label={label(day)}
                      aria-disabled={past || undefined}
                      aria-pressed={day === start || day === end}
                      onClick={() => pick(day)}
                      onFocus={() => setFocusDay(day)}
                      onKeyDown={(e) => onKeyDown(e, day)}
                    >
                      {Number(day.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className={styles.legend} aria-label="Legend">
        <li><span className={`${styles.swatch} ${styles.swatchFree}`} aria-hidden="true" /> Available</li>
        <li><span className={`${styles.swatch} ${styles.swatchBooked}`} aria-hidden="true" /> Booked (hatched)</li>
        <li><span className={`${styles.swatch} ${styles.swatchHeld}`} aria-hidden="true" /> On hold (dashed)</li>
        <li><span className={`${styles.swatch} ${styles.swatchSelected}`} aria-hidden="true" /> Your selection</li>
      </ul>

      <p className="muted" aria-live="polite">
        {!start && 'Choose your pickup day, then your return day.'}
        {start && !end && `Pickup ${formatDay(start)}. Now choose your return day.`}
        {start && end && `Selected: ${formatDay(start)} to ${formatDay(end)}.`}
        {start && <> <button type="button" className="btn btn-link" onClick={() => onChange?.({ start: '', end: '' })}>Clear dates</button></>}
      </p>
    </div>
  );
}
