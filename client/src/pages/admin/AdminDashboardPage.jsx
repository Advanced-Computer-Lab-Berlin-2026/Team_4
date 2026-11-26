import { Link } from 'react-router-dom';
import Icon from '../../components/common/Icon';
import { adminLinks } from '../../components/layout/navLinks';

const tasks = [
  ['/admin/users', 'Review user accounts and manage access.', 'user'],
  ['/admin/lender-applications', 'Review requests to lend equipment.', 'check'],
  ['/admin/items', 'Browse listings and review their status.', 'tool'],
  ['/admin/categories', 'Manage categories and deposit multipliers.', 'box'],
  ['/admin/notices', 'Post updates for the community.', 'bell'],
];

export default function AdminDashboardPage() {
  const otherLinks = adminLinks.filter(({ to }) => to !== '/admin' && !tasks.some(([path]) => path === to));

  return (
    <div className="container admin-overview">
      <div className="workspace-heading">
        <h1>Admin dashboard</h1>
        <Link to="/admin/admins/new" className="btn btn-secondary">Add admin <Icon name="upRight" size={16} /></Link>
      </div>
      <section className="grid" aria-label="Administration">
        {tasks.map(([to, description, icon]) => (
          <Link key={to} to={to} className="card card-link admin-tile">
            <div className="card-body">
              <span className="catalog-category-icon"><Icon name={icon} size={23} /></span>
              <h2>{adminLinks.find((link) => link.to === to)?.label}</h2>
              <p className="muted">{description}</p>
              <Icon name="upRight" size={17} />
            </div>
          </Link>
        ))}
      </section>
      {otherLinks.length > 0 && (
        <section aria-labelledby="admin-tools">
          <h2 id="admin-tools">Reports and tools</h2>
          <div className="grid admin-link-grid">
            {otherLinks.map(({ to, label }) => (
              <Link key={to} to={to} className="card card-link card-body workspace-link">
                {label}<Icon name="arrow" size={17} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
