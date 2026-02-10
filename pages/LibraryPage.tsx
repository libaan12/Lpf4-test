
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import { StudyMaterial } from '../types';
import { Card, Button } from '../components/UI';
import { playSound } from '../services/audioService';

const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  
  // Instant initialization from cache to prevent "long loading" blank states
  const [materials, setMaterials] = useState<StudyMaterial[]>(() => {
      const cached = localStorage.getItem('library_cache');
      if (cached) {
          try {
              const data = JSON.parse(cached);
              return Object.keys(data).map(key => ({ ...data[key], id: key }));
          } catch (e) { return []; }
      }
      return [];
  });

  const [activeCategory, setActiveCategory] = useState<'all' | 'exams' | 'subjects'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPdf, setSelectedPdf] = useState<StudyMaterial | null>(null);
  const [loading, setLoading] = useState(!localStorage.getItem('library_cache'));

  // PDF Viewer UI State
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [readerKey, setReaderKey] = useState(0); 

  useEffect(() => {
    // Real-time Firebase Sync in background
    const matRef = ref(db, 'studyMaterials');
    const unsub = onValue(matRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            localStorage.setItem('library_cache', JSON.stringify(data));
            const list = Object.keys(data).map(key => ({ ...data[key], id: key }));
            setMaterials(list);
        } else {
            setMaterials([]);
        }
        setLoading(false);
    });
    return () => off(matRef);
  }, []);

  const filteredMaterials = materials.filter(m => {
      const matchesCategory = activeCategory === 'all' || m.category === activeCategory;
      const matchesSearch = m.fileName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           m.subjectName.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesCategory && matchesSearch;
  });

  const openReader = (item: StudyMaterial) => {
      playSound('click');
      setSelectedPdf(item);
      setIframeLoading(true);
      setIframeError(false);
      setReaderKey(prev => prev + 1);
      
      // Snappier timeout for slow connections (Reduced from 12s to 6s)
      const timer = setTimeout(() => {
          setIframeLoading(current => {
              if (current) setIframeError(true);
              return false;
          });
      }, 6000);

      return () => clearTimeout(timer);
  };

  const closeReader = () => {
      setSelectedPdf(null);
      setIframeError(false);
      setIframeLoading(false);
  };

  const handleRetry = () => {
      setIframeError(false);
      setIframeLoading(true);
      setReaderKey(prev => prev + 1);
      
      // Snappier timeout (Reduced from 12s to 6s)
      const timer = setTimeout(() => {
          setIframeLoading(current => {
              if (current) setIframeError(true);
              return false;
          });
      }, 6000);
  };

  if (selectedPdf) {
      // Re-implementing the Google Docs Viewer Wrapper
      const viewerUrl = `https://docs.google.com/gview?url=${encodeURIComponent(selectedPdf.fileURL)}&embedded=true`;

      return (
          <div className="fixed inset-0 z-[100] bg-[#050b14] flex flex-col animate__animated animate__fadeIn">
              {/* Reader Header */}
              <div className="h-16 bg-[#0f172a] border-b border-white/5 flex items-center justify-between px-4 shadow-2xl">
                  <button 
                    onClick={closeReader} 
                    className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center hover:bg-red-500 transition-all active:scale-90"
                  >
                      <i className="fas fa-times"></i>
                  </button>
                  <div className="flex-1 px-6 min-w-0 text-center">
                      <h2 className="text-white font-black text-sm truncate uppercase tracking-tight">{selectedPdf.fileName}</h2>
                      <p className="text-[9px] text-cyan-500 font-black uppercase tracking-[0.2em]">{selectedPdf.subjectName}</p>
                  </div>
                  <button 
                    onClick={handleRetry} 
                    className="w-10 h-10 rounded-xl bg-slate-800 text-cyan-400 flex items-center justify-center hover:bg-slate-700 transition-all active:scale-90"
                  >
                      <i className="fas fa-redo-alt"></i>
                  </button>
              </div>

              {/* Reader Body */}
              <div className="flex-1 relative bg-slate-900 overflow-hidden">
                  {/* Syncing Overlay */}
                  {iframeLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-[#050b14]/90 backdrop-blur-md">
                           <div className="w-12 h-12 border-4 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
                           <p className="text-cyan-500 font-black text-[10px] uppercase tracking-[0.4em] animate-pulse">Loading...</p>
                      </div>
                  )}

                  {/* Bad Internet / Dead Link Fallback */}
                  {iframeError ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center z-30 p-10 text-center bg-[#050b14]">
                           <div className="w-20 h-20 bg-red-900/10 rounded-[2rem] flex items-center justify-center mb-8 border-2 border-red-500/20 animate__animated animate__shakeX">
                               <i className="fas fa-wifi-slash text-3xl text-red-500"></i>
                           </div>
                           <h3 className="text-2xl font-black text-white mb-3 tracking-tighter uppercase italic leading-tight">Link Timeout</h3>
                           <p className="text-slate-400 font-bold text-sm max-w-xs mb-10 leading-relaxed">
                               The document is taking too long to respond.
                           </p>
                           <div className="flex flex-col gap-4 w-full max-w-xs">
                               <Button 
                                onClick={handleRetry} 
                                fullWidth 
                                className="shadow-lg shadow-cyan-500/20 py-4"
                               >
                                   <i className="fas fa-sync-alt mr-2"></i> TRY AGAIN
                               </Button>
                               <button 
                                onClick={closeReader} 
                                className="text-slate-500 font-black text-[10px] uppercase tracking-[0.3em] hover:text-white transition-colors py-2"
                               >
                                   BACK TO LIBRARY
                               </button>
                           </div>
                      </div>
                  ) : (
                      <iframe 
                        key={readerKey}
                        src={viewerUrl}
                        className="w-full h-full border-none bg-white"
                        onLoad={() => setIframeLoading(false)}
                        onError={() => setIframeError(true)}
                        title="LP Embedded Reader"
                        allow="autoplay"
                      />
                  )}
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#050b14] font-sans flex flex-col relative overflow-hidden pb-32">
      
      {/* Background Ambient Effects */}
      <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none"></div>
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-indigo-900/10 to-transparent pointer-events-none"></div>

      {/* HEADER SECTION */}
      <div className="pt-8 px-6 pb-6 relative z-10 sticky top-0 bg-[#050b14]/90 backdrop-blur-xl border-b border-white/5 shadow-2xl">
          <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                  <button 
                    onClick={() => navigate('/')} 
                    className="w-12 h-12 rounded-2xl bg-slate-800/50 border border-slate-700 text-slate-400 flex items-center justify-center shadow-lg active:scale-95 transition-all"
                  >
                    <i className="fas fa-arrow-left"></i>
                  </button>
                  <div>
                    <h1 className="text-2xl font-black text-white uppercase tracking-tighter italic leading-none">Archives</h1>
                    <span className="text-[10px] text-cyan-500 font-black uppercase tracking-[0.3em]">Knowledge Bank</span>
                  </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                <i className="fas fa-book-reader text-xl"></i>
              </div>
          </div>

          {/* Search Box */}
          <div className="relative mb-8 group">
              <div className="absolute inset-0 bg-cyan-500/5 rounded-2xl blur-lg opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
              <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-500 z-10 transition-colors group-focus-within:text-cyan-400"></i>
              <input 
                type="text" 
                placeholder="Search PDF Title or Subject..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0f172a] border-2 border-slate-800 rounded-2xl py-4.5 pl-14 pr-6 text-white font-bold text-sm focus:border-cyan-500/50 outline-none transition-all shadow-inner relative z-0"
              />
          </div>

          {/* Precision Categories */}
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1 px-1">
              {[
                  { id: 'all', label: 'All Files', icon: 'fa-globe' },
                  { id: 'exams', label: 'National Exams', icon: 'fa-medal' },
                  { id: 'subjects', label: 'Subject PDFs', icon: 'fa-book' }
              ].map(cat => (
                  <button 
                    key={cat.id}
                    onClick={() => { setActiveCategory(cat.id as any); playSound('click'); }}
                    className={`px-6 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] whitespace-nowrap transition-all border-2 flex items-center gap-3 shrink-0 shadow-xl ${activeCategory === cat.id ? 'bg-cyan-500 border-white/20 text-[#050b14] shadow-cyan-500/20 scale-105' : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                      <i className={`fas ${cat.icon}`}></i>
                      {cat.label}
                  </button>
              ))}
          </div>
      </div>

      {/* DOCUMENT LIST */}
      <div className="flex-1 p-6 relative z-10 overflow-y-auto custom-scrollbar">
          {loading && materials.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32">
                  <div className="w-12 h-12 border-4 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin mb-6"></div>
                  <p className="font-black text-[10px] uppercase tracking-[0.4em] text-slate-500 animate-pulse">Loading...</p>
              </div>
          ) : filteredMaterials.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center opacity-40">
                  <div className="w-24 h-24 bg-slate-800/50 rounded-[2.5rem] flex items-center justify-center text-slate-600 mb-6 border border-slate-700/50">
                      <i className="fas fa-folder-open text-4xl"></i>
                  </div>
                  <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase">No Results</h3>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-2">Adjust your filters or query</p>
              </div>
          ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {filteredMaterials.map(item => {
                      const isExam = item.category === 'exams';
                      return (
                          <div 
                            key={item.id} 
                            onClick={() => openReader(item)}
                            className="bg-[#0f172a]/60 backdrop-blur-sm border-2 border-slate-800 hover:border-cyan-500/50 group transition-all cursor-pointer relative overflow-hidden rounded-[2rem] p-5 shadow-xl hover:shadow-cyan-500/5 active:scale-[0.98]"
                          >
                              {/* Background Visual Hint */}
                              <div className={`absolute -right-4 -bottom-4 text-8xl opacity-[0.03] rotate-12 transition-transform group-hover:scale-110 group-hover:rotate-0 ${isExam ? 'text-orange-500' : 'text-cyan-500'}`}>
                                  <i className={`fas ${isExam ? 'fa-graduation-cap' : 'fa-file-pdf'}`}></i>
                              </div>

                              <div className="flex items-center gap-5 relative z-10">
                                  <div className={`w-16 h-16 rounded-[1.2rem] flex items-center justify-center text-3xl shadow-2xl border border-white/5 transition-all group-hover:bg-cyan-500 group-hover:text-[#050b14] ${isExam ? 'bg-orange-500/10 text-orange-500' : 'bg-cyan-500/10 text-cyan-500'}`}>
                                      <i className={`fas ${isExam ? 'fa-scroll' : 'fa-file-alt'}`}></i>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <h4 className="text-white font-black text-base truncate leading-tight mb-2 group-hover:text-cyan-400 transition-colors uppercase italic">{item.fileName}</h4>
                                      <div className="flex items-center gap-2">
                                          <span className={`text-[8px] font-black uppercase px-2.5 py-1 rounded-lg border tracking-widest ${isExam ? 'bg-orange-900/20 border-orange-500/30 text-orange-400' : 'bg-cyan-900/20 border-cyan-500/30 text-cyan-400'}`}>
                                              {item.subjectName}
                                          </span>
                                          <span className="text-[8px] text-slate-600 font-black uppercase tracking-[0.2em] ml-1">Cloud Access</span>
                                      </div>
                                  </div>
                                  <div className="w-10 h-10 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-600 group-hover:bg-cyan-500 group-hover:text-[#050b14] group-hover:scale-110 transition-all border border-white/5">
                                      <i className="fas fa-book-open text-xs"></i>
                                  </div>
                              </div>
                          </div>
                      );
                  })}
              </div>
          )}
      </div>

      {/* Static Footer Indicator */}
      <div className="fixed bottom-24 left-0 right-0 flex justify-center pointer-events-none opacity-20">
          <div className="px-6 py-2 rounded-full border border-white/5 bg-slate-900/50 backdrop-blur-sm">
             <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.5em]">End of Records</span>
          </div>
      </div>
    </div>
  );
};

export default LibraryPage;
