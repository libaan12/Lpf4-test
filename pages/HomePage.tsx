
import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, update } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { Avatar, Card, Modal, Button, VerificationBadge } from '../components/UI';
import { playSound } from '../services/audioService';
import { generateAvatarUrl } from '../constants';
import { showToast } from '../services/alert';
import confetti from 'canvas-confetti';

const HomePage: React.FC = () => {
  const { profile, user } = useContext(UserContext);
  const navigate = useNavigate();

  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [avatarSeeds, setAvatarSeeds] = useState<string[]>([]);
  
  // New Year Celebration State
  const [showNewYear, setShowNewYear] = useState(false);

  useEffect(() => {
    // Prompt to change avatar if not updated yet (Once per user lifetime)
    if (profile && !profile.avatarUpdated) {
      setShowAvatarModal(true);
      setAvatarSeeds(Array.from({length: 9}, () => Math.random().toString(36).substring(7)));
    }
  }, [profile]);

  // New Year 2026 Logic
  useEffect(() => {
      const hasCelebrated = localStorage.getItem('celebrated_2026');
      if (!hasCelebrated && user) {
          // Delay slightly to allow page load transition
          const timer = setTimeout(() => {
              setShowNewYear(true);
              triggerFireworks();
              playSound('win');
          }, 800);
          return () => clearTimeout(timer);
      }
  }, [user]);

  const triggerFireworks = () => {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
  };

  const handleCloseNewYear = () => {
      localStorage.setItem('celebrated_2026', 'true');
      setShowNewYear(false);
      playSound('click');
  };

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
    <div className="min-h-screen bg-[#050b14] font-sans overflow-hidden relative flex flex-col pb-24">
        
        {/* Background Effects */}
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-[#050b14] to-[#050b14] pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-[linear-gradient(to_bottom,transparent_0%,#0f172a_100%),linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] [transform:perspective(500px)_rotateX(60deg)_translateY(100px)] opacity-30 pointer-events-none origin-bottom"></div>

        {/* HEADER */}
        <div className="pt-8 px-6 pb-4 flex items-center justify-between z-10">
            {/* Profile Section */}
            <div className="flex items-center gap-4" onClick={() => handleNav('/profile')}>
                <div className="relative">
                    <div className="absolute inset-0 bg-cyan-500 rounded-full blur-md opacity-50"></div>
                    <Avatar 
                        src={profile?.avatar} 
                        seed={profile?.uid} 
                        size="md" 
                        className="relative border-2 border-cyan-400 z-10" 
                    />
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#050b14] border border-cyan-500 text-cyan-400 text-[9px] font-black px-2 py-0.5 rounded-full z-20 shadow-lg whitespace-nowrap">
                        LVL {level}
                    </div>
                </div>
                <div>
                    <h1 className="text-white font-black text-xl leading-tight flex items-center gap-1">
                        Hi, {profile?.name}
                        {profile?.isVerified && <VerificationBadge size="sm" className="text-cyan-400" />}
                    </h1>
                    {/* XP Bar */}
                    <div className="w-32 h-2.5 bg-slate-800 rounded-full mt-1.5 overflow-hidden relative border border-slate-700 shadow-inner">
                        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500 to-blue-500 shadow-[0_0_10px_rgba(6,182,212,0.6)]" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className="text-[10px] text-cyan-400 font-bold mt-1 tracking-wide">{profile?.points} / {nextLevel} PTS</div>
                </div>
            </div>

            {/* Currency / Stats / Admin Button */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-full px-3 py-1.5 shadow-lg">
                    <i className="fas fa-star text-purple-400 text-xs animate-pulse"></i>
                    <span className="text-white font-black text-sm">{profile?.points}</span>
                </div>
                {/* Only show Admin specific buttons for Admin Users */}
                {profile?.role === 'admin' && (
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                window.open('https://pl28709979.effectivegatecpm.com/b7749c6413cf35935cfa37b468c20ce2/invoke.js', '_blank'); 
                            }} 
                            className="px-3 py-2 rounded-xl bg-game-primary/20 border border-game-primary/30 text-game-primary text-[10px] font-black uppercase tracking-widest hover:bg-game-primary hover:text-white transition-all shadow-lg active:scale-95"
                        >
                            Go to
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleNav('/admin'); }} className="w-10 h-10 rounded-full bg-slate-800/80 backdrop-blur-sm border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors shadow-lg active:scale-95">
                            <i className="fas fa-cog"></i>
                        </button>
                    </div>
                )}
            </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 z-10 custom-scrollbar">
            
            {/* HERO: BATTLE QUIZ */}
            <div onClick={() => handleNav('/lobby')} className="relative group cursor-pointer">
                {/* Glow Behind */}
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-[2.5rem] blur opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
                
                <div className="relative bg-gradient-to-b from-[#1e293b]/90 to-[#0f172a]/95 backdrop-blur-xl border border-cyan-500/30 rounded-[2.5rem] p-6 overflow-hidden shadow-2xl">
                    {/* Corner Accents */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-500/50 rounded-tl-[2rem]"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-purple-500/50 rounded-br-[2rem]"></div>

                    {/* Header Tags */}
                    <div className="flex gap-2 mb-2 relative z-10">
                        <span className="bg-pink-500/10 text-pink-400 border border-pink-500/30 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-[0_0_10px_rgba(236,72,153,0.2)]">
                            <i className="fas fa-fire animate-pulse"></i> Hot
                        </span>
                        <span className="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                            Multiplayer
                        </span>
                    </div>

                    <div className="flex justify-between items-center relative z-10">
                        <div className="mt-2">
                            <h2 className="text-5xl font-black text-white italic tracking-tighter leading-[0.85] drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                                BATTLE <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-white to-purple-400 animate-gradient-x">QUIZ</span>
                            </h2>
                            <div className="h-1 w-12 bg-cyan-500 rounded-full mt-3 mb-6 shadow-[0_0_10px_rgba(6,182,212,0.8)]"></div>
                            
                            <button className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(6,182,212,0.4)] flex items-center gap-2 group-hover:scale-105 transition-transform active:scale-95 border border-white/20">
                                PLAY NOW <i className="fas fa-arrow-right"></i>
                            </button>
                        </div>

                        {/* Graphic */}
                        <div className="absolute -right-6 -bottom-6 opacity-90 pointer-events-none transform scale-110">
                             <div className="relative">
                                 <i className="fas fa-gamepad text-8xl text-purple-600/80 transform rotate-12 drop-shadow-[0_0_30px_rgba(147,51,234,0.3)] absolute right-10 -top-10 animate-float" style={{animationDelay: '1s'}}></i>
                                 <i className="fas fa-gamepad text-8xl text-cyan-500 transform -rotate-12 drop-shadow-[0_0_30px_rgba(6,182,212,0.4)] relative z-10 animate-float"></i>
                                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-black text-4xl italic z-20 drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] transform -skew-x-12">VS</div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* SECONDARY GRID */}
            <div className="grid grid-cols-2 gap-4">
                
                {/* Practice Card */}
                <div onClick={() => handleNav('/solo')} className="relative group cursor-pointer">
                    <div className="absolute inset-0 bg-cyan-500 rounded-[2.5rem] blur opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
                    <div className="bg-[#0f172a]/60 backdrop-blur-md border border-cyan-500/30 p-6 rounded-[2.5rem] h-44 flex flex-col justify-between hover:bg-[#1e293b]/80 transition-colors relative overflow-hidden shadow-xl">
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-cyan-500/10 rounded-full blur-xl"></div>
                        <div className="w-12 h-12 bg-cyan-500/10 rounded-2xl flex items-center justify-center text-cyan-400 text-2xl border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.15)] group-hover:scale-110 transition-transform">
                            <i className="fas fa-dumbbell"></i>
                        </div>
                        <div>
                            <h3 className="text-white font-black text-xl leading-none tracking-tight">Practice</h3>
                            <p className="text-cyan-400 text-[10px] font-bold mt-1.5 uppercase tracking-wider">Solo Training</p>
                        </div>
                        <div className="absolute bottom-6 right-6 text-cyan-500 text-sm opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all"><i className="fas fa-arrow-right"></i></div>
                    </div>
                </div>

                {/* Rankings Card */}
                <div onClick={() => handleNav('/leaderboard')} className="relative group cursor-pointer">
                    <div className="absolute inset-0 bg-purple-500 rounded-[2.5rem] blur opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
                    <div className="bg-[#0f172a]/60 backdrop-blur-md border border-purple-500/30 p-6 rounded-[2.5rem] h-44 flex flex-col justify-between hover:bg-[#1e293b]/80 transition-colors relative overflow-hidden shadow-xl">
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-purple-500/10 rounded-full blur-xl"></div>
                        <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-400 text-2xl border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)] group-hover:scale-110 transition-transform">
                            <i className="fas fa-trophy"></i>
                        </div>
                        <div>
                            <h3 className="text-white font-black text-xl leading-none tracking-tight">Rankings</h3>
                            <p className="text-purple-400 text-[10px] font-bold mt-1.5 uppercase tracking-wider">Global Board</p>
                        </div>
                        <div className="absolute bottom-6 right-6 text-purple-500 text-sm opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all"><i className="fas fa-arrow-right"></i></div>
                    </div>
                </div>

                {/* Library Card */}
                <div onClick={() => handleNav('/library')} className="relative group cursor-pointer col-span-2">
                    <div className="absolute inset-0 bg-indigo-500 rounded-[2.5rem] blur opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
                    <div className="bg-[#0f172a]/60 backdrop-blur-md border border-indigo-500/30 p-6 rounded-[2.5rem] h-28 flex items-center justify-between hover:bg-[#1e293b]/80 transition-colors relative overflow-hidden shadow-xl">
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl"></div>
                        
                        <div className="flex items-center gap-5 relative z-10">
                            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 text-2xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)] group-hover:scale-110 transition-transform">
                                <i className="fas fa-book"></i>
                            </div>
                            <div>
                                <h3 className="text-white font-black text-xl leading-none tracking-tight">Library</h3>
                                <p className="text-indigo-400 text-[10px] font-bold mt-1 uppercase tracking-wider">Get Q&A PDFs</p>
                            </div>
                        </div>
                        
                        <div className="relative z-10 bg-indigo-500/10 p-3 rounded-full border border-indigo-500/20 text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                            <i className="fas fa-arrow-right"></i>
                        </div>
                    </div>
                </div>

            </div>
            
        </div>

        {/* Modals */}
        <Modal isOpen={showAvatarModal} title="Choose Your Look" onClose={() => {}}>
             <div className="text-center mb-4 text-gray-500 text-sm font-bold">Select an avatar identity.</div>
             <div className="grid grid-cols-3 gap-4">
              {avatarSeeds.map((seed, idx) => (
                  <div key={idx} onClick={() => handleAvatarSelect(seed)} className="aspect-square rounded-full overflow-hidden border-2 border-transparent hover:border-cyan-500 cursor-pointer bg-slate-800 shadow-md transition-all hover:scale-105">
                      <img src={generateAvatarUrl(seed)} className="w-full h-full object-cover" />
                  </div>
              ))}
             </div>
             <Button fullWidth variant="secondary" className="mt-6" onClick={refreshAvatars}>
                <i className="fas fa-sync mr-2"></i> Randomize
             </Button>
        </Modal>

        {/* New Year Modal */}
        <Modal isOpen={showNewYear} onClose={handleCloseNewYear}>
             <div className="text-center py-4">
                 <div className="text-6xl mb-4 animate-bounce">🎉</div>
                 <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 mb-2 uppercase tracking-tighter">Happy New Year!</h2>
                 <p className="text-slate-500 dark:text-slate-300 text-sm mb-6 font-bold">Welcome to 2026! Get ready for a year of epic battles.</p>
                 <Button fullWidth onClick={handleCloseNewYear} className="shadow-xl">Let's Go!</Button>
             </div>
        </Modal>

    </div>
  );
};

export default HomePage;
