
import React, { useState, useEffect } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, set, get } from 'firebase/database';
import { auth, db } from '../firebase';
import { playSound } from '../services/audioService';
import { generateAvatarUrl } from '../constants';
import { Button, Input, Modal } from '../components/UI';
import { showAlert, showToast } from '../services/alert';

const AuthPage: React.FC = () => {
  // UI State
  const [view, setView] = useState<'welcome' | 'login' | 'register'>('welcome');
  
  // Guest State
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestUsername, setGuestUsername] = useState('');
  const [storedGuestSession, setStoredGuestSession] = useState<{email: string, pass: string, name: string} | null>(null);

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [loading, setLoading] = useState(false);

  // Check for existing guest session on mount
  useEffect(() => {
      const session = localStorage.getItem('lp_guest_session');
      if (session) {
          try {
              setStoredGuestSession(JSON.parse(session));
          } catch(e) {
              localStorage.removeItem('lp_guest_session');
          }
      }
  }, []);

  const generateRandomId = () => Math.random().toString(36).substring(2, 8);

  const getErrorMessage = (code: string) => {
    switch (code) {
        case 'auth/invalid-credential': 
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            return 'Incorrect email or password.';
        case 'auth/email-already-in-use': 
            return 'Email already registered.';
        case 'auth/weak-password': 
            return 'Password too weak.';
        case 'auth/invalid-email': 
            return 'Invalid email address.';
        case 'auth/too-many-requests': 
            return 'Too many attempts. Try later.';
        case 'auth/network-request-failed':
            return 'Network error.';
        default: 
            return 'An error occurred.';
    }
  };

  const checkUsernameExists = async (userHandle: string) => {
      try {
        const snapshot = await get(ref(db, 'users'));
        if (!snapshot.exists()) return false;
        const users = snapshot.val();
        return Object.values(users).some((u: any) => (u?.username || '').toLowerCase() === userHandle.toLowerCase());
      } catch (e) {
          return false;
      }
  };

  // --- GUEST LOGIC ---

  // 1. Initial Click
  const handleGuestClick = () => {
      if (loading) return; // Prevent double click
      playSound('click');
      
      // If we have a session, log them in directly (Continue)
      if (storedGuestSession) {
          loginExistingGuest();
      } else {
          // If no session, open modal to setup profile (New Game)
          setGuestName('');
          setGuestUsername('');
          setShowGuestModal(true);
      }
  };

  // 2. Login Existing Guest (Continue)
  const loginExistingGuest = async () => {
      if (!storedGuestSession || loading) return;
      setLoading(true);
      try {
          await signInWithEmailAndPassword(auth, storedGuestSession.email, storedGuestSession.pass);
          // App.tsx handles redirection
      } catch (e: any) {
          console.error("Guest login failed", e);
          // If login fails (e.g. user deleted from DB), clear session and fallback to new guest
          if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
              localStorage.removeItem('lp_guest_session');
              setStoredGuestSession(null);
              showToast("Previous session expired. Please create new profile.", "info");
              setShowGuestModal(true);
          } else {
              showAlert('Error', getErrorMessage(e.code), 'error');
          }
          setLoading(false);
      }
  };

  // 3. Register New Guest (Create Shadow Account)
  const handleCreateGuest = async () => {
      if (loading) return; // Prevent double click
      
      // Validation
      if (!guestName.trim()) { showToast("Enter your name", "error"); return; }
      if (!guestUsername.trim()) { showToast("Enter a username", "error"); return; }
      
      const cleanUser = guestUsername.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (cleanUser.length < 3) { showToast("Username too short", "error"); return; }
      
      setLoading(true);

      try {
          // Check Username uniqueness before creating auth
          const taken = await checkUsernameExists(cleanUser);
          if (taken) { 
              showToast("Username taken", "error"); 
              setLoading(false); 
              return; 
          }

          // Generate Shadow Credentials
          const randId = generateRandomId();
          const timestamp = Date.now();
          const fakeEmail = `guest_${timestamp}_${randId}@lpf4-temp.com`;
          const fakePass = `guest_${randId}_${timestamp}`;

          // Create Auth
          const userCred = await createUserWithEmailAndPassword(auth, fakeEmail, fakePass);
          const user = userCred.user;
          const seed = generateRandomId();

          // Create Profile IMMEDIATELY to prevent "undefined" issues
          await set(ref(db, `users/${user.uid}`), {
              name: guestName.trim(),
              username: cleanUser,
              points: 0,
              avatar: generateAvatarUrl(seed),
              gender: 'male',
              activeMatch: null,
              banned: false,
              isGuest: true,
              isShadowAccount: true,
              isVerified: false,
              usernameUpdated: true, // Mark as updated so they aren't prompted again
              createdAt: Date.now()
          });

          await updateProfile(user, { displayName: guestName.trim() });

          // Save Session to LocalStorage for "Continue" feature
          const sessionData = { email: fakeEmail, pass: fakePass, name: guestName.trim() };
          localStorage.setItem('lp_guest_session', JSON.stringify(sessionData));
          setStoredGuestSession(sessionData);

          setShowGuestModal(false);
          // App.tsx handles redirection
      } catch (e: any) {
          console.error("Guest creation failed", e);
          showAlert('Error', 'Failed to create guest profile.', 'error');
          setLoading(false);
      }
  };

  // --- STANDARD AUTH LOGIC ---

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // Prevent double click
    setLoading(true);
    playSound('click');

    try {
      if (view === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // Registration Validation
        if (!name.trim()) throw { code: 'custom/missing-name' };
        if (!username.trim()) throw { code: 'custom/missing-username' };
        
        const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (cleanUsername.length < 3) throw { code: 'custom/short-username' };
        
        // Unique Check
        const exists = await checkUsernameExists(cleanUsername);
        if (exists) throw { code: 'custom/username-taken' };

        // Create User
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCred.user;
        const seed = Math.random().toString(36).substring(7);
        
        // Save Full User Details
        await set(ref(db, `users/${user.uid}`), {
          name: name.trim(),
          username: cleanUsername,
          email: user.email,
          points: 0, 
          avatar: generateAvatarUrl(seed),
          gender: gender,
          activeMatch: null,
          banned: false,
          isVerified: false,
          usernameUpdated: true, // Normal users set username on register
          createdAt: Date.now()
        });
        
        await updateProfile(user, { displayName: name.trim() });
      }
    } catch (err: any) {
      console.error(err.code);
      let msg = getErrorMessage(err.code || '');
      if (err.code === 'custom/missing-name') msg = 'Enter your name.';
      if (err.code === 'custom/missing-username') msg = 'Choose a username.';
      if (err.code === 'custom/short-username') msg = 'Username too short (min 3).';
      if (err.code === 'custom/username-taken') msg = 'Username taken.';
      
      showAlert('Error', msg, 'error');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center p-4 relative overflow-hidden transition-colors">
      
      {/* Main Content */}
      <div className="relative z-10 w-full max-w-md">
         
         {/* Branding */}
         <div className={`text-center mb-8 transition-all duration-500 ${view !== 'welcome' ? 'scale-75 mb-4' : ''}`}>
             <div className="w-24 h-24 mx-auto mb-4 relative group">
                <div className="absolute inset-0 bg-gradient-to-tr from-game-primary to-red-500 rounded-3xl rotate-6 blur-lg opacity-60 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative w-full h-full bg-white dark:bg-slate-800 rounded-3xl border border-white/50 dark:border-slate-600 flex items-center justify-center shadow-xl overflow-hidden p-4">
                    <img src="/logo.png" alt="Logo" className="w-full h-full object-contain drop-shadow-md" />
                </div>
             </div>
             <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight relative inline-block">
                LP-<span className="text-transparent bg-clip-text bg-gradient-to-r from-game-primary to-red-600">F4</span>
                {/* 2026 Badge */}
                <span className="absolute -top-2 -right-10 bg-gradient-to-r from-yellow-400 to-yellow-600 text-white text-[10px] px-2 py-0.5 rounded-full transform rotate-12 border border-white/50 shadow-lg animate-pulse">2026</span>
             </h1>
             <p className="text-slate-500 dark:text-slate-400 font-bold tracking-widest text-xs uppercase mt-2">Quiz competition for class F4</p>
         </div>

         {/* VIEW: WELCOME (GUEST FIRST) */}
         {view === 'welcome' && (
             <div className="animate__animated animate__fadeInUp">
                 <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-8 rounded-[2.5rem] shadow-2xl text-center">
                     <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Ready to Play?</h2>
                     <p className="text-slate-500 dark:text-slate-400 text-sm font-bold mb-8">Join the stage to compete with F4 students.</p>
                     
                     {/* Dynamic Guest Button */}
                     <Button 
                        fullWidth 
                        size="lg" 
                        onClick={handleGuestClick} 
                        isLoading={loading}
                        disabled={loading}
                        className={`py-5 text-xl shadow-lg mb-8 relative overflow-hidden group ${storedGuestSession ? 'bg-green-600 border-green-800' : 'shadow-orange-500/30'}`}
                     >
                        <span className="relative z-10 flex items-center justify-center gap-3">
                            <i className={`fas ${storedGuestSession ? 'fa-play' : 'fa-user-secret'} text-2xl`}></i> 
                            {storedGuestSession ? `Continue as ${storedGuestSession.name.split(' ')[0]}` : 'Play as Guest'}
                        </span>
                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12"></div>
                     </Button>

                     <div className="relative mb-8">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t-2 border-slate-200 dark:border-slate-700"></div></div>
                        <div className="relative flex justify-center text-xs font-black uppercase tracking-widest"><span className="px-4 bg-white/0 backdrop-blur-md text-slate-400 dark:text-slate-500">Or Login</span></div>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={() => !loading && setView('login')}
                            disabled={loading}
                            className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-200 dark:border-slate-700 hover:border-game-primary dark:hover:border-game-primary hover:bg-white dark:hover:bg-slate-800 transition-all group disabled:opacity-50"
                        >
                            <i className="fas fa-sign-in-alt text-xl mb-2 text-slate-400 group-hover:text-game-primary transition-colors"></i>
                            <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Login</span>
                        </button>
                        <button 
                            onClick={() => !loading && setView('register')}
                            disabled={loading}
                            className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-200 dark:border-slate-700 hover:border-game-accent dark:hover:border-game-accent hover:bg-white dark:hover:bg-slate-800 transition-all group disabled:opacity-50"
                        >
                            <i className="fas fa-user-plus text-xl mb-2 text-slate-400 group-hover:text-game-accent transition-colors"></i>
                            <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Register</span>
                        </button>
                     </div>
                 </div>
                 
                 {storedGuestSession && (
                     <p className="text-center mt-6 text-xs text-slate-400 font-bold opacity-60 cursor-pointer hover:text-red-500 transition-colors" onClick={() => { if(!loading) { localStorage.removeItem('lp_guest_session'); setStoredGuestSession(null); } }}>
                         <i className="fas fa-times mr-1"></i> Forget guest session
                     </p>
                 )}
                 {!storedGuestSession && <p className="text-center mt-6 text-xs text-slate-400 font-bold opacity-60">Made with ❤️ by LP</p>}
             </div>
         )}

         {/* VIEW: LOGIN & REGISTER FORMS */}
         {view !== 'welcome' && (
             <div className="animate__animated animate__fadeInUp">
                 <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-8 rounded-[2.5rem] shadow-2xl relative">
                     <button 
                        onClick={() => !loading && setView('welcome')}
                        disabled={loading}
                        className="absolute top-6 left-6 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                     >
                         <i className="fas fa-arrow-left"></i>
                     </button>

                     <div className="text-center mb-8 pt-2">
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1">
                            {view === 'login' ? 'Welcome Back' : 'Join the Squad'}
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-bold">
                            {view === 'login' ? 'Login to your account' : 'Create a new profile'}
                        </p>
                     </div>

                     <form onSubmit={handleAuth} className="space-y-4">
                        {view === 'register' && (
                            <div className="animate__animated animate__fadeIn space-y-4">
                                <Input 
                                    icon="fa-user" 
                                    placeholder="Full Name" 
                                    value={name} 
                                    onChange={e => setName(e.target.value)} 
                                    required 
                                    disabled={loading}
                                />
                                <Input 
                                    icon="fa-at" 
                                    placeholder="Username" 
                                    value={username} 
                                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} 
                                    required 
                                    disabled={loading}
                                />
                                <div className="mb-4">
                                    <label className="block text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-widest mb-2 ml-1">Gender</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                                            <i className={`fas ${gender === 'male' ? 'fa-mars' : 'fa-venus'} text-slate-400 text-lg`}></i>
                                        </div>
                                        <select
                                            value={gender}
                                            onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                                            disabled={loading}
                                            className="w-full bg-slate-100 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 rounded-xl py-4 pl-12 pr-10 text-slate-900 dark:text-white font-bold appearance-none focus:border-game-primary focus:outline-none transition-all cursor-pointer disabled:opacity-50"
                                        >
                                            <option value="male">Male</option>
                                            <option value="female">Female</option>
                                        </select>
                                        <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                            <i className="fas fa-chevron-down text-slate-400 text-xs"></i>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <Input 
                            type="email"
                            icon="fa-envelope"
                            placeholder="Email Address"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            disabled={loading}
                        />

                        <Input 
                            type="password" 
                            icon="fa-lock" 
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            disabled={loading}
                        />

                        <div className="pt-4">
                            <Button 
                                type="submit" 
                                fullWidth 
                                size="lg" 
                                isLoading={loading}
                                disabled={loading}
                                className="shadow-xl"
                            >
                                {view === 'login' ? 'Login' : 'Create Account'}
                            </Button>
                        </div>
                     </form>

                     <div className="mt-6 text-center">
                         <p className="text-slate-500 dark:text-slate-400 text-sm font-bold">
                             {view === 'login' ? "Don't have an account?" : "Already have an account?"}
                             <button 
                                 onClick={() => !loading && setView(view === 'login' ? 'register' : 'login')}
                                 disabled={loading}
                                 className="ml-2 text-game-primary hover:underline focus:outline-none transition-colors disabled:opacity-50"
                             >
                                 {view === 'login' ? 'Sign Up' : 'Login'}
                             </button>
                         </p>
                     </div>
                 </div>
             </div>
         )}

         {/* Guest Registration Modal */}
         <Modal isOpen={showGuestModal} title="Guest Profile" onClose={() => { if(!loading) setShowGuestModal(false); }}>
             <div className="space-y-4">
                 <div className="text-center mb-4">
                     <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-2 text-3xl">
                         <i className="fas fa-user-secret text-slate-400"></i>
                     </div>
                     <p className="text-sm text-slate-500 font-bold">Set up your profile to start playing.</p>
                 </div>
                 <Input 
                    icon="fa-user" 
                    placeholder="Full Name" 
                    value={guestName} 
                    onChange={e => setGuestName(e.target.value)} 
                    autoFocus
                    disabled={loading}
                 />
                 <Input 
                    icon="fa-at" 
                    placeholder="Username" 
                    value={guestUsername} 
                    onChange={e => setGuestUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} 
                    disabled={loading}
                 />
                 <Button fullWidth onClick={handleCreateGuest} isLoading={loading} disabled={loading} className="mt-2">
                     Start Game
                 </Button>
             </div>
         </Modal>

      </div>
    </div>
  );
};

export default AuthPage;
