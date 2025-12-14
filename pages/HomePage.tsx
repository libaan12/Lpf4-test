import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, update } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../App';
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
    <div className="min-h-full flex flex-col pb-6">
      {/* Header */}
      <header className="bg-gradient-to-r from-somali-blue to-blue-600 dark:from-gray-800 dark:to-gray-900 p-4 rounded-b-3xl shadow-lg relative z-10">
        <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
            <div>
                <h1 className="text-white text-2xl font-bold">Hello, {profile?.name}!</h1>
                <p className="text-blue-100 text-sm font-medium">Ready to learn?</p>
            </div>
            <div onClick={() => handleNav('/profile')}>
                <Avatar src={profile?.avatar} seed={profile?.uid || 'guest'} size="sm" className="cursor-pointer border-2 border-white hover:border-blue-200 transition-colors" />
            </div>
            </div>
            
            {/* Stats Summary */}
            <div className="flex gap-4">
            <div className="bg-white/10 p-4 rounded-xl flex-1 text-white backdrop-blur-sm border border-white/20">
                <div className="text-xs opacity-80 font-bold uppercase tracking-wider">Level</div>
                <div className="text-3xl font-extrabold">{level}</div>
            </div>
            <div className="bg-white/10 p-4 rounded-xl flex-1 text-white backdrop-blur-sm border border-white/20">
                <div className="text-xs opacity-80 font-bold uppercase tracking-wider">Points</div>
                <div className="text-3xl font-extrabold">{profile?.points || 0}</div>
            </div>
            </div>
        </div>
      </header>

      {/* Main Menu */}
      <main className="flex-1 p-4 space-y-4 -mt-2 max-w-4xl mx-auto w-full">
        
        {/* Admin Button */}
        {profile?.role === 'admin' && (
          <Card className="!bg-gray-800 text-white transform hover:scale-[1.02] transition-transform cursor-pointer shadow-lg border-none">
             <div onClick={() => handleNav('/admin')} className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-gray-700 flex items-center justify-center text-gray-300">
                  <i className="fas fa-cogs text-2xl"></i>
                </div>
                <div>
                  <h3 className="font-bold text-lg">Admin Panel</h3>
                  <p className="text-gray-400 text-sm">Manage Quizzes</p>
                </div>
             </div>
          </Card>
        )}

        <Card className="group transform hover:scale-[1.02] transition-transform cursor-pointer shadow-md hover:shadow-lg border-l-4 border-yellow-400">
          <div onClick={() => handleNav('/lobby')} className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
              <i className="fas fa-bolt text-2xl group-hover:scale-110 transition-transform"></i>
            </div>
            <div>
              <h3 className="font-bold text-lg dark:text-white">Battle Mode</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Play against real students</p>
            </div>
          </div>
        </Card>

        <Card className="group transform hover:scale-[1.02] transition-transform cursor-pointer shadow-md hover:shadow-lg border-l-4 border-green-400">
          <div onClick={() => handleNav('/solo')} className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-green-100 dark:bg-green-900/50 flex items-center justify-center text-green-600 dark:text-green-400">
              <i className="fas fa-brain text-2xl group-hover:scale-110 transition-transform"></i>
            </div>
            <div>
              <h3 className="font-bold text-lg dark:text-white">Solo Training</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Practice without pressure</p>
            </div>
          </div>
        </Card>

        <Card className="group transform hover:scale-[1.02] transition-transform cursor-pointer shadow-md hover:shadow-lg border-l-4 border-purple-400">
          <div onClick={() => handleNav('/leaderboard')} className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <i className="fas fa-trophy text-2xl group-hover:scale-110 transition-transform"></i>
            </div>
            <div>
              <h3 className="font-bold text-lg dark:text-white">Leaderboard</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">See top players</p>
            </div>
          </div>
        </Card>
      </main>

      {/* Avatar Selection Modal for New Users */}
      <Modal isOpen={showAvatarModal} title="Choose Your Look" onClose={() => setShowAvatarModal(false)}>
          <div className="text-center mb-4 text-gray-500 dark:text-gray-400 text-sm">
              Welcome! Pick an avatar to get started. You can change this later in your profile.
          </div>
          <div className="grid grid-cols-3 gap-4">
              {avatarSeeds.map((seed, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => handleAvatarSelect(seed)}
                    className="aspect-square rounded-full overflow-hidden border-2 border-transparent hover:border-somali-blue cursor-pointer transition-all hover:scale-110 bg-gray-100 dark:bg-gray-700"
                  >
                      <img src={generateAvatarUrl(seed)} alt="avatar" className="w-full h-full object-cover" />
                  </div>
              ))}
          </div>
          <Button fullWidth variant="secondary" className="mt-6" onClick={refreshAvatars}>
             <i className="fas fa-sync mr-2"></i> Show More Options
          </Button>
      </Modal>
    </div>
  );
};

export default HomePage;