// <StatusBadge status="verified" />  colour by status keyword; unknown statuses render neutral
const TONE = {
  verified: 'green', approved: 'green', accepted: 'green', active: 'green',
  pending: 'amber', draft: 'amber',
  rejected: 'red', suspended: 'red', declined: 'red', removed: 'red',
  none: 'grey', archived: 'grey',
};
export default function StatusBadge({ status, children }) {
  const key = String(status || '').toLowerCase();
  return <span className={`badge badge-${TONE[key] || 'grey'}`}>{children || status}</span>;
}
