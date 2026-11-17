// ReviewForm - Owner: Member 3 - Requirements: 89, 90
// Props: { reservationId, otherPartyName?, pending?, onSuccess?(review) }  (`pending` = the /reviews/pending entry, if the caller has it)
// Member 5 embeds it on the reservation details page. It renders nothing when the reservation can't be
// reviewed (not completed, window closed, already reviewed) - the server decides via /reviews/pending.
import { useEffect, useId, useState } from 'react';
import Alert from '../../common/Alert';
import FormField from '../../common/FormField';
import { getErrorMessage, getFieldErrors } from '../../../api/axios';
import { createReview, listPendingReviews } from '../../../api/reviews.api';
import { formatDate } from '../../../utils/format';
import styles from '../../../styles/sprint2/member3.module.css';

const MAX_COMMENT = 1500;
const LABELS = { 1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very good', 5: 'Excellent' };

export default function ReviewForm({ reservationId, otherPartyName, pending: pendingProp, onSuccess }) {
  const groupId = useId();
  const [pending, setPending] = useState(pendingProp ?? null);
  const [checked, setChecked] = useState(!!pendingProp);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  // Callers that already have the pending entry (MyReviewsPage) pass it in; others let the form check.
  useEffect(() => {
    if (pendingProp) return undefined;
    let active = true;
    listPendingReviews()
      .then((data) => active && setPending(data.items.find((p) => String(p.reservationId) === String(reservationId)) || null))
      .catch(() => active && setPending(null))
      .finally(() => active && setChecked(true));
    return () => { active = false; };
  }, [reservationId, pendingProp]);

  if (done) return <Alert variant="success">Thanks, your review has been posted.</Alert>;
  if (!checked || !pending) return null;

  const name = otherPartyName || pending.otherParty?.name || 'the other member';
  const roleText = pending.direction === 'borrower_to_lender' ? 'lender' : 'borrower';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const nextErrors = {};
    if (!rating) nextErrors.rating = 'Choose a rating from 1 to 5 stars';
    if (comment.length > MAX_COMMENT) nextErrors.comment = `Comment must be at most ${MAX_COMMENT} characters`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const { review } = await createReview({ reservationId, rating, comment: comment.trim() || undefined });
      setDone(true);
      onSuccess?.(review);
    } catch (err) {
      const fields = Object.fromEntries(getFieldErrors(err).map((f) => [f.field, f.message]));
      if (Object.keys(fields).length) setErrors(fields);
      else setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <p className="muted">
        How was {name} as a {roleText}? You can review until {formatDate(pending.reviewBy)}. Reviews can't be edited later.
      </p>
      <fieldset className={styles.ratingGroup} aria-describedby={errors.rating ? `${groupId}-err` : undefined}>
        <legend>Rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`${styles.ratingOption} ${rating === n ? styles.ratingOptionChecked : ''}`}>
            <input type="radio" name={`${groupId}-rating`} value={n} checked={rating === n} onChange={() => setRating(n)} />
            <span aria-hidden="true">{'★'.repeat(n)}</span>
            <span>{n} · {LABELS[n]}</span>
          </label>
        ))}
        {errors.rating && <div id={`${groupId}-err`} className={`field-error ${styles.fullWidth}`}>{errors.rating}</div>}
      </fieldset>
      <FormField label="Comment (optional)" error={errors.comment} hint={`${comment.length}/${MAX_COMMENT}`}>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={MAX_COMMENT} />
      </FormField>
      <Alert variant="error">{error}</Alert>
      <button type="submit" className="btn" disabled={saving}>{saving ? 'Posting...' : 'Post review'}</button>
    </form>
  );
}
