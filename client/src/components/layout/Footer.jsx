import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Brand from './Brand';

export default function Footer() {
  const { isMember } = useAuth();
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <Brand />
        <nav aria-label="Footer">
          <Link to="/catalog">Browse items</Link>
          {isMember && <Link to="/support">Support</Link>}
        </nav>
        <small>© {new Date().getFullYear()} ShareShed</small>
      </div>
    </footer>
  );
}
