import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getErrorMessage } from '../../api/axios';
import Alert from '../common/Alert';
import Brand from './Brand';
import Icon from '../common/Icon';
import NotificationBell from '../sprint2/m9/NotificationBell';
import { accountLinks, adminLinks, applyLink, guestLinks, lenderLinks, memberLinks } from './navLinks';
import useTheme from './useTheme';

const settingsPaths = ['/account/wallet', '/account/late-fees', '/membership', '/referrals', '/account/notification-preferences'];
const communityPaths = ['/household', '/notices', '/support'];
const primaryPaths = ['/catalog', '/reservations', '/my-reservations', '/borrow-list'];
const reportPaths = ['/admin/reports/', '/admin/membership-report', '/admin/referrals', '/admin/promo-usage'];
const themeOptions = [
  { value: 'system', label: 'System', icon: 'monitor' },
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
];

function getNavigation(user, isAdmin, isVerifiedLender) {
  if (!user) return { primary: guestLinks.slice(0, 1), sections: [], account: guestLinks.slice(1) };
  if (isAdmin) {
    const reports = adminLinks.filter(({ to }) => reportPaths.some((path) => to.startsWith(path)));
    return {
      primary: adminLinks.filter(({ to }) => to === '/admin'),
      sections: [
        { label: 'Manage', links: adminLinks.filter((link) => link.to !== '/admin' && !reports.includes(link)) },
        { label: 'Reports', links: reports },
      ],
      account: accountLinks.filter(({ memberOnly }) => !memberOnly),
    };
  }
  return {
    primary: primaryPaths.flatMap((path) => memberLinks.filter(({ to }) => to === path)),
    sections: [
      { label: 'Borrowing', links: memberLinks.filter(({ to }) => ![...primaryPaths, ...settingsPaths, ...communityPaths].includes(to)) },
      { label: 'Community', links: memberLinks.filter(({ to }) => communityPaths.includes(to)) },
      { label: 'Lending', links: isVerifiedLender ? lenderLinks : [applyLink] },
    ],
    account: [...accountLinks, ...memberLinks.filter(({ to }) => settingsPaths.includes(to))],
  };
}

function RouteLinks({ links, onNavigate, className }) {
  return links.map(({ to, label }) => (
    <NavLink key={to} to={to} end={to === '/admin'} className={className} onClick={onNavigate}>{label}</NavLink>
  ));
}

