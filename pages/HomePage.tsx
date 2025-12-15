import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, update } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { Avatar, Card, Modal, Button } from '../components/UI';
import { playSound } from '../services/audioService';
import { generateAvatarUrl } from '../constants';

const HomePage: React.FC = () => {
  const { profile, user } = useContext(UserContext);
  const navigate = useNavigate();

  // Avatar Selection State
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarSeeds, setAvatarSeeds] = useState<string[]>([]);

  // Check if new user needs to select avatar
  useEffect(() => {
    const isNew = sessionStorage.getItem('showAvatarSelection');
    if (isNew) {
      setShowAvatarModal(true);
      setAvatarSeeds(Array.from({length: 9}, () => Math.random().toString(36).substring(7)));
      sessionStorage.removeItem('showAvatarSelection');
    }
  }, []);

  const handleAvatarSelect = async (seed: string) => {
      if (!user) return;
      const url = generateAvatarUrl(seed);
      try {
        await update(ref(db, `users/${user.uid}`), { avatar: url });
        playSound('correct');
        setShowAvatarModal(false);
      } catch (e) {
        console.error("Error saving avatar", e);
      }
  };

  const refreshAvatars = () => {
      setAvatarSeeds(Array.from({length: 9}, () => Math.random().toString(36).substring(7)));
      playSound('click');
  };

  const handleNav = (path: string) => {
    playSound('click');
    navigate(path);
  };

  // Level Logic: 10 points per level
  const level = Math.floor((profile?.points || 0) / 10) + 1;

  return (
    <div className="min-h-full flex flex-col pb-24 md:pb-6">
      {/* Glass Header */}
      <header className="p-4 relative z-10">
        <div className="max-w-4xl mx-auto bg-white/10 dark:bg-black/20 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-3xl p-6 shadow-xl">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-white text-3xl font-black tracking-tight drop-shadow-md">Hello, {profile?.name}!</h1>
                    <p className="text-blue-100 text-sm font-bold opacity-80">Ready to conquer knowledge?</p>
                </div>
                <div onClick={() => handleNav('/profile')} className="relative group cursor-pointer">
                    <div className="absolute inset-0 bg-white/20 rounded-full blur-md group-hover:blur-lg transition-all"></div>
                    <Avatar src={profile?.avatar} seed={profile?.uid || 'guest'} size="md" className="relative border-2 border-white/50 shadow-lg group-hover:scale-105 transition-transform" />
                </div>
            </div>
            
            {/* Stats Summary */}
            <div className="flex gap-4">
                <div className="bg-gradient-to-br from-white/10 to-white/5 p-4 rounded-2xl flex-1 text-white backdrop-blur-md border border-white/10 shadow-inner">
                    <div className="text-[10px] opacity-70 font-bold uppercase tracking-widest mb-1">Level</div>
                    <div className="text-4xl font-black">{level}</div>
                </div>
                <div className="bg-gradient-to-br from-white/10 to-white/5 p-4 rounded-2xl flex-1 text-white backdrop-blur-md border border-white/10 shadow-inner">
                    <div className="text-[10px] opacity-70 font-bold uppercase tracking-widest mb-1">Points</div>
                    <div className="text-4xl font-black">{profile?.points || 0}</div>
                </div>
            </div>
        </div>
      </header>

      {/* Main Menu Grid */}
      <main className="flex-1 p-4 space-y-4 max-w-4xl mx-auto w-full">
        
        {/* Admin Button */}
        {profile?.role === 'admin' && (
          <div onClick={() => handleNav('/admin')} className="cursor-pointer group">
              <Card className="!bg-gray-900/80 text-white transform group-hover:scale-[1.02] transition-transform border-l-4 border-gray-500">
                 <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-gray-300 group-hover:rotate-90 transition-transform duration-500">
                      <i className="fas fa-cogs text-2xl"></i>
                    </div>
                    <div>
                      <h3 className="font-bold text-xl">Admin Panel</h3>
                      <p className="text-gray-400 text-sm font-medium">Manage Content</p>
                    </div>
                 </div>
              </Card>
          </div>
        )}

        <div onClick={() => handleNav('/lobby')} className="cursor-pointer group">
            <Card className="group-hover:scale-[1.02] transition-transform border-l-4 border-yellow-400 overflow-hidden relative">
              <div className="absolute right-0 top-0 w-32 h-32 bg-yellow-400/20 rounded-full blur-2xl -mr-10 -mt-10"></div>
              <div className="flex items-center gap-5 relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-yellow-100 dark:bg-yellow-500/20 flex items-center justify-center text-yellow-600 dark:text-yellow-400 shadow-sm">
                  <i className="fas fa-bolt text-3xl group-hover:scale-110 transition-transform"></i>
                </div>
                <div>
                  <h3 className="font-black text-2xl text-gray-800 dark:text-white">Battle Mode</h3>
                  <p className="text-gray-500 dark:text-gray-300 text-sm font-medium">Play against real students</p>
                </div>
              </div>
            </Card>
        </div>

        <div onClick={() => handleNav('/solo')} className="cursor-pointer group">
            <Card className="group-hover:scale-[1.02] transition-transform border-l-4 border-green-400 overflow-hidden relative">
              <div className="absolute right-0 top-0 w-32 h-32 bg-green-400/20 rounded-full blur-2xl -mr-10 -mt-10"></div>
              <div className="flex items-center gap-5 relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600 dark:text-green-400 shadow-sm">
                  <i className="fas fa-brain text-3xl group-hover:scale-110 transition-transform"></i>
                </div>
                <div>
                  <h3 className="font-black text-2xl text-gray-800 dark:text-white">Solo Training</h3>
                  <p className="text-gray-500 dark:text-gray-300 text-sm font-medium">Practice without pressure</p>
                </div>
              </div>
            </Card>
        </div>

        <div onClick={() => handleNav('/leaderboard')} className="cursor-pointer group">
            <Card className="group-hover:scale-[1.02] transition-transform border-l-4 border-purple-400 overflow-hidden relative">
               <div className="absolute right-0 top-0 w-32 h-32 bg-purple-400/20 rounded-full blur-2xl -mr-10 -mt-10"></div>
               <div className="flex items-center gap-5 relative z-10">
                <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-sm">
                  <i className="fas fa-trophy text-3xl group-hover:scale-110 transition-transform"></i>
                </div>
                <div>
                  <h3 className="font-black text-2xl text-gray-800 dark:text-white">Leaderboard</h3>
                  <p className="text-gray-500 dark:text-gray-300 text-sm font-medium">See top players</p>
                </div>
              </div>
            </Card>
        </div>
      </main>

      {/* Avatar Selection Modal for New Users */}
      <Modal isOpen={showAvatarModal} title="Choose Your Look" onClose={() => setShowAvatarModal(false)}>
          <div className="text-center mb-6 text-gray-600 dark:text-gray-300 text-sm font-medium">
              Welcome! Pick an avatar to get started. You can change this later in your profile.
          </div>
          <div className="grid grid-cols-3 gap-4">
              {avatarSeeds.map((seed, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => handleAvatarSelect(seed)}
                    className="aspect-square rounded-full overflow-hidden border-2 border-transparent hover:border-somali-blue cursor-pointer transition-all hover:scale-110 bg-white dark:bg-white/10 shadow-sm"
                  >
                      <img src={generateAvatarUrl(seed)} alt="avatar" className="w-full h-full object-cover" />
                  </div>
              ))}
          </div>
          <Button fullWidth variant="secondary" className="mt-8" onClick={refreshAvatars}>
             <i className="fas fa-sync mr-2"></i> Show More Options
          </Button>
      </Modal>
    </div>
  );
};

export default HomePage;