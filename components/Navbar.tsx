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
    { path: '/lobby', icon: 'fa-bolt', label: 'Battle' },
    { path: '/leaderboard', icon: 'fa-trophy', label: 'Rank' },
    { path: '/about', icon: 'fa-info-circle', label: 'About' },
    { path: '/profile', icon: 'fa-user', label: 'Me' },
  ];

  if (orientation === 'vertical') {
      return (
        <div className="h-full flex flex-col justify-between py-8">
            <div className="flex flex-col gap-2">
                <div className="px-6 mb-8 flex items-center gap-3">
                    <img src="https://files.catbox.moe/qn40s6.png" alt="Logo" className="w-9 h-9" />
                    <span className="font-extrabold text-2xl tracking-tight hidden lg:block text-somali-blue dark:text-white">LP-F4</span>
                </div>
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    return (
                        <button 
                            key={item.path} 
                            onClick={() => navigate(item.path)}
                            className={`flex items-center gap-4 px-6 py-4 transition-all relative mx-4 rounded-2xl
                                ${isActive 
                                    ? 'bg-somali-blue text-white shadow-lg shadow-blue-500/30' 
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}
                            `}
                        >
                            <div className="w-6 text-center"><i className={`fas ${item.icon} text-lg`}></i></div>
                            <span className="text-sm font-bold hidden lg:block">{item.label}</span>
                        </button>
                    );
                })}
            </div>
            <div className="px-6 text-xs text-gray-400 text-center lg:text-left">
                <span className="hidden lg:inline">v2.5 Stable</span>
            </div>
        </div>
      );
  }

  // Mobile Horizontal
  return (
    <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex justify-between items-center shadow-lg z-20 shrink-0 pb-safe transition-colors">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button 
            key={item.path} 
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center gap-1 transition-all w-12 ${isActive ? 'text-somali-blue dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
          >
            <i className={`fas ${item.icon} text-xl ${isActive ? 'scale-110 drop-shadow-sm' : ''} transition-transform`}></i>
            <span className={`text-[10px] font-bold ${isActive ? 'opacity-100' : 'opacity-0 scale-0'} transition-all`}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};