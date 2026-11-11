import { createBrowserRouter, RouterProvider, Outlet, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuthSync, useUser, useAuthLoading } from './hooks/useSupabase.js';
import { Sidebar } from './components/layout/Sidebar.jsx';
import { TopBar } from './components/layout/TopBar.jsx';
import { MobileNav } from './components/layout/MobileNav.jsx';
import { FullScreenLoading } from './components/shared/LoadingSpinner.jsx';

import Landing from './pages/Landing.jsx';
import Chat from './pages/Chat.jsx';
import Notes from './pages/Notes.jsx';
import Tasks from './pages/Tasks.jsx';
import Today from './pages/Today.jsx';
import Applications from './pages/Applications.jsx';
import { CommandBar } from './components/capture/CommandBar.jsx';
import Calendar from './pages/Calendar.jsx';
import Habits from './pages/Habits.jsx';
import Goals from './pages/Goals.jsx';
import Focus from './pages/Focus.jsx';
import Analytics from './pages/Analytics.jsx';
import WeeklyReview from './pages/WeeklyReview.jsx';
import Settings from './pages/Settings.jsx';

function ProtectedLayout() {
  const user = useUser();
  const loading = useAuthLoading();
  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/" replace />;
  return (
    <div className="relative min-h-dvh flex bg-surface-base text-text-primary">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 grain"
        style={{
          background:
            'radial-gradient(50rem 24rem at 88% -6%, rgba(45,212,191,0.07), transparent 58%),' +
            'radial-gradient(42rem 24rem at -5% 4%, rgba(56,189,248,0.05), transparent 55%),' +
            'radial-gradient(60rem 40rem at 50% 120%, rgba(45,212,191,0.035), transparent 60%)'
        }}
      />
      <Sidebar />
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <TopBar />
        <AnimatedOutlet />
        <MobileNav />
        <CommandBar />
      </div>
    </div>
  );
}

function AnimatedOutlet() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <div key={location.pathname} className="flex-1 min-w-0">
        <Outlet />
      </div>
    </AnimatePresence>
  );
}

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  {
    element: <ProtectedLayout />,
    children: [
      { path: '/dashboard', element: <Today /> },
      { path: '/applications', element: <Applications /> },
      { path: '/chat', element: <Chat /> },
      { path: '/notes', element: <Notes /> },
      { path: '/tasks', element: <Tasks /> },
      { path: '/calendar', element: <Calendar /> },
      { path: '/habits', element: <Habits /> },
      { path: '/goals', element: <Goals /> },
      { path: '/focus', element: <Focus /> },
      { path: '/analytics', element: <Analytics /> },
      { path: '/review', element: <WeeklyReview /> },
      { path: '/settings', element: <Settings /> }
    ]
  },
  { path: '*', element: <Navigate to="/" replace /> }
]);

export default function App() {
  useAuthSync();
  return <RouterProvider router={router} />;
}
