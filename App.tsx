
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { ref, onValue, update, serverTimestamp, onDisconnect, get, off } from 'firebase/database';
import { auth, db } from './firebase';
import { UserProfile } from './types';
import { Navbar } from './components/Navbar';
import { LPAssistant } from './components/LPAssistant';
import { UsernamePrompt } from './components/UsernamePrompt';
import { UserContext, ThemeContext } from './contexts';
import { showAlert } from './services/alert';
import confetti from 'canvas-confetti';
import { playSound } from './services/audioService';
import { Button, Modal } from './components/UI';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';

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
import SocialPage from './pages/SocialPage';
import ChatPage from './pages/ChatPage';
import LibraryPage from './pages/LibraryPage';
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
  
  // Enforce Dark Theme
  useEffect(() => {
    document.documentElement.classList.add('dark');
    // Ensure body background is set
    document.body.style.backgroundColor = '#050b14';
  }, []);

  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);

  // Update location ref for listeners
  useEffect(() => {
      locationRef.current = location;
  }, [location]);

  // 1. Setup Auth Listener (Runs Once)
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

  // 2. Setup Presence Listener (Separated to prevent loops)
  useEffect(() => {
    if (!user?.uid) return;

    const connectedRef = ref(db, ".info/connected");
    const presenceRef = ref(db, `users/${user.uid}`);

    const unsubscribeConnected = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            // Use onDisconnect to handle closing tab/app
            onDisconnect(presenceRef).update({
                isOnline: false,
                lastSeen: serverTimestamp()
            }).then(() => {
                // Set online status
                update(presenceRef, {
                    isOnline: true,
                    lastSeen: serverTimestamp()
                });
            });
        }
    });

    return () => {
        unsubscribeConnected();
        // NOTE: We do NOT manually set isOnline: false here.
        // Doing so causes "offline" flickers during navigation or component re-renders.
        // We rely solely on onDisconnect() for actual disconnections.
    };
  }, [user?.uid]);

  // 3. Setup User Profile Listener & Duplicate Check
  useEffect(() => {
    if (!user) return;

    // Load initial cache
    const cachedProfile = localStorage.getItem('userProfile');
    if (cachedProfile) {
        setProfile(JSON.parse(cachedProfile));
    }

    const userRef = ref(db, `users/${user.uid}`);
    
    const unsubscribeUser = onValue(userRef, async (snapshot) => {
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
    };
  }, [user]);

  // 4. Navigation Logic (Runs when profile or location changes)
  useEffect(() => {
      if (profile?.activeMatch && !location.pathname.includes('/game') && !profile.isSupport) {
          navigate(`/game/${profile.activeMatch}`);
      }
  }, [profile?.activeMatch, profile?.isSupport, location.pathname, navigate]);

  // 5. GLOBAL CHAT NOTIFICATION LISTENER
  useEffect(() => {
      if (!user || !profile?.friends) return;

      const friendIds = Object.keys(profile.friends);
      const listeners: Array<() => void> = [];
      const prevCounts: Record<string, number> = {};

      friendIds.forEach(fid => {
          const participants = [user.uid, fid].sort();
          const chatId = `${participants[0]}_${participants[1]}`;
          const unreadRef = ref(db, `chats/${chatId}/unread/${user.uid}/count`);
          
          let isInitial = true;

          const handleCount = (snapshot: any) => {
              const count = snapshot.val() || 0;
              const prev = prevCounts[chatId] || 0;

              // If count increased (new message) AND not initial load
              if (!isInitial && count > prev) {
                  // Check if user is currently inside this chat
                  const currentPath = locationRef.current.pathname;
                  // If NOT in the chat screen for this friend, play sound
                  if (!currentPath.includes(`/chat/${fid}`)) {
                      playSound('message');
                  }
              }

              prevCounts[chatId] = count;
              isInitial = false;
          };

          onValue(unreadRef, handleCount);
          listeners.push(() => off(unreadRef, handleCount));
      });

      return () => listeners.forEach(unsub => unsub());
  }, [user, profile?.friends]); // Only re-run if friends list changes

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
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050b14] overflow-hidden">
        {/* Ambient Background */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-[128px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px] animate-pulse delay-1000"></div>
        
        <div className="relative z-10 flex flex-col items-center">
            {/* Logo Container */}
            <div className="relative mb-8">
                {/* Glow effect */}
                <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-full blur-2xl opacity-40 animate-pulse"></div>
                
                {/* Logo Box */}
                <div className="relative w-32 h-32 bg-[#0f172a] rounded-full shadow-2xl flex items-center justify-center border border-cyan-500/30 ring-4 ring-black/50 backdrop-blur-md overflow-hidden p-4">
                     <img src="/logo.png" alt="LP-F4 Logo" className="w-full h-full object-contain animate-bounce" />
                </div>
            </div>

            {/* Typography */}
            <div className="text-center mb-8">
                <h1 className="text-5xl font-black text-white tracking-tighter mb-1 flex items-center justify-center gap-1">
                    LP<span className="text-cyan-400">F4</span>
                </h1>
                <p className="text-[10px] font-bold text-cyan-500/70 uppercase tracking-[0.5em] animate-pulse">Battle Arena</p>
            </div>
            
            {/* Loading Bar */}
            <div className="w-48 h-1 bg-slate-800 rounded-full overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-500 animate-[loading_1s_ease-in-out_infinite] w-1/2"></div>
            </div>
        </div>

        <style>{`
            @keyframes loading {
                0% { transform: translateX(-150%); }
                100% { transform: translateX(250%); }
            }
        `}</style>
      </div>
    );
  }

  const showNavbar = ['/', '/lobby', '/leaderboard', '/profile', '/about', '/social', '/library'].includes(location.pathname);
  const showAssistant = user && !location.pathname.includes('/game') && !location.pathname.includes('/chat') && !location.pathname.includes('/support');

  return (
    <UserContext.Provider value={{ user, profile, loading }}>
      <ThemeContext.Provider value={{ theme: 'dark', setTheme: () => {} }}>
        {/* GLOBAL GAMING BACKGROUND */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-[#050b14]">
            {/* Base Layer */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03]"></div>
            
            {/* Primary Gradient Mesh (Cyan/Blue) - Top Left */}
            <div className="absolute top-0 left-0 w-[120vw] h-[120vw] sm:w-[80vw] sm:h-[80vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-900/20 via-transparent to-transparent blur-3xl transform -translate-x-1/3 -translate-y-1/3" />
            
            {/* Accent Gradient Mesh (Orange) - Bottom Right */}
            <div className="absolute bottom-0 right-0 w-[120vw] h-[120vw] sm:w-[80vw] sm:h-[80vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-900/20 via-transparent to-transparent blur-3xl transform translate-x-1/3 translate-y-1/3" />
        </div>

        <div className="w-full h-[100dvh] font-sans flex flex-col md:flex-row overflow-hidden relative z-10 text-white">
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
                      <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
                      <Route path="/lobby" element={<ProtectedRoute><LobbyPage /></ProtectedRoute>} />
                      <Route path="/social" element={<ProtectedRoute><SocialPage /></ProtectedRoute>} />
                      <Route path="/library" element={<ProtectedRoute><LibraryPage /></ProtectedRoute>} />
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
                
                {/* PWA Install Banner */}
                <PWAInstallPrompt />

                {/* Verification Success Modal */}
                <Modal isOpen={showVerificationModal} onClose={handleDismissVerification}>
                    <div className="flex flex-col items-center text-center p-4">
                        <div className="w-20 h-20 bg-blue-900/30 rounded-full flex items-center justify-center mb-4 animate__animated animate__bounceIn">
                            <i className="fas fa-check-circle text-5xl text-blue-500 drop-shadow-lg"></i>
                        </div>
                        <h2 className="text-2xl font-black text-white mb-2 uppercase italic tracking-tight">Congratulations!</h2>
                        <p className="text-slate-300 font-bold mb-6">
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
