import React, { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { ref, set } from 'firebase/database';
import { auth, db } from '../firebase';
import { Button, Input, Card } from '../components/UI';
import { playSound } from '../services/audioService';

const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        
        // Initial Profile
        await set(ref(db, `users/${user.uid}`), {
          name: name || 'Student',
          email: user.email,
          points: 0,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`,
          activeMatch: null
        });
        
        await updateProfile(user, { displayName: name });
      }
    } catch (err: any) {
      setError(err.message.replace('Firebase:', '').trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col justify-center p-6 bg-somali-blue min-h-screen">
      <div className="text-center mb-8 animate__animated animate__fadeInDown">
        <h1 className="text-4xl font-extrabold text-white mb-2">LP-F4</h1>
        <p className="text-blue-100">Tartanka Aqoonta (Quiz Battle)</p>
      </div>

      <Card className="animate__animated animate__fadeInUp">
        <h2 className="text-2xl font-bold text-center mb-6">{isLogin ? 'Welcome Back' : 'Join the Battle'}</h2>
        
        {error && <div className="bg-red-100 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}

        <form onSubmit={handleAuth}>
          {!isLogin && (
            <Input 
              placeholder="Your Name" 
              icon="fa-user" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
            />
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

          <Button type="submit" fullWidth isLoading={loading} className="mt-2">
            {isLogin ? 'Login' : 'Start Journey'}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-500 text-sm">
            {isLogin ? "Don't have an account?" : "Already playing?"}
            <button 
              onClick={() => setIsLogin(!isLogin)} 
              className="ml-2 text-somali-blue font-bold hover:underline"
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
