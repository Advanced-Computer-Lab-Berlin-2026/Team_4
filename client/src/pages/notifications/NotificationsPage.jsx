import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import { getErrorMessage } from '../../api/axios';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '../../api/notifications.api';
import styles from '../../styles/sprint2/member9.module.css';

export default function NotificationsPage() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try { setResult(await listNotifications({ page: 1, limit: 50 })); setError(''); }
    catch (err) { setError(getErrorMessage(err)); }
  }
  useEffect(() => { load(); }, []);

  async function markAll() {
    setBusy(true);
    try { await markAllNotificationsRead(); await load(); }
    catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function markRead(id) {
    try {
      const { notification } = await markNotificationRead(id);
      setResult((current) => ({ ...current, items: current.items.map((item) => item._id === id ? notification : item) }));
    } catch (err) { setError(getErrorMessage(err)); }
  }

  return (
    <main className={styles.page}>
      <header className={styles.headingRow}>
        <div><h1>Notifications</h1><p className={styles.muted}>Your in-app updates and reminders.</p></div>
        <button type="button" className={styles.secondaryButton} disabled={busy || !result?.items?.some((item) => !item.readAt)} onClick={markAll}>
          Mark all as read
        </button>
      </header>
      <Alert variant="error">{error}</Alert>
      {!result && !error && <Spinner />}
      {result && result.items.length === 0 && <p className={styles.emptyState}>No notifications yet.</p>}
      {result?.items?.length > 0 && (
        <ul className={styles.notificationList}>
          {result.items.map((item) => (
            <li className={`${styles.notificationCard} ${!item.readAt ? styles.unread : ''}`} key={item._id}>
              <div>
                <h2>{item.title}</h2>
                <p>{item.message}</p>
                <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
              </div>
              <div className={styles.cardActions}>
                {item.link && <Link to={item.link}>Open</Link>}
                {!item.readAt && <button type="button" className={styles.textButton} onClick={() => markRead(item._id)}>Mark read</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
