
import React from 'react';
import { Button } from '../components/UI';
import { useNavigate } from 'react-router-dom';

const DownloadPage: React.FC = () => {
  const navigate = useNavigate();

  const handleDownload = () => {
    // Direct APK Download logic restored
    const link = document.createElement('a');
    link.href = 'https://files.catbox.moe/o7kd4m.apk';
    link.target = '_blank';
    link.setAttribute('download', 'LP-F4.apk'); 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen relative overflow-hidden transition-colors flex flex-col font-sans pt-24">
      {/* Navbar - Fixed Glass */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 p-4 shadow-sm flex justify-between items-center transition-colors duration-300">
         <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/')}>
            <div className="relative">
                <div className="absolute inset-0 bg-game-primary blur-lg opacity-40 group-hover:opacity-70 transition-opacity"></div>
                <img src="https://files.catbox.moe/qn40s6.png" className="w-10 h-10 relative z-10 drop-shadow-md" alt="Logo" />
            </div>
            <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tighter">LP-F4</span>
         </div>
         <Button 
           variant="outline"
           onClick={() => navigate('/auth')} 
           className="hidden md:flex text-xs py-2 px-4"
         >
           Web App Login
         </Button>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-5xl mx-auto w-full z-10 relative">
         <div className="animate__animated animate__fadeInDown w-full">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-game-primary dark:text-blue-300 text-xs font-black uppercase tracking-widest mb-6 border border-blue-200 dark:border-blue-800 shadow-sm backdrop-blur-sm">
                <i className="fab fa-android text-lg"></i>
                Official App
            </div>
            
            <h1 className="text-5xl md:text-8xl font-black mb-6 text-slate-900 dark:text-white tracking-tight leading-tight drop-shadow-sm">
                Learn. Battle. <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-game-primary to-red-600">Conquer.</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-300 mb-12 max-w-3xl mx-auto leading-relaxed font-medium">
                The ultimate multiplayer quiz arena for Somali students. 
                Experience smoother gameplay and real-time notifications.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-20">
                <button 
                    onClick={handleDownload}
                    className="relative group px-8 py-5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black text-xl shadow-2xl shadow-slate-500/30 dark:shadow-white/10 overflow-hidden transition-all hover:scale-105 active:scale-95"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-black/10 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700"></div>
                    <div className="flex items-center gap-3 relative z-10">
                        <i className="fab fa-android text-3xl text-green-400 dark:text-green-600"></i>
                        <span>Download .APK</span>
                    </div>
                </button>
                
                <button 
                     onClick={() => navigate('/auth')}
                     className="px-8 py-5 bg-white dark:bg-slate-800 text-slate-700 dark:text-white border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-2xl font-bold text-lg shadow-sm transition-all hover:-translate-y-1"
                >
                    Launch Web App
                </button>
            </div>
         </div>

         {/* Features Grid */}
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full animate__animated animate__fadeInUp delay-200 px-4">
             <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl p-8 rounded-3xl border border-white/50 dark:border-slate-700 shadow-xl text-left group hover:-translate-y-2 transition-transform duration-300">
                 <div className="w-14 h-14 bg-orange-100 dark:bg-orange-900/50 rounded-2xl flex items-center justify-center text-game-primary dark:text-orange-400 mb-6 group-hover:scale-110 transition-transform shadow-inner">
                     <i className="fas fa-bolt text-2xl"></i>
                 </div>
                 <h3 className="font-black text-xl mb-3 text-slate-900 dark:text-white">Faster Performance</h3>
                 <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">Native Android optimization for lag-free battles.</p>
             </div>
             
             <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl p-8 rounded-3xl border border-white/50 dark:border-slate-700 shadow-xl text-left group hover:-translate-y-2 transition-transform duration-300 delay-100">
                 <div className="w-14 h-14 bg-green-100 dark:bg-green-900/50 rounded-2xl flex items-center justify-center text-green-600 dark:text-green-400 mb-6 group-hover:scale-110 transition-transform shadow-inner">
                     <i className="fas fa-bell text-2xl"></i>
                 </div>
                 <h3 className="font-black text-xl mb-3 text-slate-900 dark:text-white">Notifications</h3>
                 <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">Never miss a match invite or tournament alert.</p>
             </div>
             
             <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-xl p-8 rounded-3xl border border-white/50 dark:border-slate-700 shadow-xl text-left group hover:-translate-y-2 transition-transform duration-300 delay-200">
                 <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/50 rounded-2xl flex items-center justify-center text-amber-600 dark:text-amber-400 mb-6 group-hover:scale-110 transition-transform shadow-inner">
                     <i className="fas fa-wifi text-2xl"></i>
                 </div>
                 <h3 className="font-black text-xl mb-3 text-slate-900 dark:text-white">Data Saver</h3>
                 <p className="text-slate-500 dark:text-slate-400 font-medium leading-relaxed">Optimized to use less data than the web version.</p>
             </div>
         </div>
      </main>

      {/* Footer */}
      <footer className="p-8 text-center border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10">
          <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">
              &copy; 2024 LP-F4 Educational Platform. All rights reserved.
          </p>
      </footer>
    </div>
  );
};

export default DownloadPage;
