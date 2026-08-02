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
import Dashboard from './pages/Dashboard.jsx';
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
    <div className="min-h-dvh flex bg-surface-base text-text-primary">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <AnimatedOutlet />
        <MobileNav />
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
      { path: '/dashboard', element: <Dashboard /> },
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
