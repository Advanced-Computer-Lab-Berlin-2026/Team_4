import { Link } from 'react-router-dom';
import Icon from '../common/Icon';

export default function Brand({ onClick }) {
  return (
    <Link to="/" className="brand" onClick={onClick}>
      <span className="brand-mark"><Icon name="shed" size={22} /></span>
      <span>ShareShed</span>
    </Link>
  );
}
