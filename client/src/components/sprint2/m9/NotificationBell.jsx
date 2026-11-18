import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUnreadNotificationCount, listNotifications } from '../../../api/notifications.api';
import { getErrorMessage } from '../../../api/axios';
import styles from '../../../styles/sprint2/member9.module.css';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const root = useRef(null);

  async function refresh() {
    try {
      const [unread, recent] = await Promise.all([
        getUnreadNotificationCount(),
        listNotifications({ limit: 5 }),
      ]);
      setCount(unread.count);
      setItems(recent.items || []);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (root.current && !root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  return (
    <div className={styles.bell} ref={root}>
      <button
        type="button"
        className={styles.bellButton}
        aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); if (!open) refresh(); }}
      >
        Notifications {count > 0 && <span className={styles.badge}>{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className={styles.bellPanel} role="dialog" aria-label="Recent notifications">
          <strong>Recent notifications</strong>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {!error && items.length === 0 && <p className={styles.muted}>You are all caught up.</p>}
          <ul className={styles.previewList}>
            {items.map((item) => (
              <li key={item._id}>
                <Link to={item.link || '/notifications'} onClick={() => setOpen(false)}>
                  <span>{item.title}</span>
                  {!item.readAt && <span className={styles.unreadDot} aria-label="Unread" />}
                </Link>
              </li>
            ))}
          </ul>
          <Link className={styles.inlineLink} to="/notifications" onClick={() => setOpen(false)}>
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
