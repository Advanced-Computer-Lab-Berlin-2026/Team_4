import { useEffect, useState } from 'react';
import { listMessages, sendMessage } from '../../../api/reservationChat.api';
import { getErrorMessage } from '../../../api/axios';
import styles from '../../../styles/sprint2/member1.module.css';

function mergeMessages(oldItems, newItems) {
  const merged = new Map([...oldItems, ...newItems].map((item) => [item.id, item]));
  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export default function ReservationChatPanel({ reservationId, userId }) {
  const [items, setItems] = useState([]);
  const [hasEarlier, setHasEarlier] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    let current = true;
    let timer;
    async function refresh() {
      try {
        const data = await listMessages(reservationId);
        if (!current) return;
        setItems((old) => mergeMessages(old, data.items));
        setHasEarlier((old) => old ?? data.hasEarlier);
        timer = setTimeout(refresh, 5000);
      } catch (failure) {
        if (!current) return;
        setError(getErrorMessage(failure));
        if ([401, 403, 404, 409].includes(failure.response?.status)) {
          setClosed(true);
        } else {
          timer = setTimeout(refresh, 10000);
        }
      }
    }
    refresh();
    return () => { current = false; clearTimeout(timer); };
  }, [reservationId]);

  async function older() {
    setLoadingEarlier(true);
    setError('');
    try {
      const data = await listMessages(reservationId, items[0].id);
      setItems((old) => mergeMessages(old, data.items));
      setHasEarlier(data.hasEarlier);
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setLoadingEarlier(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (sending || closed || !text.trim()) return;
    setSending(true);
    setError('');
    try {
      const message = await sendMessage(reservationId, text.trim());
      setItems((old) => mergeMessages(old, [message]));
      setText('');
    } catch (failure) {
      setError(getErrorMessage(failure));
    } finally {
      setSending(false);
    }
  }

  return (
    <section aria-labelledby="reservation-chat-title">
      <h2 id="reservation-chat-title">Reservation chat</h2>
      {hasEarlier && !closed && <button className={styles.button} disabled={loadingEarlier}
        onClick={older}>Load earlier messages</button>}
      {hasEarlier === null && !error && <p role="status">Loading messages…</p>}
      {hasEarlier !== null && !items.length && <p>No messages yet.</p>}
      <ol className={styles.list} aria-label="Messages">{items.map((message) => (
        <li key={message.id}>
          <strong>{message.senderId === userId ? 'You' : 'Other participant'}</strong>{' '}
          <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
          <div>{message.text}</div>
        </li>
      ))}</ol>
      {!closed && (
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>Message
            <textarea required maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <button className={styles.button} disabled={sending || !text.trim()}>{sending ? 'Sending…' : 'Send message'}</button>
        </form>
      )}
      {error && <p className={styles.error} role="alert">{error}</p>}
    </section>
  );
}