export default function Navbar() {
  const { pathname } = useLocation();
  const { user, isAdmin, isVerifiedLender, logout } = useAuth();
  const { preference, chooseTheme } = useTheme();
  const [open, setOpen] = useState('');
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  const navigate = useNavigate();
  const { primary, sections, account } = getNavigation(user, isAdmin, isVerifiedLender);
  const currentTheme = themeOptions.find(({ value }) => value === preference);
  const isActive = (links) => links.some(({ to }) => pathname === to || (to !== '/admin' && pathname.startsWith(to + '/')));

  useEffect(() => {
    setOpen('');
  }, [pathname, user?._id]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!root.current?.contains(event.target)) setOpen('');
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  const toggle = (name, event) => {
    trigger.current = event.currentTarget;
    setOpen((previous) => previous === name ? '' : name);
  };

  const closeMenu = (restoreFocus = false) => {
    setOpen('');
    if (restoreFocus) trigger.current?.focus();
  };

  const logoutCurrentUser = async () => {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
      closeMenu();
      navigate('/');
    } catch (error) {
      setLogoutError(getErrorMessage(error));
    } finally {
      setLoggingOut(false);
    }
  };

  const menuButtonProps = (name) => ({
    type: 'button',
    'aria-expanded': open === name,
    'aria-controls': open === name ? id + '-' + name : undefined,
    onClick: (event) => toggle(name, event),
  });
  const signOut = (
    <button type="button" className="nav-menu-link nav-sign-out" disabled={loggingOut} onClick={logoutCurrentUser}>
      {loggingOut ? 'Logging out…' : 'Log out'}
    </button>
  );

  return (
    <header className="navbar" ref={root}
      onKeyDown={(event) => {
        if (open && event.key === 'Escape') closeMenu(true);
      }}
      onBlur={(event) => {
        if (event.relatedTarget && !root.current?.contains(event.relatedTarget)) closeMenu();
      }}>
      <div className="navbar-inner">
        <Brand onClick={() => closeMenu()} />
        <nav className="nav-desktop" aria-label="Main navigation">
          <RouteLinks links={primary} className="nav-link" onNavigate={() => closeMenu()} />
          {(isAdmin ? sections : [{ label: 'Explore', links: sections.flatMap(({ links }) => links) }])
            .filter(({ links }) => links.length > 0)
            .map(({ label, links }) => {
              const name = label.toLowerCase();
              return (
                <div className="nav-disclosure" key={name}>
                  <button {...menuButtonProps(name)} className={'nav-link' + (isActive(links) ? ' is-active' : '')}>
                    {label}<Icon name="chevron" size={15} />
                  </button>
                  {open === name && (
                    <div className="nav-popover" id={id + '-' + name}>
                      {name === 'explore' ? sections.filter(({ links: items }) => items.length).map((section) => (
                        <div className="nav-menu-group" key={section.label}>
                          <p>{section.label}</p>
                          <RouteLinks links={section.links} className="nav-menu-link" onNavigate={() => closeMenu()} />
                        </div>
                      )) : <RouteLinks links={links} className="nav-menu-link" onNavigate={() => closeMenu()} />}
                    </div>
                  )}
                </div>
              );
            })}
        </nav>
        <div className="navbar-actions">
          <div className="nav-disclosure">
            <button {...menuButtonProps('theme')} className="nav-icon-button" aria-label="Appearance" title="Appearance">
              <Icon name={currentTheme.icon} size={19} />
            </button>
            {open === 'theme' && (
              <div className="nav-popover nav-theme-popover" id={id + '-theme'}>
                <p className="nav-menu-caption">Appearance</p>
                {themeOptions.map(({ value, label, icon }) => (
                  <button type="button" key={value} className="nav-menu-link"
                    aria-pressed={preference === value} onClick={() => { chooseTheme(value); closeMenu(true); }}>
                    <Icon name={icon} size={17} />{label}
                    {preference === value && <span className="nav-option-check"><Icon name="check" size={16} /></span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {user?.role === 'member' && (
            <div className="nav-notifications" onClick={() => closeMenu()}>
              <NotificationBell key={user._id} />
            </div>
          )}
          {user ? (
            <div className="nav-disclosure nav-account">
              <button {...menuButtonProps('account')} className={'nav-account-button' + (isActive(account) ? ' is-active' : '')} aria-label={`${user.name || user.username} account`}>
                <span className="nav-avatar"><Icon name="user" size={17} /></span>
                <span className="nav-account-name">{user.name || user.username}</span>
                <Icon name="chevron" size={15} />
              </button>
              {open === 'account' && (
                <div className="nav-popover nav-account-popover" id={id + '-account'}>
                  <p className="nav-menu-caption">{user.name || user.username}</p>
                  <RouteLinks links={account} className="nav-menu-link" onNavigate={() => closeMenu()} />
                  {signOut}
                </div>
              )}
            </div>
          ) : (
            <div className="nav-guest">
              <Link to="/login" className="nav-link">Sign in</Link>
              <Link to="/register" className="btn nav-join">Join ShareShed<Icon name="arrow" size={16} /></Link>
            </div>
          )}
          <button {...menuButtonProps('mobile')} className="nav-icon-button nav-toggle" aria-label="Toggle navigation">
            <Icon name={open === 'mobile' ? 'close' : 'menu'} />
          </button>
        </div>
        {open === 'mobile' && (
          <nav id={id + '-mobile'} className="nav-mobile" aria-label="Mobile navigation">
            <RouteLinks links={primary} className="nav-menu-link" onNavigate={() => closeMenu()} />
            {sections.filter(({ links }) => links.length).map(({ label, links }) => (
              <details key={label} open={isActive(links) || undefined}>
                <summary className="nav-menu-link">{label}<Icon name="chevron" size={15} /></summary>
                <div className="nav-nested">
                  <RouteLinks links={links} className="nav-menu-link" onNavigate={() => closeMenu()} />
                </div>
              </details>
            ))}
            {user ? (
              <details open={isActive(account) || undefined}>
                <summary className="nav-menu-link">Account<Icon name="chevron" size={15} /></summary>
                <div className="nav-nested">
                  <RouteLinks links={account} className="nav-menu-link" onNavigate={() => closeMenu()} />
                  {signOut}
                </div>
              </details>
            ) : <RouteLinks links={account} className="nav-menu-link" onNavigate={() => closeMenu()} />}
          </nav>
        )}
      </div>
      {logoutError && <div className="container"><Alert variant="error">{logoutError}</Alert></div>}
    </header>
  );
}
