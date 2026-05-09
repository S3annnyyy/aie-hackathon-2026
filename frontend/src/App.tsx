import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from './layouts/AppLayout'
import { LandingLayout } from './layouts/LandingLayout'
import DesignerPage from './pages/DesignerPage'
import ExplorePage from './pages/ExplorePage'
import LandingPage from './pages/LandingPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<LandingLayout />}>
          <Route index element={<LandingPage />} />
        </Route>
        <Route element={<AppLayout />}>
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/designer" element={<DesignerPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
