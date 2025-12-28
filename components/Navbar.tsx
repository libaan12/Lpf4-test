import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface NavbarProps {
    orientation?: 'horizontal' | 'vertical';
}

export const Navbar: React.FC<NavbarProps> = ({ orientation = 'horizontal' }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', icon: 'fa-home', label: 'Home' },
    { path: '/lobby', icon: 'fa-gamepad', label: 'Battle' },
    { path: '/social', icon: 'fa-user-friends', label: 'Social', isNew: true },
    { path: '/leaderboard', icon: 'fa-trophy', label: 'Rank' },
    { path: '/profile', icon: 'fa-user', label: 'Me' },
  ];

  if (orientation === 'vertical') {
      return (
        <div className="h-full flex flex-col justify-between py-6 p-4">
            <div className="flex flex-col gap-2">
                <div className="px-4 mb-8 flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/')}>
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-game-primary to-purple-600 shadow-lg flex items-center justify-center transform group-hover:rotate-12 transition-transform">
                         <img src="https://files.catbox.moe/qn40s6.png" alt="Logo" className="w-6 h-6 filter brightness-200" />
                    </div>
                    <span className="font-black text-2xl tracking-tighter hidden lg:block text-slate-800 dark:text-white">LP-F4</span>
                </div>
                
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-2 shadow-xl border-2 border-slate-100 dark:border-slate-700">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <button 
                                key={item.path} 
                                onClick={() => navigate(item.path)}
                                className={`flex items-center gap-4 px-4 py-3 mb-1 w-full rounded-2xl transition-all relative group
                                    ${isActive 
                                        ? 'bg-game-primary text-white shadow-lg shadow-game-primary/30' 
                                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}
                                `}
                            >
                                <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${isActive ? 'bg-white/20' : ''}`}>
                                    <i className={`fas ${item.icon} text-lg`}></i>
                                </div>
                                <span className="text-sm font-bold hidden lg:block">{item.label}</span>
                                {item.isNew && (
                                    <span className="ml-auto bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-md animate-pulse hidden lg:block">
                                        NEW
                                    </span>
                                )}
                                {item.isNew && <span className="lg:hidden absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
                            </button>
                        );
                    })}
                </div>
            </div>
            
            <div className="px-2">
                <button 
                    onClick={() => navigate('/download')}
                    className="w-full flex items-center gap-3 px-4 py-4 bg-slate-900 dark:bg-black text-white rounded-3xl shadow-xl transition-transform hover:-translate-y-1"
                >
                    <i className="fab fa-android text-2xl text-green-400"></i>
                    <div className="text-left hidden lg:block">
                        <div className="text-[10px] uppercase font-bold opacity-60">Download</div>
                        <div className="text-sm font-bold">App v2.5</div>
                    </div>
                </button>
            </div>
        </div>
      );
  }

  // Mobile Horizontal - Glass Island Design
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pointer-events-none flex justify-center pb-6">
        <div className="pointer-events-auto bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-white/50 dark:border-slate-700/50 shadow-[0_8px_32px_rgba(0,0,0,0.2)] rounded-2xl px-2 py-2 flex items-center justify-between gap-1 w-full max-w-sm">
            {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                <button 
                    key={item.path} 
                    onClick={() => navigate(item.path)}
                    className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl transition-all duration-300 relative overflow-hidden
                        ${isActive ? 'text-game-primary' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}
                    `}
                >
                    {isActive && (
                        <div className="absolute inset-0 bg-game-primary/10 dark:bg-game-primary/20 rounded-xl animate__animated animate__fadeIn"></div>
                    )}
                    <div className="relative">
                        <i className={`fas ${item.icon} text-xl mb-1 z-10 transition-transform ${isActive ? '-translate-y-1' : ''}`}></i>
                        {item.isNew && (
                            <span className="absolute -top-1 -right-2 bg-red-500 text-white text-[8px] font-black px-1 rounded-full animate-pulse border border-white dark:border-slate-900">
                                NEW
                            </span>
                        )}
                    </div>
                    <span className={`text-[10px] font-bold leading-none z-10 ${isActive ? 'block' : 'hidden'}`}>
                        {item.label}
                    </span>
                    {isActive && <div className="w-1 h-1 bg-game-primary rounded-full absolute bottom-1"></div>}
                </button>
                );
            })}
        </div>
    </div>
  );
};