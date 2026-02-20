
import React, { useState, useEffect } from 'react';
import { playSound } from '../services/audioService';
import { Modal, Button } from './UI';

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // 1. Android/Chrome Event Listener
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Only show if not already installed (standalone check)
      if (!window.matchMedia('(display-mode: standalone)').matches) {
          setIsVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);

    // 2. iOS Detection
    // Check if device is iOS and NOT in standalone mode
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

    if (isIosDevice && !isStandalone) {
        setIsIOS(true);
        setIsVisible(true);
    }

    window.addEventListener('appinstalled', () => {
      setIsVisible(false);
      setDeferredPrompt(null);
      console.log('PWA was installed');
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleDismiss = () => {
      setIsVisible(false);
      playSound('click');
  };

  const handleInstallClick = async () => {
    playSound('click');
    
    if (isIOS) {
        setShowIOSInstructions(true);
    } else if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            playSound('correct');
            setIsVisible(false);
        }
        setDeferredPrompt(null);
    }
  };

  if (!isVisible) return null;

  return (
    <>
        <div className="fixed top-4 left-0 right-0 z-[100] px-4 flex justify-center pointer-events-none">
            <div className="pointer-events-auto bg-white/90 dark:bg-slate-100/90 backdrop-blur-xl border border-white/40 dark:border-slate-700/50 shadow-2xl rounded-[1.5rem] p-4 w-full max-w-sm flex items-center gap-4 animate__animated animate__slideInDown">
                
                <div className="relative w-14 h-14 bg-gradient-to-br from-game-primary to-orange-600 rounded-2xl shadow-lg flex items-center justify-center shrink-0 overflow-hidden group">
                    <i className={`fas ${isIOS ? 'fa-apple' : 'fa-download'} text-white text-2xl animate-pulse`}></i>
                    <div className="absolute inset-0 bg-white/20 -translate-y-full group-hover:translate-y-0 transition-transform"></div>
                </div>

                <div className="flex-1 min-w-0">
                    <h3 className="font-black text-slate-900 dark:text-white text-sm leading-tight mb-1">
                        {isIOS ? 'Install on iOS' : 'Install App'}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-tight">
                        {isIOS ? 'Add to Home Screen for best experience.' : 'Play fullscreen & offline.'}
                    </p>
                </div>

                <div className="flex gap-2">
                    <button 
                        onClick={handleDismiss}
                        className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-200 text-slate-500 dark:text-slate-400 flex items-center justify-center hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 transition-colors"
                    >
                        <i className="fas fa-times text-sm"></i>
                    </button>
                    <button 
                        onClick={handleInstallClick}
                        className="bg-game-primary text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide shadow-lg shadow-orange-500/20 hover:scale-105 active:scale-95 transition-all"
                    >
                        {isIOS ? 'How?' : 'Install'}
                    </button>
                </div>
            </div>
        </div>

        {/* iOS Instructions Modal */}
        <Modal isOpen={showIOSInstructions} title="Install on iOS" onClose={() => setShowIOSInstructions(false)}>
            <div className="space-y-6 text-center pt-2">
                <div className="w-20 h-20 bg-gray-100 dark:bg-slate-200 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                    <i className="fab fa-apple text-4xl text-gray-800 dark:text-white"></i>
                </div>
                
                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    iOS does not support one-click installation. Follow these steps manually:
                </p>

                <div className="text-left space-y-4 bg-slate-50 dark:bg-slate-100/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-black text-xs shrink-0 mt-0.5">1</div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-tight">
                            Tap the <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded mx-1"><i className="fas fa-share-square"></i></span> Share button in your browser menu.
                        </span>
                    </div>
                    <div className="flex items-start gap-3">
                        <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-black text-xs shrink-0 mt-0.5">2</div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-tight">
                            Scroll down and select <span className="font-black">"Add to Home Screen"</span> <i className="fas fa-plus-square ml-1 text-gray-400"></i>.
                        </span>
                    </div>
                </div>

                <Button fullWidth onClick={() => setShowIOSInstructions(false)}>Got it!</Button>
            </div>
        </Modal>
    </>
  );
};
