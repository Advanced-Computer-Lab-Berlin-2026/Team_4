import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getItem, listItems } from '../../api/catalog.api';
import { getErrorMessage } from '../../api/axios';
import styles from '../../styles/sprint2/member1.module.css';

function ItemPicker() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState({ q: '', page: 1 });
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    listItems(search).then((data) => {
      if (current) setResults(data);
    }).catch((failure) => {
      if (current) setError(getErrorMessage(failure));
    });
    return () => { current = false; };
  }, [search]);

  function load(q, page) {
    setResults(null);
    setError('');
    setSearch({ q, page });
  }

  return (
    <>
      <h1>Reserve an item</h1>
      <Link to="/checkout">Checkout borrow list</Link>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); load(query.trim(), 1); }}>
        <label className={styles.field}>Find an item
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button className={styles.button}>Search</button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!results && !error && <p role="status">Loading items…</p>}
      {results && (
        <>
          {!results.items.length && <p>No matching items.</p>}
          <ul className={styles.list}>{results.items.map((item) => (
            <li key={item._id}><Link to={'/reserve/' + item._id}>{item.title}</Link></li>
          ))}</ul>
          <div className={styles.actions}>
            <button className={styles.button} disabled={search.page === 1}
              onClick={() => load(search.q, search.page - 1)}>Previous page</button>
            <button className={styles.button} disabled={search.page >= results.pages}
              onClick={() => load(search.q, search.page + 1)}>Next page</button>
          </div>
        </>
      )}
    </>
  );
}

function ReserveDates({ itemId }) {
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    let current = true;
    getItem(itemId).then((data) => {
      if (current) setItem(data.item);
    }).catch((failure) => {
      if (current) setError(getErrorMessage(failure));
    });
    return () => { current = false; };
  }, [itemId]);

  function submit(event) {
    event.preventDefault();
    if (endDate <= startDate) {
      setError('Choose a return date after the pickup date.');
      return;
    }
    const params = new URLSearchParams({ source: 'single', itemId, startDate, endDate });
    navigate('/checkout?' + params);
  }

  return (
    <>
      <Link to="/reserve">Choose another item</Link>
      <h1>{item ? 'Reserve ' + item.title : 'Reserve an item'}</h1>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!item && !error && <p role="status">Loading listing…</p>}
      {item && (
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.field}>Pickup date
            <input required type="date" min={new Date().toISOString().slice(0, 10)}
              value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label className={styles.field}>Return date
            <input required type="date" min={startDate} value={endDate}
              onChange={(event) => setEndDate(event.target.value)} />
          </label>
          <button className={styles.button}>Review reservation</button>
        </form>
      )}
    </>
  );
}

export default function ReservePage() {
  const { itemId } = useParams();
  return <section className={styles.section}>{itemId ? <ReserveDates key={itemId} itemId={itemId} /> : <ItemPicker />}</section>;
}
