
import React, { useEffect, useState, useMemo } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { ref, onValue, update, serverTimestamp, onDisconnect } from 'firebase/database';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import { Navbar } from './components/Navbar';
import { LPAssistant } from './components/LPAssistant';
import { UsernamePrompt } from './components/UsernamePrompt';
import { UserContext, ThemeContext } from './contexts';
import { showAlert } from './services/alert';

// Pages
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import SoloPage from './pages/SoloPage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import AboutPage from './pages/AboutPage';
import SuperAdminPage from './pages/SuperAdminPage';
import DownloadPage from './pages/DownloadPage'; 
import SocialPage from './pages/SocialPage';
import ChatPage from './pages/ChatPage';

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
        
        // Presence Logic
        const presenceRef = ref(db, `users/${currentUser.uid}`);
        update(presenceRef, { isOnline: true, lastSeen: serverTimestamp() });
        onDisconnect(presenceRef).update({ isOnline: false, lastSeen: serverTimestamp() });

        onValue(userRef, (snapshot) => {
          const data = snapshot.val();
          
          // --- REAL-TIME BAN ENFORCEMENT ---
          if (data && data.banned) {
            signOut(auth).then(() => {
               setUser(null);
               setProfile(null);
               localStorage.removeItem('userProfile'); // Clear Profile Cache
               navigate('/auth');
               showAlert('⛔ ACCESS DENIED', 'Your account has been permanently suspended by an administrator.', 'error');
            });
            return;
          }
          // ---------------------------------

          if (data) {
            const updatedProfile = { 
                uid: currentUser.uid, 
                ...data,
                points: typeof data.points === 'number' ? data.points : 0 // Ensure points is number
            };
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
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900 text-white transition-colors">
        <div className="absolute inset-0 bg-white/5 backdrop-blur-xl z-0"></div>
        <div className="relative z-10 w-24 h-24 mb-4">
             <div className="absolute inset-0 bg-orange-500 opacity-20 rounded-full animate-ping"></div>
             <div className="relative w-full h-full bg-white/10 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center shadow-xl z-10">
                 <img src="https://files.catbox.moe/qn40s6.png" alt="Logo" className="w-12 h-12" />
             </div>
        </div>
        <h1 className="relative z-10 text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-600 mb-2 animate-pulse">
            LP-F4
        </h1>
      </div>
    );
  }

  const showNavbar = ['/', '/lobby', '/leaderboard', '/profile', '/about', '/social'].includes(location.pathname);
  const showAssistant = user && !location.pathname.includes('/game') && !location.pathname.includes('/chat');

  return (
    <UserContext.Provider value={{ user, profile, loading }}>
      <ThemeContext.Provider value={{ theme, setTheme }}>
        {/* Global Modern Background - Mesh Gradient */}
        <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
            {/* Dark Mode / Default Base */}
            <div className="absolute inset-0 bg-slate-900"></div>
            
            {/* Animated Mesh Gradients - Primary Colors (Orange, Indigo, Dark Slate) */}
            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] opacity-40 dark:opacity-30 animate-bg-shift"
                 style={{
                     background: 'radial-gradient(circle at 50% 50%, #f97316 0%, transparent 50%), radial-gradient(circle at 80% 20%, #6366f1 0%, transparent 40%), radial-gradient(circle at 20% 80%, #b91c1c 0%, transparent 40%)',
                     filter: 'blur(80px)'
                 }}>
            </div>
            
            {/* Light Mode Overlay (Subtle) */}
            <div className="absolute inset-0 bg-white/80 dark:bg-black/20 mix-blend-overlay"></div>
            
            {/* Noise Texture for Realism */}
            <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/noise.png")' }}></div>
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
                      <Route path="/social" element={<ProtectedRoute><SocialPage /></ProtectedRoute>} />
                      <Route path="/chat/:uid" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
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
                
                {/* Username Prompt for Guests */}
                {user && <UsernamePrompt />}

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