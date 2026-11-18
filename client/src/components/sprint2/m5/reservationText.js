// Reservation wording - Owner: Member 5 (Req 53, 54). Turns the API's reservation into plain sentences and labels,
// so the list card and the details page always say the same thing. Colour is never the only signal (text on every badge).
import { formatDate } from '../../../utils/format';
import { daysBetween, showDay, todayUtc } from './borrowDates';

export const OPEN_STATUSES = ['pending', 'confirmed', 'active'];

/** status -> { label, tone } (tone = badge colour) */
export const STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  confirmed: { label: 'Upcoming', tone: 'grey' }, // no blue badge in the shared styles; the word tells it apart
  active: { label: 'Active', tone: 'green' },
  completed: { label: 'Completed', tone: 'grey' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
  rejected: { label: 'Rejected', tone: 'red' },
};
export const statusOf = (r) => STATUS[r.status] || { label: r.status, tone: 'grey' };

const DEPOSIT = {
  none: 'Not taken yet', held: 'Held', released: 'Released', refunded: 'Refunded',
  partially_forfeited: 'Partly kept for damage', forfeited: 'Kept for damage',
};
export const depositText = (deposit) => (deposit?.amount > 0 ? DEPOSIT[deposit.status] || deposit.status : 'No deposit');

const whenText = (day) => {
  const n = daysBetween(todayUtc(), day);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  return n > 1 ? `in ${n} days` : `${-n} day${n === -1 ? '' : 's'} ago`;
};

/** Small labels for situations nobody acted on (Member 1's lifecycle flags) and extension requests. */
export function labelsOf(r) {
  const out = [];
  if (r.flags?.approvalOverdue) out.push({ key: 'approval', text: 'Not answered in time', tone: 'amber' });
  if (r.flags?.pickupMissed) out.push({ key: 'pickup', text: 'Pickup missed', tone: 'red' });
  if (r.flags?.returnOverdue) out.push({ key: 'overdue', text: 'Return overdue', tone: 'red' });
  const ext = r.extension?.status;
  if (ext === 'pending') out.push({ key: 'ext', text: 'Extension requested', tone: 'amber' });
  if (ext === 'expired') out.push({ key: 'ext', text: 'Extension not answered', tone: 'grey' });
  if (ext === 'approved' && OPEN_STATUSES.includes(r.status)) out.push({ key: 'ext', text: 'Extended', tone: 'green' });
  if (ext === 'rejected' && OPEN_STATUSES.includes(r.status)) out.push({ key: 'ext', text: 'Extension declined', tone: 'grey' });
  return out;
}

/** One sentence: what happens next (or how it ended), from the viewer's side. */
export function nextStep(r) {
  const lender = r.role === 'lender';
  switch (r.status) {
    case 'pending':
      if (r.flags?.approvalOverdue) return lender ? 'You haven\'t answered this request and its start date has passed.' : 'The lender hasn\'t answered and the start date has passed.';
      return lender ? 'Waiting for your answer.' : 'Waiting for the lender to approve.';
    case 'confirmed':
      if (r.fulfilment?.method === 'delivery') {
        if (r.flags?.pickupMissed) return 'The booked days passed before delivery.';
        return r.fulfilment.deliveryStatus === 'out_for_delivery' ? 'Out for delivery.' : 'Preparing for delivery.';
      }
      if (r.flags?.pickupMissed) return 'The pickup was missed: the booked days have passed.';
      if (r.startDate > todayUtc()) return `Pickup from ${showDay(r.startDate)} (${whenText(r.startDate)}).`;
      return lender ? 'Ready to be picked up now.' : 'Ready to pick up now.';
    case 'active':
      if (r.flags?.returnOverdue) return `Overdue: it was due back on ${showDay(r.endDate)}.`;
      return `Return on ${showDay(r.endDate)} (${whenText(r.endDate)}).`;
    case 'completed':
      if (r.returnCondition === 'damaged') return `Returned on ${formatDate(r.returnedAt)} with damage reported.`;
      return r.returnedAt ? `Returned on ${formatDate(r.returnedAt)}.` : 'Completed.';
    case 'cancelled':
      return `Cancelled${r.cancellation?.at ? ` on ${formatDate(r.cancellation.at)}` : ''}.${r.cancellation?.reason ? ` Reason: ${r.cancellation.reason}` : ''}`;
    case 'rejected':
      return `${lender ? 'You declined this request.' : 'The lender declined this request.'}${r.rejectionReason ? ` Reason: ${r.rejectionReason}` : ''}`;
    default:
      return '';
  }
}
