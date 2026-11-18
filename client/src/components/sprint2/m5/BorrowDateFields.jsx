// BorrowDateFields - Owner: Member 5 (Req 46, 48)
// Props: { value: { startDate, endDate }, onChange(next), errors?: { startDate?, endDate? }, maxBorrowDays?, disabled? }
// The start and end date pair used when adding an item to the borrow list and when changing an entry's dates.
// Days the server would refuse can't be picked (min/max), and the length is shown as the member chooses.
import FormField from '../../common/FormField';
import { HORIZON_DAYS, addDays, dayCount, daysBetween, isDay, maxDaysFor, showRange, todayUtc } from './borrowDates';
import s from '../../../styles/sprint2/member5.module.css';

export default function BorrowDateFields({ value, onChange, errors = {}, maxBorrowDays, disabled = false }) {
  const { startDate, endDate } = value;
  const today = todayUtc();
  const max = maxDaysFor(maxBorrowDays);
  const startOk = isDay(startDate);
  const rangeOk = startOk && isDay(endDate) && endDate > startDate;

  const returnDay = 'The end date is the day you bring the item back.';
  const limit = maxBorrowDays ? `${returnDay} This item can be borrowed for up to ${dayCount(max)}.` : returnDay;

  return (
    <div className={s.dates}>
      <div className={s.dateRow}>
        <FormField label="Start date" error={errors.startDate}>
          <input type="date" value={startDate} min={today} max={addDays(today, HORIZON_DAYS)} disabled={disabled} required onChange={(e) => onChange({ startDate: e.target.value, endDate })} />
        </FormField>
        <FormField label="End date" error={errors.endDate}>
          <input type="date" value={endDate} min={addDays(startOk ? startDate : today, 1)} max={startOk ? addDays(startDate, max) : undefined}
            disabled={disabled} required onChange={(e) => onChange({ startDate, endDate: e.target.value })} />
        </FormField>
      </div>
      <p className={`muted ${s.dateSummary}`} aria-live="polite">
        {rangeOk
          ? <><strong>{dayCount(daysBetween(startDate, endDate))}</strong>: {showRange(startDate, endDate)}.{maxBorrowDays ? ` Up to ${dayCount(max)} for this item.` : ''}</>
          : limit}
      </p>
    </div>
  );
}
