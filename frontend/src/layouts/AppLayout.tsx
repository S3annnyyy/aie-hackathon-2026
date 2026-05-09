import { Outlet } from 'react-router-dom'
import { SiteNav } from './SiteNav'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-cream text-espresso">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-terracotta focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main-content">
        <Outlet />
      </main>
    </div>
  )
}
