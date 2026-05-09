import { Outlet } from 'react-router-dom'

/**
 * Landing layout is chromeless — the hero is full-bleed 3D and supplies its
 * own navigation overlay so the Canvas reads as the product.
 */
export function LandingLayout() {
  return (
    <div className="min-h-screen bg-espresso text-cream">
      <Outlet />
    </div>
  )
}
