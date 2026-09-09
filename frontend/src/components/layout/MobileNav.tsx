import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from '../../constants/nav';

/** Compact horizontal navigation for narrow screens (shown ≤ 880px via CSS). */
export function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="Primary (compact)">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `mobile-nav__link ${isActive ? 'is-active' : ''}`.trim()}
          >
            <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>{item.short}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
