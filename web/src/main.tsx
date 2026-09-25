import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { router } from '@/app/router'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
})

// Never show one user's cached data to the next user on the same device.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') queryClient.clear()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster richColors position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
