// HOME - Owner: Member 7 - Requirements: 35
// Route: /   Access: public   (already registered in src/routes/routeConfig.jsx - do NOT edit that file)
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listItems } from '../api/catalog.api';
import { listCategories } from '../api/categories.api';
import { getErrorMessage } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/common/Alert';
import Spinner from '../components/common/Spinner';
import ItemCard from '../components/items/ItemCard';
import SearchBar from '../components/catalog/SearchBar';
import '../components/catalog/catalog.css';

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [latest, setLatest] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    listCategories().then((d) => { if (!ignore) setCategories(d.categories || []); }).catch(() => {});
    listItems({ limit: 4, sort: 'newest' })
      .then((d) => { if (!ignore) setLatest(d.items); })
      .catch((e) => { if (!ignore) setError(getErrorMessage(e)); });
    return () => { ignore = true; };
  }, []);

  const search = (text) => navigate(text ? `/catalog?q=${encodeURIComponent(text)}` : '/catalog');

  return (
    <div className="container">
      <section className="catalog-hero">
        <h1>Borrow before you buy</h1>
        <p className="muted">Ladders, drills, tents and more, lent by your neighbours. Find what you need, then pick it up nearby.</p>
        <SearchBar onSubmit={search} />
        {!user && (
          <p className="muted">New here? <Link to="/register">Create an account</Link> to reserve items. You can browse without one.</p>
        )}
      </section>

      {categories.length > 0 && (
        <section className="catalog-section">
          <h2>Browse by category</h2>
          <div className="grid">
            {categories.map((c) => (
              <Link key={c._id} to={`/categories/${c.slug}`} className="card card-link catalog-category-tile">
                <div className="card-body">
                  {c.icon && <div className="catalog-category-icon" aria-hidden="true">{c.icon}</div>}
                  <h3>{c.name}</h3>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="catalog-section">
        <div className="row">
          <h2>Recently listed</h2>
          <Link to="/catalog">View all items</Link>
        </div>
        <Alert variant="error">{error}</Alert>
        {!latest && !error && <Spinner />}
        {latest && latest.length === 0 && <p className="muted">No items are listed yet.</p>}
        {latest && latest.length > 0 && (
          <div className="grid">{latest.map((item) => <ItemCard key={item._id} item={item} />)}</div>
        )}
      </section>
    </div>
  );
}
