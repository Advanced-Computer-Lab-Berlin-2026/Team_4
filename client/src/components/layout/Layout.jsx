import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import DevRoleSwitcher from '../dev/DevRoleSwitcher';

export default function Layout() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="main"><Outlet /></main>
      <Footer />
      {import.meta.env.DEV && <DevRoleSwitcher />}
    </div>
  );
}
