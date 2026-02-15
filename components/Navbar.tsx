
import React, { useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserContext } from '../contexts';

interface NavbarProps {
    orientation?: 'horizontal' | 'vertical';
}

export const Navbar: React.FC<NavbarProps> = ({ orientation = 'horizontal' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useContext(UserContext);

  const navItems = [
    { path: '/', icon: 'fa-home', label: 'Home' },
    { path: '/lobby', icon: 'fa-gamepad', label: 'Battle' },
    { path: '/social', icon: 'fa-user-friends', label: 'Social', isNew: false },
    { path: '/library', icon: 'fa-book-open', label: 'Library' },
    { path: '/leaderboard', icon: 'fa-trophy', label: 'Rank' },
    { path: '/profile', icon: 'fa-user', label: 'Me' },
  ];

  // Add Support Dashboard if support role
  if (profile?.isSupport || profile?.roles?.support) {
      if (!navItems.find(i => i.path === '/support')) {
          navItems.push({ path: '/support', icon: 'fa-headset', label: 'Support', isNew: false });
      }
  }

  // Super Admin is now accessed via the Home Page Header, not the Navbar.

  if (orientation === 'vertical') {
      return (
        <div className="h-full flex flex-col justify-between py-6 p-4">
            <div className="flex flex-col gap-2">
                <div className="px-4 mb-8 flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/')}>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg flex items-center justify-center transform group-hover:rotate-12 transition-transform overflow-hidden ring-2 ring-cyan-400/50 p-1.5">
                         <img src="https://files.catbox.moe/1picoz.png" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <span className="font-black text-2xl tracking-tighter hidden lg:block text-white italic">LP-F4</span>
                </div>
                
                <div className="bg-[#0f172a]/80 backdrop-blur-md rounded-3xl p-3 shadow-xl border border-cyan-900/30">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <button 
                                key={item.path} 
                                onClick={() => navigate(item.path)}
                                className={`flex items-center gap-4 px-4 py-3 mb-2 w-full rounded-2xl transition-all relative group overflow-hidden
                                    ${isActive 
                                        ? 'bg-gradient-to-r from-cyan-600/20 to-blue-600/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(34,211,238,0.15)]' 
                                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'}
                                `}
                            >
                                <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${isActive ? 'bg-cyan-500/10' : ''}`}>
                                    <i className={`fas ${item.icon} text-lg ${isActive ? 'drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : ''}`}></i>
                                </div>
                                <span className="text-sm font-bold hidden lg:block uppercase tracking-wide">{item.label}</span>
                                {item.isNew && (
                                    <span className="ml-auto bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md animate-pulse hidden lg:block shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                                        NEW
                                    </span>
                                )}
                                {item.isNew && <span className="lg:hidden absolute top-3 right-3 w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.8)]"></span>}
                                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-cyan-400 rounded-r-full shadow-[0_0_10px_rgba(34,211,238,0.8)]"></div>}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
      );
  }

  // Mobile Horizontal - Neon Glass Island
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pointer-events-none flex justify-center pb-6">
        <div className="pointer-events-auto bg-[#0f172a]/90 backdrop-blur-2xl border border-cyan-500/20 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.8)] rounded-3xl px-2 py-2 flex items-center gap-1 w-full max-w-md ring-1 ring-white/5 overflow-x-auto custom-scrollbar-hide">
            {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                <button 
                    key={item.path} 
                    onClick={() => navigate(item.path)}
                    className={`flex-1 flex flex-col items-center justify-center py-2 md:py-3 rounded-2xl transition-all duration-300 relative overflow-hidden group min-w-[50px] md:min-w-[60px]
                        ${isActive ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}
                    `}
                >
                    {isActive && (
                        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 to-transparent rounded-2xl animate__animated animate__fadeIn"></div>
                    )}
                    <div className="relative">
                        <i className={`fas ${item.icon} text-lg md:text-xl mb-1 z-10 transition-transform duration-300 ${isActive ? '-translate-y-1 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'group-active:scale-90'}`}></i>
                        {item.isNew && (
                            <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[8px] font-black px-1.5 rounded-full animate-pulse border border-[#0f172a] shadow-lg">
                                N
                            </span>
                        )}
                    </div>
                    {isActive && (
                        <span className="text-[9px] font-black uppercase tracking-widest leading-none z-10 animate__animated animate__fadeInUp animate__faster text-cyan-400">
                            {item.label}
                        </span>
                    )}
                    {isActive && <div className="w-8 h-1 bg-cyan-500 rounded-t-full absolute bottom-0 shadow-[0_0_10px_rgba(34,211,238,1)]"></div>}
                </button>
                );
            })}
        </div>
    </div>
  );
};
