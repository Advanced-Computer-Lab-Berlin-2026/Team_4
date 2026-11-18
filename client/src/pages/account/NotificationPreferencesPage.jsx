import { useEffect, useState } from 'react';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import { getErrorMessage } from '../../api/axios';
import { getNotificationPreferences, updateNotificationPreferences } from '../../api/notificationPreferences.api';
import styles from '../../styles/sprint2/member9.module.css';

const LABELS = {
  reservations: 'Reservation updates',
  promotions: 'Availability and promotions',
  communityNotices: 'Community notices',
};

export default function NotificationPreferencesPage() {
  const [preferences, setPreferences] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getNotificationPreferences()
      .then(({ preferences: saved }) => setPreferences(saved))
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  async function toggle(category, enabled) {
    setBusy(true); setError(''); setSuccess('');
    const previous = preferences;
    setPreferences({ ...previous, [category]: enabled });
    try {
      const result = await updateNotificationPreferences({ [category]: enabled });
      setPreferences(result.preferences);
      setSuccess('Email preferences saved. In-app notifications will continue to appear.');
    } catch (err) {
      setPreferences(previous);
      setError(getErrorMessage(err));
    } finally { setBusy(false); }
  }

  return (
    <main className={styles.page}>
      <h1>Notification preferences</h1>
      <p className={styles.muted}>Choose which categories may also be sent by email. In-app notifications are always retained.</p>
      <Alert variant="error">{error}</Alert>
      <Alert variant="success">{success}</Alert>
      {!preferences && !error && <Spinner />}
      {preferences && (
        <section className={styles.preferenceList} aria-label="Email notification categories">
          {Object.entries(LABELS).map(([category, label]) => (
            <label className={styles.preferenceRow} key={category}>
              <span><strong>{label}</strong><small>Email messages for this category</small></span>
              <input
                type="checkbox"
                checked={preferences[category] !== false}
                disabled={busy}
                onChange={(event) => toggle(category, event.target.checked)}
                aria-label={`Email ${label.toLowerCase()}`}
              />
            </label>
          ))}
        </section>
      )}
    </main>
  );
}
