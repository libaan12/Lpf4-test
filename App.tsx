import React, { useEffect, useState, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { ref, onValue } from 'firebase/database';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import { Navbar } from './components/Navbar';
import { LPAssistant } from './components/LPAssistant';
import { UserContext, ThemeContext } from './contexts';

// Pages
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import SoloPage from './pages/SoloPage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import AboutPage from './pages/AboutPage';
import SuperAdminPage from './pages/SuperAdminPage';
import DownloadPage from './pages/DownloadPage'; 

// Protected Route Component
const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  const { user, loading } = React.useContext(UserContext);
  if (loading) return null; 
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
  
  // Theme Logic - Defaults to Light
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return 'light'; // Default to Light
  });

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Apply Theme Class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const cachedProfile = localStorage.getItem('userProfile');
    if (cachedProfile) {
        setProfile(JSON.parse(cachedProfile));
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        const userRef = ref(db, `users/${currentUser.uid}`);
        onValue(userRef, (snapshot) => {
          const data = snapshot.val();
          if (data) {
            const updatedProfile = { uid: currentUser.uid, ...data };
            setProfile(updatedProfile);
            localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
            
            if (data.activeMatch && !location.pathname.includes('/game')) {
              navigate(`/game/${data.activeMatch}`);
            }
          }
          setLoading(false);
        });
      } else {
        setProfile(null);
        localStorage.removeItem('userProfile');
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, [navigate, location.pathname]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors">
        <div className="absolute inset-0 bg-white/40 dark:bg-black/40 backdrop-blur-xl z-0"></div>
        <div className="relative z-10 w-24 h-24 mb-4">
             <div className="absolute inset-0 bg-somali-blue opacity-20 rounded-full animate-ping"></div>
             <div className="relative w-full h-full bg-white/20 backdrop-blur-md border border-white/50 rounded-full flex items-center justify-center shadow-xl z-10">
                 <img src="https://files.catbox.moe/qn40s6.png" alt="Logo" className="w-12 h-12" />
             </div>
        </div>
        <h1 className="relative z-10 text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-600 mb-2 animate-pulse">
            LP-F4
        </h1>
      </div>
    );
  }

  const showNavbar = ['/', '/lobby', '/leaderboard', '/profile', '/about'].includes(location.pathname);
  const showAssistant = user && !location.pathname.includes('/game');

  return (
    <UserContext.Provider value={{ user, profile, loading }}>
      <ThemeContext.Provider value={{ theme, setTheme }}>
        {/* Global Background Elements */}
        <div className="fixed inset-0 -z-10 overflow-hidden bg-gray-50 dark:bg-gray-900 transition-colors duration-500">
           
           {/* Vibrant Gradient Mesh */}
           <div className="absolute top-0 left-0 w-full h-full opacity-60 dark:opacity-30">
               <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-purple-400 rounded-full mix-blend-multiply filter blur-[120px] animate-blob"></div>
               <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-400 rounded-full mix-blend-multiply filter blur-[120px] animate-blob animation-delay-2000"></div>
               <div className="absolute bottom-[-20%] left-[20%] w-[600px] h-[600px] bg-pink-400 rounded-full mix-blend-multiply filter blur-[120px] animate-blob animation-delay-4000"></div>
               <div className="absolute bottom-[-10%] right-[-5%] w-[400px] h-[400px] bg-yellow-400 rounded-full mix-blend-multiply filter blur-[100px] animate-blob animation-delay-5000"></div>
           </div>
           
           {/* Noise Texture Overlay for authentic glass feel */}
           <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }}></div>
        </div>

        <div className="w-full h-[100dvh] font-sans flex flex-col md:flex-row overflow-hidden relative z-10">
            {/* Desktop Navigation */}
            {user && showNavbar && (
                <div className="hidden md:block w-24 lg:w-72 shrink-0 z-20 h-full p-4">
                    <Navbar orientation="vertical" />
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 flex flex-col h-full relative overflow-hidden">
                <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth relative custom-scrollbar">
                  <Routes>
                      <Route path="/auth" element={!user ? <AuthPage /> : <Navigate to="/" />} />
                      <Route path="/download" element={<DownloadPage />} />
                      <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                      <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
                      <Route path="/game/:matchId" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
                      <Route path="/solo" element={<ProtectedRoute><SoloPage /></ProtectedRoute>} />
                      <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
                      <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                      <Route path="/about" element={<ProtectedRoute><AboutPage /></ProtectedRoute>} />
                      <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
                      <Route path="/adminlp" element={<SuperAdminPage />} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </div>
                
                {/* LP Assistant */}
                {showAssistant && <LPAssistant />}

                {/* Mobile Bottom Navigation */}
                {user && showNavbar && (
                    <div className="md:hidden z-20 p-4 absolute bottom-0 w-full pointer-events-none">
                         <div className="pointer-events-auto">
                            <Navbar orientation="horizontal" />
                         </div>
                    </div>
                )}
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