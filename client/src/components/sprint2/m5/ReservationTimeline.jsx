// ReservationTimeline - Owner: Member 5 - Requirements: 53 (and 56-60 states)
// Props: { reservation } - Requested -> Approved -> Picked up -> Returned, each step marked in words (not colour only).
// A rejected or cancelled booking shows where it stopped.
import { formatDate } from '../../../utils/format';
import s from '../../../styles/sprint2/member5.module.css';

const STEPS = [
  { key: 'requested', label: 'Requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'picked', label: 'Picked up' },
  { key: 'returned', label: 'Returned' },
];
const REACHED = { pending: 1, confirmed: 2, active: 3, completed: 4 }; // steps done for each status

function stepsFor(r) {
  if (r.status === 'rejected') return { done: 1, stop: { at: 1, label: 'Declined', when: null } };
  if (r.status === 'cancelled') {
    return { done: r.pickedUpAt ? 3 : 1, stop: { at: r.pickedUpAt ? 3 : 1, label: 'Cancelled', when: r.cancellation?.at } };
  }
  return { done: REACHED[r.status] || 0, stop: null };
}

export default function ReservationTimeline({ reservation: r }) {
  const { done, stop } = stepsFor(r);
  const dates = { requested: r.createdAt, picked: r.pickedUpAt, returned: r.returnedAt };
  const shown = stop ? [...STEPS.slice(0, stop.at), { key: 'stop', label: stop.label, stopped: true }] : STEPS;
  return (
    <ol className={s.timeline} aria-label="Progress">
      {shown.map((step, i) => {
        let state = 'todo';
        if (step.stopped) state = 'stopped';
        else if (i < done) state = 'done';
        else if (i === done) state = 'current';
        const word = { done: 'Done', current: 'Next', todo: 'Not yet', stopped: 'Ended' }[state];
        const when = step.stopped ? stop.when : dates[step.key];
        return (
          <li key={step.key} className={`${s.step} ${s[`step_${state}`]}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className={s.stepDot} aria-hidden="true" />
            <span className={s.stepText}>
              <strong>{step.label}</strong>
              <span className="muted">{word}{state === 'done' || state === 'stopped' ? (when ? ` · ${formatDate(when)}` : '') : ''}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
