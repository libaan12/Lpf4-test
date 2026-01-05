
import React, { useState, useEffect } from 'react';
import { playSound } from '../services/audioService';

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
      // Update UI notify the user they can install the PWA
      // Only show if not already installed
      if (!window.matchMedia('(display-mode: standalone)').matches) {
          setIsVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsVisible(false);
      setDeferredPrompt(null);
      console.log('PWA was installed');
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    playSound('click');
    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      playSound('correct');
      setIsVisible(false);
    } 
    
    setDeferredPrompt(null);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed top-4 left-0 right-0 z-[100] px-4 flex justify-center pointer-events-none">
        <div className="pointer-events-auto bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border border-white/40 dark:border-slate-700/50 shadow-2xl rounded-[1.5rem] p-3 w-full max-w-sm flex items-center gap-3 animate__animated animate__slideInDown">
            
            <div className="relative w-12 h-12 bg-gradient-to-br from-game-primary to-orange-600 rounded-2xl shadow-lg flex items-center justify-center shrink-0 overflow-hidden">
                <img src="https://files.catbox.moe/qn40s6.png" alt="App Logo" className="w-10 h-10 object-contain drop-shadow-md filter brightness-100" />
            </div>

            <div className="flex-1 min-w-0">
                <h3 className="font-black text-slate-900 dark:text-white text-sm leading-tight">Install App</h3>
                <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate">
                    Play fullscreen & offline
                </p>
            </div>

            <div className="flex gap-2">
                <button 
                    onClick={() => setIsVisible(false)}
                    className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                >
                    <i className="fas fa-times text-xs"></i>
                </button>
                <button 
                    onClick={handleInstallClick}
                    className="bg-game-primary text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide shadow-lg shadow-orange-500/20 hover:scale-105 active:scale-95 transition-all"
                >
                    Install
                </button>
            </div>
        </div>
    </div>
  );
};
