
import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, update } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { Avatar, Card, Modal, Button } from '../components/UI';
import { playSound } from '../services/audioService';
import { generateAvatarUrl } from '../constants';
import { showToast } from '../services/alert';

const HomePage: React.FC = () => {
  const { profile, user } = useContext(UserContext);
  const navigate = useNavigate();

  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarSeeds, setAvatarSeeds] = useState<string[]>([]);

  useEffect(() => {
    // Prompt to change avatar if not updated yet (Once per user lifetime)
    if (profile && !profile.avatarUpdated) {
      setShowAvatarModal(true);
      setAvatarSeeds(Array.from({length: 9}, () => Math.random().toString(36).substring(7)));
    }
  }, [profile]);

  const handleAvatarSelect = async (seed: string) => {
      if (!user) return;
      const url = generateAvatarUrl(seed);
      try {
        await update(ref(db, `users/${user.uid}`), { 
            avatar: url,
            avatarUpdated: true 
        });
        playSound('correct');
        setShowAvatarModal(false);
        showToast("Avatar Updated!", "success");
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

  const level = Math.floor((profile?.points || 0) / 10) + 1;
  const nextLevel = (level * 10);
  const progress = ((profile?.points || 0) % 10) / 10 * 100;

  return (
    <div className="min-h-full flex flex-col pb-28 md:pb-6 max-w-5xl mx-auto w-full px-4 pt-28">
      {/* Fixed Header Stat Bar */}
      <div className="fixed top-0 left-0 right-0 z-40 bg-gradient-to-r from-orange-50/95 to-white/95 dark:from-slate-900/95 dark:to-slate-800/95 backdrop-blur-xl border-b border-orange-200/50 dark:border-slate-700/50 shadow-sm transition-colors duration-300">
         <div className="max-w-5xl mx-auto w-full px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
                <div onClick={() => handleNav('/profile')} className="relative cursor-pointer group">
                    <div className="absolute inset-0 bg-white rounded-full blur opacity-50 group-hover:opacity-100 transition-opacity"></div>
                    <Avatar src={profile?.avatar} seed={profile?.uid} size="md" className="border-4 border-white dark:border-slate-700 shadow-lg" isVerified={profile?.isVerified} isSupport={profile?.isSupport} />
                    <div className="absolute -bottom-1 -right-1 bg-game-primary text-white text-[10px] font-black px-2 py-0.5 rounded-full border-2 border-white dark:border-slate-700">
                        LVL {level}
                    </div>
                </div>
                <div>
                    <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white leading-none mb-1 flex items-center gap-2">
                        Hi, {profile?.name}
                        {profile?.isVerified && <i className="fas fa-check-circle text-blue-500 text-sm"></i>}
                        {profile?.isSupport && <i className="fas fa-check-circle text-game-primary text-sm"></i>}
                    </h1>
                    <div className="w-28 md:w-32 h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden border border-slate-300 dark:border-slate-600 relative">
                        <div className="h-full bg-game-success rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]" style={{ width: `${progress}%` }}></div>
                        <span className="absolute inset-0 text-[8px] font-bold flex items-center justify-center text-slate-600 dark:text-slate-300 mix-blend-difference">
                            {profile?.points} / {nextLevel} PTS
                        </span>
                    </div>
                </div>
            </div>
            
            {/* Currency / Admin Icon */}
            <div className="flex gap-2">
                {profile?.role === 'admin' && (
                    <button onClick={() => handleNav('/admin')} className="w-12 h-12 rounded-2xl bg-slate-800 text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
                        <i className="fas fa-cogs"></i>
                    </button>
                )}
                <div className="px-4 py-2 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border-2 border-slate-100 dark:border-slate-700 flex items-center gap-2">
                    <i className="fas fa-star text-game-accent text-xl animate-pulse-fast"></i>
                    <span className="font-black text-lg text-slate-800 dark:text-white">{profile?.points}</span>
                </div>
            </div>
         </div>
      </div>

      {/* Hero / Featured Mode - REDUCED SIZE FOR MOBILE */}
      <div className="mb-6 cursor-pointer group" onClick={() => handleNav('/lobby')}>
          <div className="relative overflow-hidden rounded-[1.8rem] bg-gradient-to-br from-game-primary via-orange-600 to-red-600 p-1 shadow-2xl shadow-orange-500/30 transition-transform group-hover:scale-[1.01]">
              <div className="bg-white/5 dark:bg-black/20 rounded-[1.6rem] p-4 md:p-6 relative overflow-hidden backdrop-blur-sm h-[160px] md:h-auto flex items-center">
                  {/* Decorative Background Elements */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full -mr-16 -mt-16 blur-3xl animate-pulse"></div>
                  <div className="absolute bottom-0 left-0 w-48 h-48 bg-red-500 opacity-20 rounded-full -ml-10 -mb-10 blur-3xl"></div>
                  <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>

                  <div className="relative z-10 flex flex-row items-center justify-between gap-4 w-full">
                      <div className="text-left flex-1 pl-2">
                          <div className="flex items-center justify-start gap-2 mb-2">
                              <span className="bg-white/20 text-white border border-white/50 text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-md">
                                  <i className="fas fa-fire mr-1 text-yellow-300"></i> Hot
                              </span>
                              <span className="bg-black/20 text-white border border-white/20 text-[9px] md:text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                  Multiplayer
                              </span>
                          </div>
                          {/* Changed Text and Reduced Size */}
                          <h2 className="text-2xl md:text-5xl font-black text-white mb-1 md:mb-2 italic tracking-tight drop-shadow-md leading-none">
                              BATTLE <br/> QUIZ
                          </h2>
                          <p className="text-orange-50 font-bold max-w-sm text-[10px] md:text-sm leading-relaxed mb-3 md:mb-4 hidden md:block">
                              Face off against real students in real-time PvP.
                          </p>
                          <button className="bg-white text-game-primary px-4 py-1.5 md:px-6 md:py-2 rounded-xl font-black uppercase tracking-widest shadow-lg hover:bg-orange-50 transition-colors transform group-hover:translate-y-[-2px] active:translate-y-[1px] text-[10px] md:text-sm mt-2 md:mt-0">
                              Play Now <i className="fas fa-arrow-right ml-2"></i>
                          </button>
                      </div>
                      
                      {/* Visual Graphic - Scaled Down */}
                      <div className="relative w-24 h-24 md:w-48 md:h-48 shrink-0 mr-2 md:mr-0">
                           <div className="absolute inset-0 bg-orange-500 rounded-full blur-[40px] opacity-40 animate-pulse"></div>
                           <div className="relative w-full h-full bg-gradient-to-tr from-white to-orange-100 rounded-full flex items-center justify-center shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] border-[3px] md:border-[5px] border-white/20">
                               <i className="fas fa-gamepad text-4xl md:text-7xl text-transparent bg-clip-text bg-gradient-to-br from-game-primary to-red-600 transform -rotate-12 group-hover:scale-110 transition-transform duration-500"></i>
                           </div>
                           
                           {/* Floating Badge */}
                           <div className="absolute -bottom-2 -right-2 bg-game-danger text-white w-8 h-8 md:w-12 md:h-12 rounded-full flex items-center justify-center font-black border-2 md:border-4 border-white/20 shadow-lg animate-bounce-slow text-[10px] md:text-xs">
                               VS
                           </div>
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {/* Secondary Modes Grid */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-4 md:gap-6">
          <div onClick={() => handleNav('/solo')} className="cursor-pointer group">
              <div className="h-36 md:h-40 rounded-[2rem] bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 p-4 md:p-5 flex flex-col justify-between shadow-lg hover:shadow-xl transition-all group-hover:-translate-y-1 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-[0.05] dark:opacity-[0.05]">
                       <i className="fas fa-brain text-7xl md:text-8xl transform rotate-12"></i>
                   </div>
                   <div className="w-8 h-8 md:w-10 md:h-10 rounded-2xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center text-lg md:text-xl mb-2 shadow-sm">
                       <i className="fas fa-dumbbell"></i>
                   </div>
                   <div>
                       <h3 className="text-base md:text-xl font-black text-slate-800 dark:text-white leading-tight">Practice</h3>
                       <p className="text-[10px] md:text-xs font-bold text-slate-400 dark:text-slate-500 mt-1">Solo Training</p>
                   </div>
                   <div className="absolute bottom-4 right-4 text-slate-300 dark:text-slate-600 group-hover:text-green-500 transition-colors">
                       <i className="fas fa-arrow-right"></i>
                   </div>
              </div>
          </div>

          <div onClick={() => handleNav('/leaderboard')} className="cursor-pointer group">
              <div className="h-36 md:h-40 rounded-[2rem] bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 p-4 md:p-5 flex flex-col justify-between shadow-lg hover:shadow-xl transition-all group-hover:-translate-y-1 relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-[0.05] dark:opacity-[0.05]">
                       <i className="fas fa-trophy text-7xl md:text-8xl transform -rotate-12"></i>
                   </div>
                   <div className="w-8 h-8 md:w-10 md:h-10 rounded-2xl bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-lg md:text-xl mb-2 shadow-sm">
                       <i className="fas fa-crown"></i>
                   </div>
                   <div>
                       <h3 className="text-base md:text-xl font-black text-slate-800 dark:text-white leading-tight">Rankings</h3>
                       <p className="text-[10px] md:text-xs font-bold text-slate-400 dark:text-slate-500 mt-1">Global Leaderboard</p>
                   </div>
                   <div className="absolute bottom-4 right-4 text-slate-300 dark:text-slate-600 group-hover:text-amber-500 transition-colors">
                       <i className="fas fa-arrow-right"></i>
                   </div>
              </div>
          </div>
      </div>

      {/* Avatar Modal */}
      <Modal isOpen={showAvatarModal} title="Choose Your Look" onClose={() => { /* Prevent closing without selection */ }}>
          <div className="text-center mb-4 text-gray-500 dark:text-gray-400 text-sm">
              Select an avatar to continue. You can change this later in your profile.
          </div>
          <div className="grid grid-cols-3 gap-4">
              {avatarSeeds.map((seed, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => handleAvatarSelect(seed)}
                    className="aspect-square rounded-full overflow-hidden border-4 border-transparent hover:border-game-primary cursor-pointer transition-all hover:scale-105 bg-slate-100 dark:bg-slate-700"
                  >
                      <img src={generateAvatarUrl(seed)} alt="avatar" className="w-full h-full object-cover" />
                  </div>
              ))}
          </div>
          <Button fullWidth variant="secondary" className="mt-8" onClick={refreshAvatars}>
             <i className="fas fa-sync mr-2"></i> Randomize
          </Button>
      </Modal>
    </div>
  );
};

export default HomePage;
