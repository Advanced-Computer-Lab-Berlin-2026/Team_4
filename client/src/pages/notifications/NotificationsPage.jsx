import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Alert from '../../components/common/Alert';
import Pagination from '../../components/common/Pagination';
import Spinner from '../../components/common/Spinner';
import { getErrorMessage } from '../../api/axios';
import { getUnreadNotificationCount, listNotifications, markAllNotificationsRead, markNotificationRead } from '../../api/notifications.api';
import styles from '../../styles/sprint2/member9.module.css';

export default function NotificationsPage() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [page, setPage] = useState(1);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([listNotifications({ page }), getUnreadNotificationCount()])
      .then(([data, count]) => {
        if (active) {
          setResult(data);
          setUnread(count.count);
        }
      })
      .catch((err) => { if (active) setError(getErrorMessage(err)); });
    return () => { active = false; };
  }, [page]);

  async function markAll() {
    setBusy(true);
    setError('');
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setResult((current) => ({ ...current, items: current.items.map((item) => item.readAt ? item : { ...item, readAt }) }));
      setUnread(0);
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function markRead(id) {
    setBusy(true);
    setError('');
    try {
      const { notification } = await markNotificationRead(id);
      setResult((current) => ({ ...current, items: current.items.map((item) => item._id === id ? notification : item) }));
      setUnread((count) => Math.max(0, count - 1));
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setBusy(false); }
  }

  return (
    <main className={styles.page}>
      <header className={styles.headingRow}>
        <div><h1>Notifications</h1><p className={styles.muted}>Your in-app updates and reminders.</p></div>
        <button type="button" className={styles.secondaryButton} disabled={busy || unread === 0} onClick={markAll}>
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
                {!item.readAt && <button type="button" className={styles.textButton} disabled={busy} onClick={() => markRead(item._id)}>Mark read</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {result && <Pagination page={result.page} pages={result.pages} onChange={setPage} />}
    </main>
  );
}
