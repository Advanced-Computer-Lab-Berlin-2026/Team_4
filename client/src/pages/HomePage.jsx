import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listItems } from '../api/catalog.api';
import { listCategories } from '../api/categories.api';
import { getErrorMessage } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import Alert from '../components/common/Alert';
import Icon from '../components/common/Icon';
import Spinner from '../components/common/Spinner';
import ItemCard from '../components/items/ItemCard';
import SearchBar from '../components/catalog/SearchBar';
import categoryIcon from '../components/catalog/categoryIcon';
import workshop from '../assets/neighborhood-workshop.jpg';
import '../components/catalog/catalog.css';

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [latest, setLatest] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let ignore = false;
    listCategories()
      .then((data) => { if (!ignore) setCategories(data.categories || []); })
      .catch(() => {});
    listItems({ limit: 4, sort: 'newest' })
      .then((data) => { if (!ignore) setLatest(data.items); })
      .catch((err) => { if (!ignore) setError(getErrorMessage(err)); });
    return () => { ignore = true; };
  }, []);

  const search = (value) => navigate(value ? '/catalog?q=' + encodeURIComponent(value) : '/catalog');

  return (
    <div className="container home-page">
      <section className="catalog-hero">
        <div className="catalog-hero-content">
          <p className="hero-kicker"><Icon name="shed" size={16} /> Your neighbourhood tool library</p>
          <h1>Borrow more.<br />Buy less.</h1>
          <p className="hero-description">Find tools and equipment for your next project. Pick your dates and borrow from a neighbour.</p>
          <SearchBar onSubmit={search} />
          <div className="hero-actions">
            <Link to="/catalog">Browse all items <Icon name="arrow" size={17} /></Link>
            {!user && <Link to="/register">Create an account</Link>}
          </div>
        </div>
        <img className="catalog-hero-photo" src={workshop} alt="A cordless drill and hand tools at a neighbourhood workbench"
          width="1320" height="880" fetchPriority="high" />
      </section>

      {categories.length > 0 && (
        <section className="catalog-section" aria-labelledby="home-categories">
          <div className="catalog-section-heading">
            <h2 id="home-categories">Browse by category</h2>
          </div>
          <div className="catalog-category-grid">
            {categories.map((category) => (
              <Link key={category._id} to={'/categories/' + category.slug} className="catalog-category-tile">
                <span className="catalog-category-icon"><Icon name={categoryIcon(category.slug)} size={23} /></span>
                <span>{category.name}</span>
                <Icon name="upRight" size={14} />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="catalog-section" aria-labelledby="home-recent">
        <div className="catalog-section-heading">
          <h2 id="home-recent">Recently listed</h2>
          <Link to="/catalog" className="text-link">View all items <Icon name="arrow" size={17} /></Link>
        </div>
        <Alert variant="error">{error}</Alert>
        {!latest && !error && <Spinner />}
        {latest && latest.length === 0 && <p className="empty-state">No items are listed yet.</p>}
        {latest && latest.length > 0 && (
          <div className="grid home-item-grid">{latest.map((item) => <ItemCard key={item._id} item={item} />)}</div>
        )}
      </section>
    </div>
  );
}
