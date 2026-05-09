import { Outlet } from 'react-router-dom'
import { SiteNav } from './SiteNav'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-cream text-espresso">
      <SiteNav />
      <main>
        <Outlet />
      </main>
    </div>
  )
}
