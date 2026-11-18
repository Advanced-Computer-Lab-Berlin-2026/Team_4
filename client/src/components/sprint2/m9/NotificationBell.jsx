import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUnreadNotificationCount, listNotifications, NOTIFICATIONS_READ } from '../../../api/notifications.api';
import { getErrorMessage } from '../../../api/axios';
import styles from '../../../styles/sprint2/member9.module.css';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const root = useRef(null);

  const refreshId = useRef(0);
  const toggle = useRef(null);

  const refresh = useCallback(async () => {
    const id = ++refreshId.current;
    try {
      const [unread, recent] = await Promise.all([
        getUnreadNotificationCount(),
        listNotifications({ limit: 5 }),
      ]);
      if (id !== refreshId.current) return;
      setCount(unread.count);
      setItems(recent.items || []);
      setError('');
    } catch (err) {
      if (id === refreshId.current) setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(NOTIFICATIONS_READ, refresh);
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, 30_000);
    return () => {
      refreshId.current++;
      window.removeEventListener(NOTIFICATIONS_READ, refresh);
      window.clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (root.current && !root.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, [open]);

  return (
    <div className={styles.bell} ref={root} onKeyDown={(event) => {
      if (open && event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    }}>
      <button
        type="button"
        ref={toggle}
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
