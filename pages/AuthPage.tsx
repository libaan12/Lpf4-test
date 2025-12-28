import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signInAnonymously } from 'firebase/auth';
import { ref, set, get } from 'firebase/database';
import { auth, db } from '../firebase';
import { playSound } from '../services/audioService';
import { generateAvatarUrl } from '../constants';
import { Button, Input, Modal } from '../components/UI';
import { showAlert, showToast } from '../services/alert';

const AuthPage: React.FC = () => {
  // UI State
  const [view, setView] = useState<'welcome' | 'login' | 'register'>('welcome');
  
  // Guest Modal State
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestUsername, setGuestUsername] = useState('');

  // Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [loading, setLoading] = useState(false);

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
        case 'auth/admin-restricted-operation':
            return 'Guest login disabled. Using fallback...';
        case 'auth/operation-not-allowed':
             return 'Sign-in provider disabled.';
        default: 
            return 'An error occurred.';
    }
  };

  const checkUsernameExists = async (userHandle: string) => {
      try {
        const snapshot = await get(ref(db, 'users'));
        if (!snapshot.exists()) return false;
        const users = snapshot.val();
        // Safe check for missing username field
        return Object.values(users).some((u: any) => (u?.username || '').toLowerCase() === userHandle.toLowerCase());
      } catch (e) {
          console.error("Username check failed", e);
          return false;
      }
  };

  // Step 1: Clicked "Play as Guest"
  const handleGuestClick = () => {
      playSound('click');
      // Check if we have a saved guest session or profile mapping
      const cachedGuest = localStorage.getItem('is_guest_setup');
      
      if (cachedGuest === 'true') {
          performGuestLogin();
      } else {
          setShowGuestModal(true);
      }
  };

  // Step 2: Actually sign in (either after modal or auto)
  const performGuestLogin = async (customName?: string, customUsername?: string) => {
      setLoading(true);
      let user = null;
      let isShadowAccount = false;

      try {
          // 1. Try Native Anonymous Auth
          const userCred = await signInAnonymously(auth);
          user = userCred.user;
      } catch (e: any) {
          // 2. Fallback: Create a shadow email account if Anonymous is disabled (admin-restricted-operation)
          // This ensures the app works even if the developer forgot to enable Anonymous Auth in Firebase Console
          if (e.code === 'auth/admin-restricted-operation' || e.code === 'auth/operation-not-allowed') {
              console.warn("Native Guest Auth disabled. Generating Shadow Account.");
              try {
                  const randId = generateRandomId();
                  const timestamp = Date.now();
                  // Create a unique non-existent email based on timestamp and random ID
                  const fakeEmail = `guest_${timestamp}_${randId}@lpf4-temp.com`;
                  const fakePass = `guest_${randId}_${timestamp}`;
                  
                  const userCred = await createUserWithEmailAndPassword(auth, fakeEmail, fakePass);
                  user = userCred.user;
                  isShadowAccount = true;
              } catch (fallbackErr: any) {
                  console.error("Fallback guest login failed", fallbackErr);
                  showAlert('Login Error', 'Guest access is unavailable. Please try registering normally.', 'error');
                  setLoading(false);
                  return;
              }
          } else {
              // Real error (network, etc)
              showAlert('Login Error', getErrorMessage(e.code), 'error');
              setLoading(false);
              return;
          }
      }

      if (!user) {
          setLoading(false);
          return;
      }

      try {
          // 3. Check if profile exists in DB
          const userRef = ref(db, `users/${user.uid}`);
          const snapshot = await get(userRef);
          
          if (!snapshot.exists()) {
              // CRITICAL: If profile doesn't exist and we don't have custom inputs, force modal
              // This handles the "undefined name" issue by forcing user input if DB is empty
              if (!customName || !customUsername) {
                  setLoading(false);
                  setShowGuestModal(true);
                  return;
              }

              // 4. Create Profile
              const seed = generateRandomId();
              
              // ENSURE NO NULL/UNDEFINED VALUES
              const safeName = customName || `Guest ${seed}`;
              const safeUsername = customUsername || `guest_${seed}`;

              await set(userRef, {
                name: safeName,
                username: safeUsername,
                points: 0, // Explicitly 0 to ensure Level 1 (not NaN)
                avatar: generateAvatarUrl(seed),
                gender: 'male',
                activeMatch: null,
                banned: false,
                isGuest: true,
                isShadowAccount: isShadowAccount, 
                isVerified: false,
                createdAt: Date.now()
              });

              await updateProfile(user, { displayName: safeName });
              localStorage.setItem('is_guest_setup', 'true');
          } else {
              // Profile exists, ensure critical fields aren't missing (self-repair)
              const data = snapshot.val();
              if (!data.name || !data.username || typeof data.points !== 'number') {
                   const seed = generateRandomId();
                   await set(userRef, {
                       ...data,
                       name: data.name || `Guest ${seed}`,
                       username: data.username || `guest_${seed}`,
                       points: typeof data.points === 'number' ? data.points : 0
                   });
              }
              localStorage.setItem('is_guest_setup', 'true');
          }
          // App.tsx listener will handle redirection to Home
      } catch (e: any) {
          console.error("Profile creation failed", e);
          showAlert('Error', 'Failed to create guest profile data.', 'error');
          setLoading(false);
      }
  };

  const handleGuestSubmit = async () => {
      if (!guestName.trim()) { showToast("Enter your name", "error"); return; }
      if (!guestUsername.trim()) { showToast("Enter a username", "error"); return; }
      
      const cleanUser = guestUsername.toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (cleanUser.length < 3) { showToast("Username too short", "error"); return; }
      
      // Check username existence
      const taken = await checkUsernameExists(cleanUser);
      if (taken) { showToast("Username taken", "error"); return; }

      setShowGuestModal(false);
      // Pass confirmed values
      performGuestLogin(guestName.trim(), cleanUser);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    playSound('click');

    try {
      if (view === 'login') {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        // Ban check handled in App.tsx
      } else {
        // Registration Validation
        if (!name.trim()) throw { code: 'custom/missing-name' };
        if (!username.trim()) throw { code: 'custom/missing-username' };
        
        const cleanUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (cleanUsername.length < 3) throw { code: 'custom/short-username' };
        
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
          points: 0, // Default to 0 for Level 1
          avatar: generateAvatarUrl(seed),
          gender: gender,
          activeMatch: null,
          banned: false,
          isVerified: false,
          createdAt: Date.now()
        });
        
        await updateProfile(user, { displayName: name.trim() });
        sessionStorage.setItem('showAvatarSelection', 'true');
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
    <div className="min-h-screen w-full flex flex-col justify-center items-center p-4 relative overflow-hidden bg-orange-50 dark:bg-slate-900 transition-colors">
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-game-primary/20 rounded-full blur-[120px] animate-blob"></div>
        <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-red-500/20 rounded-full blur-[120px] animate-blob animation-delay-2000"></div>
        <div className="absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(rgba(251, 146, 60, 0.3) 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-md">
         
         {/* Branding */}
         <div className={`text-center mb-8 transition-all duration-500 ${view !== 'welcome' ? 'scale-75 mb-4' : ''}`}>
             <div className="w-24 h-24 mx-auto mb-4 relative group">
                <div className="absolute inset-0 bg-gradient-to-tr from-game-primary to-red-500 rounded-3xl rotate-6 blur-lg opacity-60 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative w-full h-full bg-white dark:bg-slate-800 rounded-3xl border border-white/50 dark:border-slate-600 flex items-center justify-center shadow-xl overflow-hidden">
                    <img src="https://files.catbox.moe/qn40s6.png" className="w-20 h-20 object-contain" alt="Logo" />
                </div>
             </div>
             <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
                LP-<span className="text-transparent bg-clip-text bg-gradient-to-r from-game-primary to-red-500">F4</span>
             </h1>
             <p className="text-slate-500 dark:text-slate-400 font-bold tracking-widest text-xs uppercase mt-2">Quiz competition for class F4</p>
         </div>

         {/* VIEW: WELCOME (GUEST FIRST) */}
         {view === 'welcome' && (
             <div className="animate__animated animate__fadeInUp">
                 <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-8 rounded-[2.5rem] shadow-2xl text-center">
                     <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-2">Ready to Play?</h2>
                     <p className="text-slate-500 dark:text-slate-400 text-sm font-bold mb-8">Join the stage to compete with F4 students.</p>
                     
                     <Button 
                        fullWidth 
                        size="lg" 
                        onClick={handleGuestClick} 
                        isLoading={loading}
                        className="py-5 text-xl shadow-lg shadow-orange-500/30 mb-8 relative overflow-hidden group"
                     >
                        <span className="relative z-10 flex items-center justify-center gap-3">
                            <i className="fas fa-gamepad text-2xl"></i> Play as Guest
                        </span>
                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-12"></div>
                     </Button>

                     <div className="relative mb-8">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t-2 border-slate-200 dark:border-slate-700"></div></div>
                        <div className="relative flex justify-center text-xs font-black uppercase tracking-widest"><span className="px-4 bg-white/0 backdrop-blur-md text-slate-400 dark:text-slate-500">Or Login</span></div>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={() => setView('login')}
                            className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-200 dark:border-slate-700 hover:border-game-primary dark:hover:border-game-primary hover:bg-white dark:hover:bg-slate-800 transition-all group"
                        >
                            <i className="fas fa-sign-in-alt text-xl mb-2 text-slate-400 group-hover:text-game-primary transition-colors"></i>
                            <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Login</span>
                        </button>
                        <button 
                            onClick={() => setView('register')}
                            className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border-2 border-slate-200 dark:border-slate-700 hover:border-game-accent dark:hover:border-game-accent hover:bg-white dark:hover:bg-slate-800 transition-all group"
                        >
                            <i className="fas fa-user-plus text-xl mb-2 text-slate-400 group-hover:text-game-accent transition-colors"></i>
                            <span className="font-bold text-slate-600 dark:text-slate-300 text-sm">Register</span>
                        </button>
                     </div>
                 </div>
                 <p className="text-center mt-6 text-xs text-slate-400 font-bold opacity-60">Made with ❤️ by LP</p>
             </div>
         )}

         {/* VIEW: LOGIN & REGISTER FORMS */}
         {view !== 'welcome' && (
             <div className="animate__animated animate__fadeInUp">
                 <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-8 rounded-[2.5rem] shadow-2xl relative">
                     <button 
                        onClick={() => setView('welcome')}
                        className="absolute top-6 left-6 w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
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
                                />
                                <Input 
                                    icon="fa-at" 
                                    placeholder="Username" 
                                    value={username} 
                                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} 
                                    required 
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
                                            className="w-full bg-slate-100 dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-600 rounded-xl py-4 pl-12 pr-10 text-slate-900 dark:text-white font-bold appearance-none focus:border-game-primary focus:outline-none transition-all cursor-pointer"
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
                        />

                        <Input 
                            type="password" 
                            icon="fa-lock" 
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />

                        <div className="pt-4">
                            <Button 
                                type="submit" 
                                fullWidth 
                                size="lg" 
                                isLoading={loading}
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
                                 onClick={() => setView(view === 'login' ? 'register' : 'login')}
                                 className="ml-2 text-game-primary hover:underline focus:outline-none transition-colors"
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
                 <p className="text-sm text-slate-500 text-center mb-4">Set up your profile to start playing.</p>
                 <Input 
                    icon="fa-user" 
                    placeholder="Full Name" 
                    value={guestName} 
                    onChange={e => setGuestName(e.target.value)} 
                    autoFocus
                 />
                 <Input 
                    icon="fa-at" 
                    placeholder="Username" 
                    value={guestUsername} 
                    onChange={e => setGuestUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} 
                 />
                 <Button fullWidth onClick={handleGuestSubmit} isLoading={loading} className="mt-2">
                     Let's Go!
                 </Button>
             </div>
         </Modal>

      </div>
    </div>
  );
};

export default AuthPage;