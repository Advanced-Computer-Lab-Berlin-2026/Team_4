import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import DevRoleSwitcher from '../dev/DevRoleSwitcher';

export default function Layout() {
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <Navbar />
      <main className="main" id="main-content" tabIndex={-1}>
        <div className="page-content" key={pathname}><Outlet /></div>
      </main>
      <Footer />
      <ScrollRestoration getKey={(location) => location.pathname} />
      {import.meta.env.DEV && <DevRoleSwitcher />}
    </div>
  );
}
