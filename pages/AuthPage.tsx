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
    <div className="h-full flex flex-col justify-center p-6 min-h-screen relative bg-gradient-to-br from-somali-blue to-blue-900">
      <div className="text-center mb-8 animate__animated animate__fadeInDown">
        <img src="https://files.catbox.moe/qn40s6.png" className="w-24 h-24 mx-auto mb-4 drop-shadow-md" />
        <h1 className="text-4xl font-extrabold text-white mb-2">LP-F4</h1>
        <p className="text-blue-100 font-medium tracking-wide">Tartanka Aqoonta</p>
      </div>

      <Card className="animate__animated animate__fadeInUp shadow-2xl border-none">
        <h2 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-white">{isLogin ? 'Welcome Back' : 'Join the Battle'}</h2>
        
        {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl mb-4 text-sm font-medium flex items-center gap-2 animate__animated animate__shakeX">
                <i className="fas fa-exclamation-circle text-lg"></i>
                <span>{error}</span>
            </div>
        )}

        <form onSubmit={handleAuth}>
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
              <div className="flex gap-4 mb-4">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all flex items-center justify-center gap-2 ${gender === 'male' ? 'border-somali-blue bg-blue-50 text-somali-blue dark:bg-blue-900/20 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'}`}
                  >
                    <i className="fas fa-mars"></i> Male
                  </button>
                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={`flex-1 py-3 rounded-xl font-bold border-2 transition-all flex items-center justify-center gap-2 ${gender === 'female' ? 'border-pink-500 bg-pink-50 text-pink-500 dark:bg-pink-900/20 dark:text-pink-300' : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500'}`}
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

          <Button type="submit" fullWidth isLoading={loading} className="mt-4 font-extrabold shadow-lg">
            {isLogin ? 'Login' : 'Start Journey'}
          </Button>
        </form>

        <div className="mt-6 text-center space-y-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {isLogin ? "Don't have an account?" : "Already playing?"}
            <button 
              onClick={() => setIsLogin(!isLogin)} 
              className="ml-2 text-somali-blue dark:text-blue-400 font-bold hover:underline"
            >
              {isLogin ? 'Register' : 'Login'}
            </button>
          </p>
        </div>
      </Card>
    </div>
  );
};

export default AuthPage;