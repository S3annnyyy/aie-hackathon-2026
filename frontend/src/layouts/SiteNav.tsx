import { NavLink } from 'react-router-dom'

type NavItem = {
  to: string
  label: string
}

const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Home' },
  { to: '/explore', label: 'Explore a Unit' },
  { to: '/designer', label: 'Designer' },
]

export function SiteNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-cream/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 md:px-6 md:py-4">
        <NavLink
          to="/"
          className="flex items-baseline gap-2 text-espresso hover:text-terracotta-dark"
        >
          <span className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight md:text-2xl">
            Pascal
          </span>
          <span className="hidden text-xs uppercase tracking-[0.22em] text-subtle md:inline">
            See inside before you move in
          </span>
        </NavLink>

        <nav aria-label="Primary">
          <ul className="flex items-center gap-1 text-sm md:gap-2">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    [
                      'inline-flex items-center rounded-full px-3 py-1.5 font-medium transition-colors',
                      isActive
                        ? 'bg-terracotta text-white'
                        : 'text-muted hover:bg-warm hover:text-espresso',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  )
}
