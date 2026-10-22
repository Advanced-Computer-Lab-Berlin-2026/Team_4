// FOUNDATION (no owner) - static landing page with links to every admin tool. Sprint 2 reports link here too.
import { Link } from 'react-router-dom';

const TOOLS = [
  ['/admin/users', 'Users', 'Search, view, suspend or remove members, lenders and admins.'],
  ['/admin/lender-applications', 'Lender applications', 'Review documents, accept or reject.'],
  ['/admin/items', 'All listings', 'Every item on the platform.'],
  ['/admin/categories', 'Categories', 'Configure deposit multipliers.'],
  ['/admin/notices', 'Community notices', 'Post announcements for members.'],
  ['/admin/admins/new', 'Add admin', 'Create another administrator account.'],
];

export default function AdminDashboardPage() {
  return (
    <div className="container">
      <h1>Admin dashboard</h1>
      <div className="grid">
        {TOOLS.map(([to, title, text]) => (
          <Link key={to} to={to} className="card card-link"><div className="card-body"><h3>{title}</h3><p className="muted">{text}</p></div></Link>
        ))}
      </div>
    </div>
  );
}
