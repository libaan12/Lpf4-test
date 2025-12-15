import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { auth, db } from '../firebase';
import { Button, Input, Card } from '../components/UI';
import { playSound } from '../services/audioService';
import { generateAvatarUrl } from '../constants';
import { useNavigate } from 'react-router-dom';

const AuthPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male'); // Gender state
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
        
        // Generate random avatar (gender neutral logic as requested, gender stored separately)
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

  return (
    <div className="h-full flex flex-col justify-center p-6 min-h-screen relative overflow-hidden">
      {/* Dynamic Header */}
      <div className="text-center mb-8 animate__animated animate__fadeInDown relative z-10">
        <div className="relative inline-block mb-4">
             <div className="absolute inset-0 bg-white/30 rounded-full blur-xl transform scale-150"></div>
             <img src="https://files.catbox.moe/qn40s6.png" className="w-28 h-28 relative z-10 drop-shadow-2xl hover:scale-105 transition-transform duration-500" />
        </div>
        <h1 className="text-5xl font-black text-white mb-2 drop-shadow-sm tracking-tight">LP-F4</h1>
        <p className="text-blue-100 font-bold tracking-widest text-sm uppercase bg-white/10 inline-block px-4 py-1 rounded-full backdrop-blur-sm border border-white/20">Tartanka Aqoonta</p>
      </div>

      <Card className="animate__animated animate__fadeInUp border-none !bg-white/80 dark:!bg-black/60 shadow-2xl backdrop-blur-2xl relative z-10">
        <h2 className="text-3xl font-extrabold text-center mb-6 text-gray-800 dark:text-white tracking-tight">{isLogin ? 'Welcome Back' : 'Join the Battle'}</h2>
        
        {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 px-4 py-3 rounded-2xl mb-6 text-sm font-bold flex items-center gap-3 animate__animated animate__shakeX backdrop-blur-md">
                <i className="fas fa-exclamation-circle text-xl"></i>
                <span>{error}</span>
            </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {!isLogin && (
            <>
              <Input 
                placeholder="Your Name" 
                icon="fa-user" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                required 
              />
              {/* Gender Selection */}
              <div className="flex gap-4 mb-2">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={`flex-1 py-3 rounded-2xl font-bold border transition-all flex items-center justify-center gap-2 relative overflow-hidden ${gender === 'male' ? 'bg-blue-500 text-white border-transparent shadow-lg shadow-blue-500/30' : 'bg-white/50 dark:bg-black/20 text-gray-500 border-white/30 dark:border-white/10 hover:bg-white/80'}`}
                  >
                    <i className="fas fa-mars"></i> Male
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={`flex-1 py-3 rounded-2xl font-bold border transition-all flex items-center justify-center gap-2 relative overflow-hidden ${gender === 'female' ? 'bg-pink-500 text-white border-transparent shadow-lg shadow-pink-500/30' : 'bg-white/50 dark:bg-black/20 text-gray-500 border-white/30 dark:border-white/10 hover:bg-white/80'}`}
                  >
                    <i className="fas fa-venus"></i> Female
                  </button>
              </div>
            </>
          )}
          <Input 
            type="email" 
            placeholder="Email Address" 
            icon="fa-envelope" 
            value={email} 
            onChange={e => setEmail(e.target.value)} 
            required 
          />
          <Input 
            type="password" 
            placeholder="Password" 
            icon="fa-lock" 
            value={password} 
            onChange={e => setPassword(e.target.value)} 
            required 
          />

          <Button type="submit" fullWidth isLoading={loading} className="mt-4 font-extrabold shadow-xl py-4 text-lg">
            {isLogin ? 'Login' : 'Start Journey'}
          </Button>
        </form>

        <div className="mt-8 text-center space-y-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">
            {isLogin ? "Don't have an account?" : "Already playing?"}
            <button 
              onClick={() => setIsLogin(!isLogin)} 
              className="ml-2 text-somali-blue dark:text-blue-400 font-extrabold hover:underline"
            >
              {isLogin ? 'Register' : 'Login'}
            </button>
          </p>
        </div>
      </Card>
      
      <div className="mt-8 text-center text-white/40 text-xs font-medium">
          &copy; 2024 LP-F4 Team
      </div>
    </div>
  );
};

export default AuthPage;