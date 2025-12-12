import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { ref, onValue, off } from 'firebase/database';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import { Navbar } from './components/Navbar';

// Pages
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import SoloPage from './pages/SoloPage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';

// Context for User Data
export const UserContext = React.createContext<{
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}>({ user: null, profile: null, loading: true });

// Context for Theme
export const ThemeContext = React.createContext<{
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}>({ theme: 'light', toggleTheme: () => {} });

// Protected Route Component
const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  const { user } = React.useContext(UserContext);
  if (!user) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
};

// Admin Route Component
const AdminRoute = ({ children }: { children?: React.ReactNode }) => {
  const { user, profile, loading } = React.useContext(UserContext);
  if (loading) return null;
  if (!user || profile?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
  });

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch User Profile
        const userRef = ref(db, `users/${currentUser.uid}`);
        onValue(userRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            setProfile({ uid: currentUser.uid, ...data });
            // Auto-redirect to game if active match found (and not already there)
            if (data.activeMatch && !location.pathname.includes('/game')) {
              navigate(`/game/${data.activeMatch}`);
            }
          }
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-somali-blue">
        <div className="text-white text-2xl font-bold animate-pulse">Loading LP-F4...</div>
      </div>
    );
  }

  // Define which paths show the Navbar
  const showNavbar = ['/', '/lobby', '/leaderboard', '/profile'].includes(location.pathname);

  return (
    <UserContext.Provider value={{ user, profile, loading }}>
      <ThemeContext.Provider value={{ theme, toggleTheme }}>
        <div className={`min-h-screen font-sans flex justify-center ${theme === 'dark' ? 'bg-gray-900' : 'bg-gray-50'}`}>
          {/* Mobile Container with Fixed Height Layout and Theme Class */}
          <div className={`w-full max-w-md shadow-2xl overflow-hidden relative flex flex-col h-[100dvh] transition-colors duration-300 ${theme === 'dark' ? 'dark bg-gray-900 text-white' : 'bg-white text-gray-800'}`}>
            <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth">
              <Routes>
                <Route path="/auth" element={!user ? <AuthPage /> : <Navigate to="/" />} />
                <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
                <Route path="/game/:matchId" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
                <Route path="/solo" element={<ProtectedRoute><SoloPage /></ProtectedRoute>} />
                <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
              </Routes>
            </div>
            
            {/* Footer Navbar */}
            {user && showNavbar && <Navbar />}
          </div>
        </div>
      </ThemeContext.Provider>
    </UserContext.Provider>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <AppContent />
    </HashRouter>
  );
};

export default App;