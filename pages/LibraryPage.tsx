
import React from 'react';
import { useNavigate } from 'react-router-dom';

const LibraryPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#050b14] font-sans flex flex-col relative overflow-hidden">
      
      {/* Background Ambient Effects */}
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none"></div>
      <div className="absolute top-1/4 left-1/4 w-[80vw] h-[80vw] bg-indigo-900/10 rounded-full blur-[120px] animate-pulse pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[80vw] h-[80vw] bg-cyan-900/10 rounded-full blur-[120px] animate-pulse pointer-events-none delay-1000"></div>

      {/* HEADER */}
      <div className="pt-8 px-6 pb-6 relative z-10 flex items-center justify-between">
          <button 
            onClick={() => navigate('/')} 
            className="w-12 h-12 rounded-2xl bg-slate-800/50 border border-slate-700 text-slate-400 flex items-center justify-center shadow-lg backdrop-blur-md active:scale-95 transition-all"
          >
            <i className="fas fa-arrow-left"></i>
          </button>
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter italic">Digital Library</h1>
          <div className="w-12"></div> {/* Spacer for symmetry */}
      </div>

      {/* MAIN CONTENT - COMING SOON VIEW */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 relative z-10 text-center">
          
          <div className="relative mb-12 group">
              {/* Outer Glow Ring */}
              <div className="absolute inset-0 bg-cyan-500 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-1000 animate-pulse"></div>
              
              {/* Icon Container */}
              <div className="relative w-40 h-40 bg-[#0f172a] rounded-full border-4 border-slate-800 flex items-center justify-center shadow-2xl overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/10 to-transparent"></div>
                  
                  {/* Floating Icons Animation */}
                  <div className="absolute inset-0 flex items-center justify-center">
                      <i className="fas fa-book-open text-6xl text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.4)] animate-bounce-slow"></i>
                  </div>
                  
                  {/* Padlock Overlay */}
                  <div className="absolute bottom-4 right-4 w-12 h-12 bg-game-primary rounded-2xl flex items-center justify-center text-white border-4 border-[#0f172a] shadow-lg animate__animated animate__zoomIn animate__delay-1s">
                      <i className="fas fa-lock"></i>
                  </div>
              </div>
          </div>

          <div className="animate__animated animate__fadeInUp">
              <h2 className="text-5xl font-black text-white italic tracking-tighter leading-none mb-4">
                  COMING <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">SOON</span>
              </h2>
              
              <div className="h-1.5 w-20 bg-gradient-to-r from-cyan-500 to-transparent rounded-full mx-auto mb-8"></div>
              
              <p className="text-slate-400 font-bold text-lg max-w-sm mx-auto leading-relaxed">
                  We are building a massive repository of Form 4 study materials, past papers, and PDF guides.
              </p>

              <div className="mt-12 space-y-4">
                  <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-slate-800/40 border border-slate-700/50 text-cyan-400 text-xs font-black uppercase tracking-widest">
                      <i className="fas fa-hammer animate-pulse"></i>
                      Under Construction
                  </div>
                  
                  <div className="pt-4">
                      <button 
                        onClick={() => navigate('/')}
                        className="bg-white text-slate-950 px-10 py-4 rounded-[1.5rem] font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all hover:bg-cyan-50"
                      >
                        Return to Arena
                      </button>
                  </div>
              </div>
          </div>
      </div>

      {/* Grid Floor Effect */}
      <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-[linear-gradient(to_bottom,transparent_0%,#0f172a_100%),linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] [transform:perspective(500px)_rotateX(60deg)_translateY(100px)] opacity-20 pointer-events-none origin-bottom"></div>
      
      <style>{`
        @keyframes bounce-slow {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-15px); }
        }
        .animate-bounce-slow {
            animation: bounce-slow 4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default LibraryPage;
