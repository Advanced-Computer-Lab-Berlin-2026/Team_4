// Small display helpers shared by Member 3's pages and components (Sprint 2).
import Icon from '../../common/Icon';
import styles from '../../../styles/sprint2/member3.module.css';

/** Read-only star rating with a text alternative (colour/shape is never the only signal). */
export function Stars({ value }) {
  const n = Math.round(Number(value) || 0);
  return (
    <span className={styles.stars} role="img" aria-label={`${n} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <Icon key={rating} name="star" size={15} filled={rating <= n} />
      ))}
    </span>
  );
}

// Damage statuses mapped onto the existing badge colours (StatusBadge is a shared file we don't edit).
const DAMAGE_TONE = { open: 'amber', decided: 'grey', disputed: 'red', resolved: 'green' };
export function DamageStatusBadge({ status }) {
  return <span className={`badge badge-${DAMAGE_TONE[status] || 'grey'}`}>{status}</span>;
}

/** Trust band label + badge colour; the number is always shown next to it. */
export function trustBand(score) {
  if (score >= 70) return { label: 'High trust', tone: 'green' };
  if (score >= 40) return { label: 'Building trust', tone: 'amber' };
  return { label: 'Low trust', tone: 'red' };
}

export const personName = (p) => (p ? `${p.name} (@${p.username})` : 'Deleted user');
