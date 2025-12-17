import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { auth, db } from '../firebase';
import { playSound } from '../services/audioService';
import { generateAvatarUrl } from '../constants';
import { useNavigate } from 'react-router-dom';

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
    setError('');
    playSound('click');

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
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
          activeMatch: null
        });
        
        await updateProfile(user, { displayName: name });
        
        // Flag for HomePage to show avatar selection modal
        sessionStorage.setItem('showAvatarSelection', 'true');
      }
    } catch (err: any) {
      console.error(err.code);
      setError(getErrorMessage(err.code || ''));
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
      setIsLogin(!isLogin);
      playSound('click');
      setError('');
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center p-4 relative overflow-hidden bg-gray-50">
      {/* Light Theme Background Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-blue-200/50 rounded-full blur-[100px] animate-blob"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-purple-200/50 rounded-full blur-[100px] animate-blob animation-delay-2000"></div>
        <div className="absolute top-[20%] left-[20%] w-[40%] h-[40%] bg-indigo-200/30 rounded-full blur-[80px] animate-blob animation-delay-4000"></div>
        {/* Grid Overlay */}
        <div className="absolute inset-0 opacity-[0.4]" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
      </div>

      {/* Logo / Header */}
      <div className="relative z-10 text-center mb-8 animate__animated animate__fadeInDown">
         <div className="w-24 h-24 mx-auto mb-4 relative group cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-tr from-blue-400 to-purple-400 rounded-3xl rotate-6 blur-lg opacity-60 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative w-full h-full bg-white rounded-3xl border border-white/50 flex items-center justify-center shadow-xl overflow-hidden group-hover:-translate-y-2 transition-transform duration-300">
                <img src="https://files.catbox.moe/qn40s6.png" className="w-20 h-20 object-contain drop-shadow-sm" alt="Logo" />
            </div>
         </div>
         <h1 className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight mb-2">
            LP-<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">F4</span>
         </h1>
         <p className="text-gray-500 font-bold tracking-widest text-xs uppercase">Somali Student Battle Arena</p>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-md relative z-10 animate__animated animate__fadeInUp">
         {/* Glass Container */}
         <div className="bg-white/80 backdrop-blur-xl border border-white p-8 rounded-[2.5rem] shadow-2xl">
            
            <div className="text-center mb-8">
                <h2 className="text-2xl font-black text-gray-900 mb-2 tracking-tight">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                <p className="text-gray-500 text-sm font-medium">{isLogin ? 'Sign in to continue your progress.' : 'Join the community of learners.'}</p>
            </div>

            {error && (
                <div className="mb-6 bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-3">
                    <i className="fas fa-exclamation-circle text-red-500 mt-0.5"></i>
                    <span className="text-xs font-bold text-red-600 leading-relaxed text-left">{error}</span>
                </div>
            )}

            <form onSubmit={handleAuth} className="space-y-5">
                {!isLogin && (
                    <div className="animate__animated animate__fadeIn space-y-5">
                             {/* Name Input */}
                             <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <i className="fas fa-user text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Player Name"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 pl-12 pr-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-sm"
                                    required
                                />
                             </div>

                             {/* Gender Dropdown */}
                             <div>
                                <label className="block text-gray-500 text-[10px] font-bold uppercase tracking-widest mb-2 ml-2">what is your gender?</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <i className={`fas ${gender === 'male' ? 'fa-mars' : 'fa-venus'} text-gray-400 group-focus-within:text-blue-500 transition-colors`}></i>
                                    </div>
                                    <select
                                        value={gender}
                                        onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 pl-12 pr-10 text-gray-900 appearance-none focus:outline-none focus:bg-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-sm cursor-pointer"
                                    >
                                        <option value="male">Male</option>
                                        <option value="female">Female</option>
                                    </select>
                                    <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                                        <i className="fas fa-chevron-down text-gray-400 text-xs"></i>
                                    </div>
                                </div>
                             </div>
                    </div>
                )}

                {/* Email */}
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <i className="fas fa-envelope text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                    </div>
                    <input
                        type="email"
                        placeholder="Email Address"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 pl-12 pr-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-sm"
                        required
                    />
                </div>

                {/* Password */}
                <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <i className="fas fa-lock text-gray-400 group-focus-within:text-blue-500 transition-colors"></i>
                    </div>
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-4 pl-12 pr-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:bg-white focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all font-bold text-sm"
                        required
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm text-white shadow-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-500/30 transition-all transform active:scale-95 hover:-translate-y-1 relative overflow-hidden disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    {loading && <i className="fas fa-spinner fa-spin mr-2"></i>}
                    {isLogin ? 'Login' : 'Register'}
                </button>
            </form>
            
            <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                <p className="text-gray-500 text-sm font-medium">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button 
                        onClick={toggleMode}
                        className="ml-2 text-blue-600 font-bold hover:underline focus:outline-none transition-colors"
                    >
                        {isLogin ? 'Create Account' : 'Login'}
                    </button>
                </p>
            </div>
         </div>
         
         <div className="text-center mt-6">
            <p className="text-gray-400 text-xs font-medium">
                Protected by ReCaptcha. <span className="hover:text-gray-600 cursor-pointer transition-colors">Privacy</span> & <span className="hover:text-gray-600 cursor-pointer transition-colors">Terms</span>
            </p>
         </div>
      </div>
    </div>
  );
};

export default AuthPage;