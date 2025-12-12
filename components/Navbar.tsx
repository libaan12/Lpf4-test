import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', icon: 'fa-home', label: 'Home' },
    { path: '/lobby', icon: 'fa-bolt', label: 'Battle' },
    { path: '/leaderboard', icon: 'fa-trophy', label: 'Rank' },
    { path: '/profile', icon: 'fa-user', label: 'Me' },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-3 flex justify-between items-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20 shrink-0 pb-safe transition-colors">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <button 
            key={item.path} 
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center gap-1 transition-colors w-16 ${isActive ? 'text-somali-blue dark:text-blue-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
          >
            <i className={`fas ${item.icon} text-xl ${isActive ? 'animate-pulse' : ''}`}></i>
            <span className="text-[10px] font-bold">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};