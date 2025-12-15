import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card } from './UI';

interface NavbarProps {
    orientation?: 'horizontal' | 'vertical';
}

export const Navbar: React.FC<NavbarProps> = ({ orientation = 'horizontal' }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', icon: 'fa-home', label: 'Home' },
    { path: '/lobby', icon: 'fa-bolt', label: 'Battle' },
    { path: '/leaderboard', icon: 'fa-trophy', label: 'Rank' },
    { path: '/about', icon: 'fa-info-circle', label: 'About' },
    { path: '/profile', icon: 'fa-user', label: 'Me' },
  ];

  if (orientation === 'vertical') {
      return (
        <Card className="h-full flex flex-col justify-between py-6 !p-3 shadow-2xl backdrop-blur-2xl bg-white/60 dark:bg-gray-900/60 border border-white/40 dark:border-white/5">
            <div className="flex flex-col gap-2">
                <div className="px-4 mb-8 flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/')}>
                    <div className="p-2 rounded-xl bg-gradient-to-br from-somali-blue to-purple-600 shadow-lg group-hover:scale-110 transition-transform">
                         <img src="https://files.catbox.moe/qn40s6.png" alt="Logo" className="w-8 h-8 filter brightness-200" />
                    </div>
                    <span className="font-extrabold text-2xl tracking-tight hidden lg:block text-transparent bg-clip-text bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300">LP-F4</span>
                </div>
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <button 
                            key={item.path} 
                            onClick={() => navigate(item.path)}
                            className={`flex items-center gap-4 px-4 py-4 transition-all relative rounded-2xl group
                                ${isActive 
                                    ? 'bg-somali-blue text-white shadow-lg shadow-blue-500/30' 
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-white/40 dark:hover:bg-white/10'}
                            `}
                        >
                            <div className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${isActive ? 'bg-white/20' : 'bg-transparent group-hover:scale-110'}`}>
                                <i className={`fas ${item.icon} text-lg`}></i>
                            </div>
                            <span className="text-sm font-bold hidden lg:block">{item.label}</span>
                        </button>
                    );
                })}
            </div>
            <div className="space-y-4">
                <button 
                    onClick={() => navigate('/download')}
                    className="w-full flex items-center gap-3 px-3 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-2xl shadow-lg hover:shadow-purple-500/40 transition-all hover:-translate-y-1"
                >
                    <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                        <i className="fab fa-android text-lg"></i>
                    </div>
                    <div className="text-left hidden lg:block">
                        <div className="text-[10px] uppercase font-bold opacity-80">Get App</div>
                        <div className="text-xs font-bold">Android APK</div>
                    </div>
                </button>
                <div className="text-[10px] text-gray-400 text-center font-mono">
                    <span className="hidden lg:inline">v2.5 Stable</span>
                </div>
            </div>
        </Card>
      );
  }

  // Mobile Horizontal - Floating Glass Pill
  return (
    <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border border-white/50 dark:border-white/10 rounded-full px-2 py-2 flex justify-between items-center shadow-2xl mx-auto max-w-sm relative">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button 
            key={item.path} 
            onClick={() => navigate(item.path)}
            className={`flex items-center justify-center w-12 h-12 rounded-full transition-all relative ${isActive ? 'text-white' : 'text-gray-400 dark:text-gray-500 hover:text-somali-blue dark:hover:text-blue-400'}`}
          >
             {isActive && (
                 <div className="absolute inset-0 bg-somali-blue rounded-full shadow-lg shadow-blue-500/40 animate__animated animate__zoomIn"></div>
             )}
            <i className={`fas ${item.icon} text-xl relative z-10 transition-transform ${isActive ? 'scale-90' : ''}`}></i>
          </button>
        );
      })}
    </div>
  );
};