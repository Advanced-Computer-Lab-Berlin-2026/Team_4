// CATALOG - Owner: Member 7 - Requirements: 16, 17, 18, 19, 35 (Sprint 1) + 44 (availability date filter)
// Route: /catalog   Access: public   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
// Filters live in the URL (?q=&category=&sort=&from=&to=&page=) so links, refresh and the back button all work.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listItems } from '../../api/catalog.api';
import { listCategories } from '../../api/categories.api';
import { getErrorMessage } from '../../api/axios';
import Alert from '../../components/common/Alert';
import Spinner from '../../components/common/Spinner';
import Pagination from '../../components/common/Pagination';
import FormField from '../../components/common/FormField';
import ItemCard from '../../components/items/ItemCard';
import SearchBar from '../../components/catalog/SearchBar';
import CategoryFilter from '../../components/catalog/CategoryFilter';
import AvailabilityFilter from '../../components/sprint2/m7/AvailabilityFilter';
import styles from '../../styles/sprint2/member7.module.css';
import { formatDay, isDay } from '../../components/sprint2/m7/dateUtils';
import '../../components/catalog/catalog.css';

const SORT_OPTIONS = [
  ['newest', 'Newest first'],
  ['deposit-asc', 'Deposit: low to high'],
  ['deposit-desc', 'Deposit: high to low'],
  ['title', 'Name (A–Z)'],
];

export default function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'newest';
  const page = Math.max(parseInt(params.get('page'), 10) || 1, 1);
  const rawFrom = params.get('from') || '';
  const rawTo = params.get('to') || '';
  const datesOk = isDay(rawFrom) && isDay(rawTo) && rawTo > rawFrom;
  const from = datesOk ? rawFrom : '';
  const to = datesOk ? rawTo : '';

  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listCategories().then((d) => setCategories(d.categories || [])).catch(() => {}); // filter still works as "all"
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    listItems({
      q: q || undefined, category: category || undefined, sort, page,
      availableFrom: from || undefined, availableTo: to || undefined,
    })
      .then((d) => { if (!ignore) setData(d); })
      .catch((e) => { if (!ignore) setError(getErrorMessage(e)); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [q, category, sort, page, from, to]);

  // change filters and go back to page 1
  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries({ page: '', ...changes }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  };

  const items = data?.items || [];
  const hasFilters = q || category || from;

  return (
    <div className={`container ${styles.browse}`}>
      <h1>Catalog</h1>

      <div className="catalog-toolbar">
        <SearchBar value={q} onSubmit={(text) => update({ q: text })} />
        <CategoryFilter categories={categories} value={category} onChange={(id) => update({ category: id })} />
        <FormField label="Sort by">
          <select value={sort} onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
            {SORT_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </FormField>
      </div>

      <AvailabilityFilter from={from} to={to} onChange={(r) => update({ from: r.from, to: r.to })} />

      <Alert variant="error">{error}</Alert>
      {loading && <Spinner />}

      {!loading && !error && (
        items.length === 0 ? (
          <div className="catalog-empty">
            <p className="muted">{hasFilters ? 'No items match your search.' : 'No items are listed yet.'}</p>
            {hasFilters && <button className="btn btn-secondary" onClick={() => setParams({})}>Clear search and filters</button>}
          </div>
        ) : (
          <>
            <p className="muted catalog-summary" aria-live="polite">
              {data.total} {data.total === 1 ? 'item' : 'items'} found{from && ` available ${formatDay(from)} to ${formatDay(to)}`}
            </p>
            <div className="grid">
              {items.map((item) => (
                <ItemCard key={item._id} item={item} to={from ? `/catalog/${item._id}?start=${from}&end=${to}` : undefined} />
              ))}
            </div>
            <Pagination page={data.page} pages={data.pages} onChange={(p) => { update({ page: p > 1 ? String(p) : '' }); window.scrollTo({ top: 0 }); }} />
          </>
        )
      )}
    </div>
  );
}
