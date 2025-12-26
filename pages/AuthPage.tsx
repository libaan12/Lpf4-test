import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, signOut } from 'firebase/auth';
import { ref, set, get } from 'firebase/database';
import { auth, db } from '../firebase';
import { playSound } from '../services/audioService';
import { generateAvatarUrl } from '../constants';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '../components/UI';
import { showAlert } from '../services/alert';

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [loading, setLoading] = useState(false);

  const getErrorMessage = (code: string) => {
    switch (code) {
        case 'auth/invalid-credential': 
        case 'auth/user-not-found':
        case 'auth/wrong-password':
            return 'Incorrect email or password.';
        case 'auth/email-already-in-use': 
            return 'This email is already registered. Please login.';
        case 'auth/weak-password': 
            return 'Password should be at least 6 characters.';
        case 'auth/invalid-email': 
            return 'Please enter a valid email address.';
        case 'auth/too-many-requests': 
            return 'Too many attempts. Please try again later.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your connection.';
        default: 
            return 'An error occurred. Please try again.';
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    playSound('click');

    try {
      if (isLogin) {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        // Check if banned
        const userRef = ref(db, `users/${userCred.user.uid}`);
        const snapshot = await get(userRef);
        if (snapshot.exists()) {
            const userData = snapshot.val();
            if (userData.banned) {
                await signOut(auth);
                throw { code: 'custom/banned' };
            }
        }
      } else {
        if (!name.trim()) {
            throw { code: 'custom/missing-name' };
        }
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCred.user;
        const seed = Math.random().toString(36).substring(7);
        
        // Generate random avatar
        const avatarUrl = generateAvatarUrl(seed);
        
        // Initial Profile with Gender
        await set(ref(db, `users/${user.uid}`), {
          name: name || 'Student',
          email: user.email,
          points: 0,
          avatar: avatarUrl,
          gender: gender,
          activeMatch: null,
          banned: false
        });
        
        await updateProfile(user, { displayName: name });
        
        // Flag for HomePage to show avatar selection modal
        sessionStorage.setItem('showAvatarSelection', 'true');
      }
    } catch (err: any) {
      console.error(err.code);
      let msg = getErrorMessage(err.code || '');
      if (err.code === 'custom/missing-name') msg = 'Please enter your name.';
      if (err.code === 'custom/banned') msg = 'Your account has been suspended by an administrator.';
      
      showAlert('Authentication Error', msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
      setIsLogin(!isLogin);
      playSound('click');
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center p-4 relative overflow-hidden bg-gray-50 dark:bg-slate-900 transition-colors">
      {/* Dynamic Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-game-primary/30 rounded-full blur-[100px] animate-blob"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-purple-500/30 rounded-full blur-[100px] animate-blob animation-delay-2000"></div>
        <div className="absolute top-[20%] left-[20%] w-[40%] h-[40%] bg-game-accent/20 rounded-full blur-[80px] animate-blob animation-delay-4000"></div>
        {/* Grid Overlay */}
        <div className="absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(rgba(148, 163, 184, 0.3) 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
      </div>

      {/* Logo / Header */}
      <div className="relative z-10 text-center mb-8 animate__animated animate__fadeInDown">
         <div className="w-24 h-24 mx-auto mb-4 relative group cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-tr from-game-primary to-purple-500 rounded-3xl rotate-6 blur-lg opacity-60 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative w-full h-full bg-white dark:bg-slate-800 rounded-3xl border border-white/50 dark:border-slate-600 flex items-center justify-center shadow-xl overflow-hidden group-hover:-translate-y-2 transition-transform duration-300">
                <img src="https://files.catbox.moe/qn40s6.png" className="w-20 h-20 object-contain drop-shadow-sm" alt="Logo" />
            </div>
         </div>
         <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
            LP-<span className="text-transparent bg-clip-text bg-gradient-to-r from-game-primary to-purple-500">F4</span>
         </h1>
         <p className="text-slate-500 dark:text-slate-400 font-bold tracking-widest text-xs uppercase">Battle quiz for F4 students.</p>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-md relative z-10 animate__animated animate__fadeInUp">
         {/* Glass Container */}
         <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/60 dark:border-slate-700/60 p-8 rounded-[2.5rem] shadow-2xl">
            
            <div className="text-center mb-8">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">{isLogin ? 'Sign in to continue your progress.' : 'Join the community of learners.'}</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
                {!isLogin && (
                    <div className="animate__animated animate__fadeIn space-y-4">
                        <Input 
                            icon="fa-user" 
                            placeholder="Player Name" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            required 
                        />

                        {/* Custom Styled Select for Gender */}
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

                <div className="pt-2">
                    <Button 
                        type="submit" 
                        fullWidth 
                        size="lg" 
                        isLoading={loading}
                        className="shadow-xl"
                    >
                        {isLogin ? 'Login' : 'Register'}
                    </Button>
                </div>
            </form>
            
            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700 text-center">
                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button 
                        onClick={toggleMode}
                        className="ml-2 text-game-primary font-bold hover:underline focus:outline-none transition-colors"
                    >
                        {isLogin ? 'Create Account' : 'Login'}
                    </button>
                </p>
            </div>
         </div>
         
         <div className="text-center mt-6">
            <p className="text-slate-400 dark:text-slate-600 text-xs font-medium">
                Protected by ReCaptcha. <span className="hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer transition-colors">Privacy</span> & <span className="hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer transition-colors">Terms</span>
            </p>
         </div>
      </div>
    </div>
  );
};

export default AuthPage;