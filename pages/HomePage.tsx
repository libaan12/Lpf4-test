
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
  const [showRamadanWelcome, setShowRamadanWelcome] = useState(false);
  
  // Ramadan Countdown State
  const [ramadanTimer, setRamadanTimer] = useState<{d: number, h: number, m: number, s: number} | null>(null);

  useEffect(() => {
    // Prompt to change avatar if not updated yet (Once per user lifetime)
    if (profile && !profile.avatarUpdated) {
      setShowAvatarModal(true);
      setAvatarSeeds(Array.from({length: 9}, () => Math.random().toString(36).substring(7)));
    }
  }, [profile]);

  // Ramadan Welcome Check (Stored locally to show once)
  useEffect(() => {
      const hasSeenRamadan = localStorage.getItem('ramadan_2025_intro_v1');
      if (!hasSeenRamadan) {
          // Delay slightly for effect
          const timer = setTimeout(() => {
              setShowRamadanWelcome(true);
              playSound('win');
              const end = Date.now() + 3000;
              const frame = () => {
                confetti({
                  particleCount: 2,
                  angle: 60,
                  spread: 55,
                  origin: { x: 0 },
                  colors: ['#fbbf24', '#f59e0b', '#10b981'] // Gold & Green
                });
                confetti({
                  particleCount: 2,
                  angle: 120,
                  spread: 55,
                  origin: { x: 1 },
                  colors: ['#fbbf24', '#f59e0b', '#10b981']
                });
                if (Date.now() < end) requestAnimationFrame(frame);
              };
              frame();
              localStorage.setItem('ramadan_2025_intro_v1', 'true');
          }, 1000);
          return () => clearTimeout(timer);
      }
  }, []);

  // Ramadan Countdown Logic (Target: Feb 18, 2026 as per API spec - or adjust to realistic date if needed)
  useEffect(() => {
      const targetDate = new Date("2026-02-18T00:00:00.000Z").getTime();
      
      const updateTimer = () => {
          const now = Date.now();
          const diff = targetDate - now;
          
          if (diff > 0) {
              setRamadanTimer({
                  d: Math.floor(diff / (1000 * 60 * 60 * 24)),
                  h: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
                  m: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
                  s: Math.floor((diff % (1000 * 60)) / 1000)
              });
          } else {
              setRamadanTimer(null);
          }
      };

      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
  }, []);

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

  // Render Helper for Lanterns
  const Lantern = ({ delay, left, size = "md", color = "gold" }: { delay: string, left: string, size?: "sm"|"md"|"lg", color?: "gold"|"green" }) => {
      const sizeClass = size === 'sm' ? 'w-6 text-xl' : size === 'md' ? 'w-8 text-2xl' : 'w-10 text-3xl';
      const colorClass = color === 'gold' ? 'text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]' : 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]';
      const stringLength = size === 'sm' ? 'h-16' : size === 'md' ? 'h-24' : 'h-32';
      
      return (
          <div className="absolute top-0 origin-top animate-swing z-0" style={{ left: left, animationDelay: delay, animationDuration: '4s' }}>
              <div className={`w-[1px] bg-white/30 mx-auto ${stringLength}`}></div>
              <div className={`relative -mt-1 flex justify-center ${colorClass}`}>
                  <i className={`fas fa-mosque ${sizeClass}`}></i>
                  <div className="absolute inset-0 bg-yellow-500/20 blur-md rounded-full animate-pulse"></div>
              </div>
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-[#020617] font-sans overflow-hidden relative flex flex-col pb-24">
        
        {/* --- RAMADAN BACKGROUND & OVERLAYS --- */}
        
        {/* 1. Deep Starry Night Background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/40 via-[#020617] to-[#020617] pointer-events-none"></div>
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 pointer-events-none animate-pulse"></div>
        
        {/* 2. Top Hanging Lanterns (Animated) */}
        <div className="absolute top-0 left-0 right-0 h-40 overflow-visible pointer-events-none z-0">
            <Lantern delay="0s" left="10%" size="md" />
            <Lantern delay="1.5s" left="25%" size="sm" color="green" />
            <Lantern delay="0.5s" left="75%" size="sm" color="green" />
            <Lantern delay="2s" left="90%" size="md" />
            
            {/* Center Moon */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 opacity-20 animate-pulse">
                <i className="fas fa-moon text-6xl text-yellow-100"></i>
            </div>
        </div>

        {/* 3. Side Pattern Overlays */}
        <div className="absolute top-0 bottom-0 left-0 w-8 bg-repeat-y opacity-10 pointer-events-none ramadan-pattern z-0 border-r border-white/5 hidden md:block"></div>
        <div className="absolute top-0 bottom-0 right-0 w-8 bg-repeat-y opacity-10 pointer-events-none ramadan-pattern z-0 border-l border-white/5 hidden md:block"></div>

        {/* 4. Twinkling Stars Overlay */}
        <div className="absolute top-10 left-20 text-yellow-200/40 text-[8px] animate-twinkle" style={{animationDelay: '1s'}}>✦</div>
        <div className="absolute top-32 right-12 text-yellow-200/40 text-[10px] animate-twinkle" style={{animationDelay: '2.5s'}}>✦</div>
        <div className="absolute bottom-40 left-8 text-white/30 text-[12px] animate-twinkle" style={{animationDelay: '0.5s'}}>✦</div>

        {/* HEADER */}
        <div className="pt-8 px-6 pb-4 flex items-center justify-between z-10 relative">
            {/* Profile Section */}
            <div className="flex items-center gap-4 cursor-pointer" onClick={() => handleNav('/profile')}>
                <div className="relative">
                    <div className="absolute inset-0 bg-game-gold rounded-full blur-md opacity-40 animate-pulse"></div>
                    <Avatar 
                        src={profile?.avatar} 
                        seed={profile?.uid} 
                        size="md" 
                        className="relative border-2 border-yellow-500 z-10" 
                    />
                    <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-[#020617] border border-yellow-500 text-yellow-500 text-[9px] font-black px-2 py-0.5 rounded-full z-20 shadow-lg whitespace-nowrap">
                        LVL {level}
                    </div>
                </div>
                <div>
                    <h1 className="text-white font-black text-xl leading-tight flex items-center gap-1">
                        Hi, {profile?.name}
                        {(profile?.isVerified || profile?.customBadge) && <VerificationBadge size="sm" className="text-yellow-400" src={profile?.customBadge} />}
                    </h1>
                    {/* XP Bar */}
                    <div className="w-32 h-2.5 bg-slate-800 rounded-full mt-1.5 overflow-hidden relative border border-slate-700 shadow-inner">
                        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-yellow-600 to-yellow-400 shadow-[0_0_10px_rgba(250,204,21,0.6)]" style={{ width: `${progress}%` }}></div>
                    </div>
                    <div className="text-[10px] text-yellow-500 font-bold mt-1 tracking-wide">{profile?.points} / {nextLevel} PTS</div>
                </div>
            </div>

            {/* Currency / Stats / Admin Button */}
            <div className="flex items-center gap-3">
                {profile?.roles?.superAdmin && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleNav('/adminlp'); }} 
                        className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 border border-purple-400/50 flex items-center justify-center text-white shadow-[0_0_15px_rgba(147,51,234,0.4)] active:scale-95 transition-all z-20"
                    >
                        <i className="fas fa-user-astronaut"></i>
                    </button>
                )}

                <div className="flex items-center gap-2 bg-slate-800/80 backdrop-blur-sm border border-yellow-500/30 rounded-full px-3 py-1.5 shadow-lg">
                    <i className="fas fa-star text-yellow-400 text-xs animate-pulse"></i>
                    <span className="text-white font-black text-sm">{profile?.points}</span>
                </div>
                {profile?.role === 'admin' && (
                    <div className="flex items-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); handleNav('/admin'); }} className="w-10 h-10 rounded-full bg-slate-800/80 backdrop-blur-sm border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors shadow-lg active:scale-95">
                            <i className="fas fa-cog"></i>
                        </button>
                    </div>
                )}
            </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6 z-10 custom-scrollbar">
            
            {/* RAMADAN BANNER (New) */}
            <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-r from-emerald-900 to-[#020617] border border-emerald-500/30 shadow-lg shadow-emerald-900/20 group animate__animated animate__fadeInDown">
                <div className="absolute inset-0 ramadan-pattern opacity-10"></div>
                <div className="absolute right-0 bottom-0 opacity-20 transform translate-x-4 translate-y-4">
                    <i className="fas fa-moon text-8xl text-emerald-400"></i>
                </div>
                <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="font-arabic text-3xl text-yellow-400 drop-shadow-md mb-1">رمضان مبارك</div>
                    <div className="text-white font-black uppercase tracking-[0.3em] text-xs mb-3">Ramadan Kareem</div>
                    {ramadanTimer && (
                       <div className="inline-flex items-center gap-3 bg-black/30 px-4 py-2 rounded-xl border border-yellow-500/20 backdrop-blur-sm">
                           <div className="text-center">
                               <div className="text-lg font-black text-white leading-none">{ramadanTimer.d}</div>
                               <div className="text-[8px] text-emerald-400 uppercase font-bold">Days</div>
                           </div>
                           <div className="h-6 w-[1px] bg-white/10"></div>
                           <div className="text-center">
                               <div className="text-lg font-black text-white leading-none">{ramadanTimer.h}</div>
                               <div className="text-[8px] text-emerald-400 uppercase font-bold">Hrs</div>
                           </div>
                           <div className="h-6 w-[1px] bg-white/10"></div>
                           <div className="text-center">
                               <div className="text-lg font-black text-white leading-none">{ramadanTimer.m}</div>
                               <div className="text-[8px] text-emerald-400 uppercase font-bold">Min</div>
                           </div>
                       </div>
                    )}
                </div>
            </div>

            {/* HERO: BATTLE QUIZ (Ramadan Styled) */}
            <div onClick={() => handleNav('/lobby')} className="relative group cursor-pointer mt-2">
                {/* Glow Behind */}
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-600 to-orange-600 rounded-[2.5rem] blur opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
                
                <div className="relative bg-gradient-to-b from-[#1e293b]/90 to-[#0f172a]/95 backdrop-blur-xl border border-yellow-500/30 rounded-[2.5rem] p-6 overflow-hidden shadow-2xl">
                    {/* Corner Accents */}
                    <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-yellow-500/50 rounded-tl-[2rem]"></div>
                    <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-orange-500/50 rounded-br-[2rem]"></div>

                    {/* Header Tags */}
                    <div className="flex gap-2 mb-2 relative z-10">
                        <span className="bg-orange-500/10 text-orange-400 border border-orange-500/30 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-[0_0_10px_rgba(236,72,153,0.2)]">
                            <i className="fas fa-fire animate-pulse"></i> Iftar Special
                        </span>
                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                            Multiplayer
                        </span>
                    </div>

                    <div className="flex justify-between items-center relative z-10">
                        <div className="mt-2">
                            <h2 className="text-5xl font-black text-white italic tracking-tighter leading-[0.85] drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
                                BATTLE <br />
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-white to-orange-400 animate-gradient-x">QUIZ</span>
                            </h2>
                            <div className="h-1 w-12 bg-yellow-500 rounded-full mt-3 mb-6 shadow-[0_0_10px_rgba(234,179,8,0.8)]"></div>
                            
                            <button className="bg-gradient-to-r from-yellow-600 to-orange-600 text-white px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(234,179,8,0.4)] flex items-center gap-2 group-hover:scale-105 transition-transform active:scale-95 border border-white/20">
                                PLAY NOW <i className="fas fa-arrow-right"></i>
                            </button>
                        </div>

                        {/* Graphic */}
                        <div className="absolute -right-6 -bottom-6 opacity-90 pointer-events-none transform scale-110">
                             <div className="relative">
                                 <i className="fas fa-gamepad text-8xl text-orange-600/80 transform rotate-12 drop-shadow-[0_0_30px_rgba(234,88,12,0.3)] absolute right-10 -top-10 animate-float" style={{animationDelay: '1s'}}></i>
                                 <i className="fas fa-gamepad text-8xl text-yellow-500 transform -rotate-12 drop-shadow-[0_0_30px_rgba(234,179,8,0.4)] relative z-10 animate-float"></i>
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
                    <div className="absolute inset-0 bg-emerald-500 rounded-[2.5rem] blur opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
                    <div className="bg-[#0f172a]/60 backdrop-blur-md border border-emerald-500/30 p-6 rounded-[2.5rem] h-44 flex flex-col justify-between hover:bg-[#1e293b]/80 transition-colors relative overflow-hidden shadow-xl">
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl"></div>
                        <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-400 text-2xl border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)] group-hover:scale-110 transition-transform">
                            <i className="fas fa-book-open"></i>
                        </div>
                        <div>
                            <h3 className="text-white font-black text-xl leading-none tracking-tight">Practice</h3>
                            <p className="text-emerald-400 text-[10px] font-bold mt-1.5 uppercase tracking-wider">Solo Training</p>
                        </div>
                        <div className="absolute bottom-6 right-6 text-emerald-500 text-sm opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all"><i className="fas fa-arrow-right"></i></div>
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
                <div onClick={() => handleNav('/library')} className="relative group cursor-pointer">
                    <div className="absolute inset-0 bg-indigo-500 rounded-[2.5rem] blur opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
                    <div className="bg-[#0f172a]/60 backdrop-blur-md border border-indigo-500/30 p-6 rounded-[2.5rem] h-44 flex flex-col justify-between hover:bg-[#1e293b]/80 transition-colors relative overflow-hidden shadow-xl">
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl"></div>
                        
                        <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-400 text-2xl border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)] group-hover:scale-110 transition-transform">
                            <i className="fas fa-file-pdf"></i>
                        </div>
                        <div>
                            <h3 className="text-white font-black text-xl leading-none tracking-tight">PDFs</h3>
                            <p className="text-indigo-400 text-[10px] font-bold mt-1.5 uppercase tracking-wider">Archives</p>
                        </div>
                        
                        <div className="absolute bottom-6 right-6 text-indigo-500 text-sm opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                            <i className="fas fa-arrow-right"></i>
                        </div>
                    </div>
                </div>

                {/* Calculator Card */}
                <div onClick={() => handleNav('/calculator')} className="relative group cursor-pointer">
                    <div className="absolute inset-0 bg-blue-500 rounded-[2.5rem] blur opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>
                    <div className="bg-[#0f172a]/60 backdrop-blur-md border border-blue-500/30 p-6 rounded-[2.5rem] h-44 flex flex-col justify-between hover:bg-[#1e293b]/80 transition-colors relative overflow-hidden shadow-xl">
                        <div className="absolute -right-4 -top-4 w-20 h-20 bg-blue-500/10 rounded-full blur-xl"></div>
                        <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-400 text-2xl border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)] group-hover:scale-110 transition-transform">
                            <i className="fas fa-calculator"></i>
                        </div>
                        <div>
                            <h3 className="text-white font-black text-xl leading-none tracking-tight">Calculator</h3>
                            <p className="text-blue-400 text-[10px] font-bold mt-1.5 uppercase tracking-wider">Tools</p>
                        </div>
                        <div className="absolute bottom-6 right-6 text-blue-500 text-sm opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all"><i className="fas fa-arrow-right"></i></div>
                    </div>
                </div>

            </div>
            
        </div>

        {/* --- MODALS --- */}

        {/* Avatar Selection */}
        <Modal isOpen={showAvatarModal} title="Choose Your Look" onClose={() => {}}>
             <div className="text-center mb-4 text-gray-500 text-sm font-bold">Select an avatar identity.</div>
             <div className="grid grid-cols-3 gap-4">
              {avatarSeeds.map((seed, idx) => (
                  <div key={idx} onClick={() => handleAvatarSelect(seed)} className="aspect-square rounded-full overflow-hidden border-2 border-transparent hover:border-yellow-500 cursor-pointer bg-slate-800 shadow-md transition-all hover:scale-105">
                      <img src={generateAvatarUrl(seed)} className="w-full h-full object-cover" />
                  </div>
              ))}
             </div>
             <Button fullWidth variant="secondary" className="mt-6" onClick={refreshAvatars}>
                <i className="fas fa-sync mr-2"></i> Randomize
             </Button>
        </Modal>

        {/* RAMADAN WELCOME MODAL */}
        {showRamadanWelcome && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate__animated animate__fadeIn">
                <div className="relative w-full max-w-sm bg-[#0f172a] rounded-[2rem] border-2 border-yellow-500/50 shadow-[0_0_50px_rgba(234,179,8,0.3)] overflow-hidden animate__animated animate__zoomIn p-8 text-center">
                    {/* Decorations */}
                    <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-yellow-500/20 to-transparent pointer-events-none"></div>
                    <div className="absolute -top-4 -left-4 text-6xl text-yellow-500/10 animate-spin-slow"><i className="fas fa-star"></i></div>
                    <div className="absolute -bottom-4 -right-4 text-8xl text-emerald-500/10"><i className="fas fa-moon"></i></div>

                    {/* Content */}
                    <div className="relative z-10">
                        <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-yellow-400 to-orange-600 rounded-full flex items-center justify-center shadow-2xl border-4 border-[#0f172a] ring-4 ring-yellow-500/30">
                            <i className="fas fa-mosque text-4xl text-[#0f172a]"></i>
                        </div>
                        
                        <h2 className="font-arabic text-4xl text-yellow-400 mb-2 drop-shadow-md">رمضان كريم</h2>
                        <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-4">Ramadan Mubarak!</h3>
                        
                        <p className="text-slate-300 text-sm font-bold leading-relaxed mb-8">
                            Welcome to the <span className="text-emerald-400">Ramadan Special Edition</span> of LP-F4! 
                            May this month bring you peace, joy, and victory in your battles.
                        </p>

                        <button 
                            onClick={() => { setShowRamadanWelcome(false); playSound('click'); }}
                            className="w-full py-4 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl text-white font-black uppercase tracking-widest shadow-xl shadow-orange-500/20 active:scale-95 transition-transform"
                        >
                            Start Journey
                        </button>
                    </div>
                </div>
            </div>
        )}

    </div>
  );
};

export default HomePage;
