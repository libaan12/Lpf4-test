
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { ref, onValue, update, serverTimestamp, onDisconnect, get } from 'firebase/database';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import { Navbar } from './components/Navbar';
import { LPAssistant } from './components/LPAssistant';
import { UsernamePrompt } from './components/UsernamePrompt';
import { UserContext, ThemeContext } from './contexts';
import { showAlert, showToast } from './services/alert';
import confetti from 'canvas-confetti';
import { playSound } from './services/audioService';
import { Button, Modal } from './components/UI';

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
import { SupportDashboard } from './pages/SupportDashboard';

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
  
  // Verification Modal State
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  
  // App Update Signal tracking
  const initialUpdateSignal = useRef<any>(null);

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

  // 1. App Update Listener - "Unlimited" Refresh Trigger
  useEffect(() => {
    const updateRef = ref(db, 'settings/lastAppUpdate');
    const unsubscribe = onValue(updateRef, (snapshot) => {
      if (snapshot.exists()) {
        const currentSignal = snapshot.val();
        
        // If this is the first time we're reading the signal since page load
        if (initialUpdateSignal.current === null) {
          initialUpdateSignal.current = currentSignal;
          return;
        }
        
        // If the signal has changed since we started the app, it means the admin clicked "Update"
        if (currentSignal !== initialUpdateSignal.current) {
          console.log("App update signal received, refreshing...");
          window.location.reload();
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Setup Auth Listener (Runs Once)
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
          setProfile(null);
          localStorage.removeItem('userProfile');
          setLoading(false);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // 3. Setup User Profile & Presence Listener (Runs when User changes)
  useEffect(() => {
    if (!user) return;

    // Load initial cache
    const cachedProfile = localStorage.getItem('userProfile');
    if (cachedProfile) {
        setProfile(JSON.parse(cachedProfile));
    }

    const userRef = ref(db, `users/${user.uid}`);
    
    // Presence Logic
    const presenceRef = ref(db, `users/${user.uid}`);
    update(presenceRef, { isOnline: true, lastSeen: serverTimestamp() });
    const disconnectRef = onDisconnect(presenceRef);
    disconnectRef.update({ isOnline: false, lastSeen: serverTimestamp() });

    const unsubscribeUser = onValue(userRef, (snapshot) => {
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
      
      if (data) {
        const updatedProfile = { 
            uid: user.uid, 
            ...data,
            points: typeof data.points === 'number' ? data.points : 0 
        };
        setProfile(updatedProfile);
        localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
        setLoading(false);
      } else {
        setLoading(false);
      }
    });

    return () => {
        unsubscribeUser();
        disconnectRef.cancel();
    };
  }, [user]);

  // 4. Navigation Logic (Runs when profile or location changes)
  useEffect(() => {
      if (profile?.activeMatch && !location.pathname.includes('/game') && !profile.isSupport) {
          navigate(`/game/${profile.activeMatch}`);
      }
  }, [profile?.activeMatch, profile?.isSupport, location.pathname, navigate]);

  // Handle Verification Celebration
  useEffect(() => {
    if (profile?.isVerified && profile?.verificationNotificationPending) {
       setShowVerificationModal(true);
       playSound('win');
       confetti({
         particleCount: 150,
         spread: 70,
         origin: { y: 0.6 },
         zIndex: 9999
       });
    }
  }, [profile?.isVerified, profile?.verificationNotificationPending]);

  const handleDismissVerification = () => {
      if (user) {
          update(ref(db, `users/${user.uid}`), { verificationNotificationPending: null });
      }
      setShowVerificationModal(false);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-orange-50 dark:bg-slate-900 text-white transition-colors">
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
  const showAssistant = user && !location.pathname.includes('/game') && !location.pathname.includes('/chat') && !location.pathname.includes('/support');

  return (
    <UserContext.Provider value={{ user, profile, loading }}>
      <ThemeContext.Provider value={{ theme, setTheme }}>
        {/* GLOBAL GAMING BACKGROUND */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
            {/* Base Layer */}
            <div className="absolute inset-0 bg-slate-50 dark:bg-slate-950 transition-colors duration-500" />
            
            {/* Primary Gradient Mesh (Orange) - Top Left */}
            <div className="absolute top-0 left-0 w-[120vw] h-[120vw] sm:w-[80vw] sm:h-[80vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-200/50 via-transparent to-transparent dark:from-orange-900/30 dark:via-transparent dark:to-transparent blur-3xl transform -translate-x-1/3 -translate-y-1/3" />
            
            {/* Accent Gradient Mesh (Indigo) - Bottom Right */}
            <div className="absolute bottom-0 right-0 w-[120vw] h-[120vw] sm:w-[80vw] sm:h-[80vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-200/50 via-transparent to-transparent dark:from-indigo-900/30 dark:via-transparent dark:to-transparent blur-3xl transform translate-x-1/3 translate-y-1/3" />
            
            {/* Subtle Texture Pattern for 'Game' Feel */}
            <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }}></div>
        </div>

        <div className="w-full h-[100dvh] font-sans flex flex-col md:flex-row overflow-hidden relative z-10 text-slate-900 dark:text-white transition-colors duration-300">
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
                      <Route path="/support" element={<ProtectedRoute><SupportDashboard /></ProtectedRoute>} />
                      <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </div>
                
                {/* LP Assistant */}
                {showAssistant && <LPAssistant />}
                
                {/* Username Prompt for Guests */}
                {user && <UsernamePrompt />}

                {/* Verification Success Modal */}
                <Modal isOpen={showVerificationModal} onClose={handleDismissVerification}>
                    <div className="flex flex-col items-center text-center p-4">
                        <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4 animate__animated animate__bounceIn">
                            <i className="fas fa-check-circle text-5xl text-blue-500 drop-shadow-lg"></i>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 uppercase italic tracking-tight">Congratulations!</h2>
                        <p className="text-slate-600 dark:text-slate-300 font-bold mb-6">
                            You have been officially verified! The blue badge is now visible on your profile.
                        </p>
                        <Button fullWidth onClick={handleDismissVerification} className="shadow-xl bg-blue-500 border-blue-700 hover:bg-blue-600">
                            Awesome!
                        </Button>
                    </div>
                </Modal>

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
