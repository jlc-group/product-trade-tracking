import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { ApiError } from '@/api'
import { qk } from '@/api/hooks'
import { AuthProvider } from '@/auth/auth'
import { FullPageSpinner } from '@/components/common/full-page-spinner'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import App from './App'
import './index.css'

// Leftovers from the retired in-browser demo mode and the presentation prototype (data lived in localStorage), and
// from the retired in-table production quantity drafts (sessionStorage).
try {
  localStorage.removeItem('flowtrade.mockdb')
  localStorage.removeItem('flowtrade.session')
  for (const key of Object.keys(localStorage)) if (key.startsWith('flowtrade.proto.presentation.')) localStorage.removeItem(key)
  for (const key of Object.keys(sessionStorage)) if (key.startsWith('flowtrade.production.drafts.')) sessionStorage.removeItem(key)
} catch {
  // storage blocked — nothing to clean
}

/** A request answered 401 means the session ended (expired, revoked, user deactivated): back to login. */
const onAuthError = (error: unknown) => {
  if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') queryClient.setQueryData(qk.me, null)
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <AuthProvider>
          <Suspense fallback={<FullPageSpinner />}>
            <App />
          </Suspense>
        </AuthProvider>
        {/* Only errors and "can't do this" warnings are toasted; they sit just below the 56px app header / bell. */}
        <Toaster position="top-right" offset={{ top: 64 }} mobileOffset={{ top: 64 }} richColors closeButton />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
)
