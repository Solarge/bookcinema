import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import AdminApp from './components/admin/AdminApp'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Standalone company admin console — a SEPARATE build/entry from the tenant app.
// Ships none of the tenant SPA code; deploy at admin.<domain> or serve /admin.html.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AdminApp />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
