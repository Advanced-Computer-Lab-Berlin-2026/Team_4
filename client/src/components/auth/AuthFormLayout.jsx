import { Link } from 'react-router-dom';
import Icon from '../common/Icon';
import workshop from '../../assets/neighborhood-workshop.jpg';

export default function AuthFormLayout({ title, children }) {
  return (
    <div className="container">
      <div className="auth-layout">
        <div className="auth-photo">
          <img src={workshop} alt="" width="1320" height="880" />
        </div>
        <section className="auth-form">
          <Link to="/catalog" className="text-link auth-back"><Icon name="arrow" size={17} />Browse items</Link>
          <h1>{title}</h1>
          {children}
        </section>
      </div>
    </div>
  );
}
