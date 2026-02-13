
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import { StudyMaterial } from '../types';
import { Card, Button } from '../components/UI';
import { playSound } from '../services/audioService';

const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const adWrapperRef = useRef<HTMLDivElement>(null);
  
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

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeSubject, setActiveSubject] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  // Meta options from DB
  const [libCategories, setLibCategories] = useState<string[]>([]);
  const [libSubjects, setLibSubjects] = useState<string[]>([]);
  const [isLibraryEnabled, setIsLibraryEnabled] = useState<boolean>(true);
  
  const [selectedPdf, setSelectedPdf] = useState<StudyMaterial | null>(null);
  const [loading, setLoading] = useState(!localStorage.getItem('library_cache'));

  // PDF Viewer UI State
  const [iframeLoading, setIframeLoading] = useState(true);
  const [iframeError, setIframeError] = useState(false);
  const [readerKey, setReaderKey] = useState(0); 
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Define filteredMaterials before hooks to avoid Temporal Dead Zone issues in dependency arrays
  const filteredMaterials = materials.filter(m => {
      const matchesCategory = activeCategory === 'all' || m.category === activeCategory;
      const matchesSubject = activeSubject === 'all' || m.subjectName === activeSubject;
      
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        m.fileName.toLowerCase().includes(searchLower) || 
        m.subjectName.toLowerCase().includes(searchLower) ||
        (m.keywords && m.keywords.toLowerCase().includes(searchLower)) ||
        m.category.toLowerCase().includes(searchLower);

      return matchesCategory && matchesSubject && matchesSearch;
  });

  // Clean Adsterra Integration: Banner only, no auto-redirections, duplication-safe.
  useEffect(() => {
    // Only load the banner if the library is enabled and a PDF isn't currently being viewed.
    if (isLibraryEnabled && !selectedPdf && adWrapperRef.current) {
        const adWrapper = adWrapperRef.current;
        const SCRIPT_URL = "https://pl28709979.effectivegatecpm.com/b7749c6413cf35935cfa37b468c20ce2/invoke.js";
        
        // Safety check to prevent duplicate injections on re-renders
        if (adWrapper.querySelector('script')) return;
        
        // Clear wrapper for a fresh injection state
        adWrapper.innerHTML = '';
        
        // Create the specific container div required by the Adsterra script
        const container = document.createElement('div');
        container.id = 'container-b7749c6413cf35935cfa37b468c20ce2';
        container.className = "w-full flex justify-center";
        adWrapper.appendChild(container);

        // Inject the invocation script
        const script = document.createElement('script');
        script.src = SCRIPT_URL;
        script.async = true;
        script.setAttribute('data-cfasync', 'false');
        adWrapper.appendChild(script);

        return () => {
            // Cleanup on hide (important for maintaining ad network policies and app stability)
            if (adWrapper) adWrapper.innerHTML = '';
        };
    }
  }, [isLibraryEnabled, selectedPdf]); // Removed filteredMaterials.length to prevent flickering/re-triggers on typing

  // Click Outside logic for filter panel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterOpen]);

  useEffect(() => {
    // 1. Meta Settings Listener
    const libSettingsRef = ref(db, 'settings/library');
    onValue(libSettingsRef, (snap) => {
        if (snap.exists()) {
            const data = snap.val();
            setLibCategories(Object.values(data.categories || {}));
            setLibSubjects(Object.values(data.subjects || {}));
            setIsLibraryEnabled(data.enabled !== false);
        }
    });

    // 2. Real-time Firebase Sync in background
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
    return () => {
        off(matRef);
        off(libSettingsRef);
    };
  }, []);

  const openReader = (item: StudyMaterial) => {
      playSound('click');
      setSelectedPdf(item);
      setIframeLoading(true);
      setIframeError(false);
      setReaderKey(prev => prev + 1);
  };

  const closeReader = () => {
      setSelectedPdf(null);
      setIframeError(false);
      setIframeLoading(false);
  };

  const handleRetry = () => {
      if (isRefreshing) return;
      setIsRefreshing(true);
      setIframeError(false);
      setIframeLoading(true);
      setReaderKey(prev => prev + 1);
      playSound('click');
      
      setTimeout(() => setIsRefreshing(false), 1000);
  };

  if (!isLibraryEnabled) {
      return (
          <div className="min-h-screen bg-[#050b14] font-sans flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] bg-cyan-900/10 rounded-full blur-[128px] animate-pulse"></div>
              
              <div className="relative z-10 animate__animated animate__zoomIn">
                  <div className="w-32 h-32 bg-slate-900/50 rounded-[3rem] border-4 border-slate-800 flex items-center justify-center mx-auto mb-10 shadow-2xl relative group">
                      <div className="absolute inset-0 bg-cyan-500/10 rounded-[3rem] blur-xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                      <i className="fas fa-lock text-5xl text-slate-700 animate-pulse"></i>
                      <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-game-primary rounded-2xl flex items-center justify-center text-slate-950 shadow-lg rotate-12">
                          <i className="fas fa-tools text-xl"></i>
                      </div>
                  </div>
                  
                  <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-4 drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]">Archive Restricted</h1>
                  <p className="text-slate-500 font-bold text-sm max-w-xs mx-auto leading-relaxed mb-10">
                      The Knowledge Bank is currently being recalibrated by the administrators. Full access will be restored shortly.
                  </p>
                  
                  <div className="flex flex-col gap-4 max-w-xs mx-auto w-full">
                      <div className="bg-[#1e293b]/50 border border-white/5 py-4 px-6 rounded-2xl flex items-center gap-4">
                          <div className="w-1.5 h-1.5 rounded-full bg-game-primary animate-ping"></div>
                          <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Deployment in progress...</span>
                      </div>
                      <Button fullWidth onClick={() => navigate('/')} className="shadow-2xl !py-5">
                          Return to Base
                      </Button>
                  </div>
              </div>
          </div>
      );
  }

  if (selectedPdf) {
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
                    disabled={isRefreshing}
                    className={`w-10 h-10 rounded-xl bg-slate-800 text-cyan-400 flex items-center justify-center transition-all duration-300 ${isRefreshing ? 'bg-cyan-500/20 text-white shadow-[0_0_20px_rgba(34,211,238,0.4)] ring-2 ring-cyan-500/30' : 'hover:bg-slate-700 active:scale-90'}`}
                  >
                      <i className={`fas fa-redo-alt ${isRefreshing ? 'animate-spin' : 'transition-transform duration-500 group-hover:rotate-180'}`}></i>
                  </button>
              </div>

              {/* Reader Body */}
              <div className="flex-1 relative bg-slate-900 overflow-hidden">
                  {iframeLoading && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-[#050b14]/90 backdrop-blur-md">
                           <div className="w-12 h-12 border-4 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin mb-4"></div>
                           <p className="text-cyan-500 font-black text-[10px] uppercase tracking-[0.4em] animate-pulse">Loading...</p>
                      </div>
                  )}

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
      <div className="pt-8 px-6 pb-6 relative z-30 sticky top-0 bg-[#050b14]/95 backdrop-blur-2xl border-b border-white/5 shadow-2xl">
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
              <div className="flex gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.2)]">
                    <i className="fas fa-book-reader text-xl"></i>
                  </div>
              </div>
          </div>

          {/* Search Box - Premium High-Fidelity CSS */}
          <div className="relative group">
              {/* Outer Glow Overlay */}
              <div className="absolute -inset-1 bg-gradient-to-r from-game-primary/20 via-cyan-500/10 to-blue-500/20 rounded-[2.5rem] blur-xl opacity-0 group-focus-within:opacity-100 transition-all duration-700 pointer-events-none"></div>
              
              <div className="relative flex items-center bg-[#0f172a] border-2 border-slate-800/80 rounded-[2rem] px-5 py-4.5 transition-all duration-300 focus-within:border-game-primary/60 focus-within:shadow-[0_0_30px_rgba(249,115,22,0.15)] focus-within:bg-[#121a2d]">
                  <i className="fas fa-search text-slate-500 group-focus-within:text-game-primary transition-colors text-lg mr-4"></i>
                  <input 
                    type="text" 
                    placeholder="Search Title, Category, or Keywords..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-1 bg-transparent border-none text-white font-bold text-sm outline-none placeholder:text-slate-600 focus:placeholder:text-slate-500 transition-all"
                  />
                  {searchTerm && (
                      <button 
                        onClick={() => setSearchTerm('')}
                        className="ml-2 w-8 h-8 rounded-full bg-slate-800 text-slate-500 flex items-center justify-center hover:text-white hover:bg-slate-700 transition-all active:scale-90"
                      >
                          <i className="fas fa-times text-xs"></i>
                      </button>
                  )}
              </div>
          </div>

          {/* Refine Section Header */}
          <div className="flex items-center justify-between mt-6 px-1">
              <div className="flex items-center gap-3 flex-1">
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest whitespace-nowrap">Refine Archives</span>
                  <div className="h-px w-full bg-slate-800/50"></div>
              </div>
              <button 
                onClick={() => { setIsFilterOpen(!isFilterOpen); playSound('click'); }}
                className={`ml-4 flex items-center gap-3 px-6 py-3 rounded-2xl border transition-all shadow-xl active:scale-95 ${isFilterOpen ? 'bg-game-primary border-white/20 text-slate-950 scale-105 shadow-game-primary/20' : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:border-slate-500'}`}
              >
                <i className={`fas ${isFilterOpen ? 'fa-times' : 'fa-sliders-h'} text-xs`}></i>
                <span className="text-[10px] font-black uppercase tracking-wider">{isFilterOpen ? 'Close' : 'Filters'}</span>
              </button>
          </div>

          {/* Advanced Filter Panel - Slide Down with Outside Click Support */}
          {isFilterOpen && (
              <div 
                ref={filterPanelRef}
                className="mt-5 animate__animated animate__fadeInDown p-6 bg-slate-900/95 backdrop-blur-xl rounded-[2.5rem] border border-slate-800 shadow-2xl space-y-7 ring-1 ring-white/5 relative overflow-hidden"
              >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-game-primary/5 blur-3xl rounded-full"></div>
                  
                  {/* Category Pills */}
                  <div>
                      <div className="flex items-center gap-2 mb-4 ml-1">
                         <i className="fas fa-layer-group text-game-primary text-[10px]"></i>
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Category</h4>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                          <button 
                            onClick={() => { setActiveCategory('all'); playSound('click'); }}
                            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border-2 ${activeCategory === 'all' ? 'bg-game-primary border-white/20 text-slate-950 shadow-lg shadow-game-primary/20' : 'bg-slate-800/50 border-slate-800 text-slate-500'}`}
                          >All Records</button>
                          {libCategories.map(cat => (
                              <button 
                                key={cat}
                                onClick={() => { setActiveCategory(cat); playSound('click'); }}
                                className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border-2 ${activeCategory === cat ? 'bg-game-primary border-white/20 text-slate-950 shadow-lg shadow-game-primary/20' : 'bg-slate-800/50 border-slate-800 text-slate-500'}`}
                              >{cat}</button>
                          ))}
                      </div>
                  </div>

                  {/* Subject Dropdown - Enhanced Theme Styled */}
                  <div>
                      <div className="flex items-center gap-2 mb-4 ml-1">
                         <i className="fas fa-tags text-game-primary text-[10px]"></i>
                         <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filter by Subject</h4>
                      </div>
                      <div className="relative group">
                          <select 
                            value={activeSubject}
                            onChange={(e) => { setActiveSubject(e.target.value); playSound('click'); }}
                            className="w-full p-4.5 bg-[#050b14] border-2 border-slate-800 rounded-2xl text-white font-black text-xs uppercase tracking-widest appearance-none outline-none focus:border-game-primary/50 transition-all shadow-inner cursor-pointer"
                          >
                            <option value="all">All Available Subjects</option>
                            {libSubjects.map(sub => (
                                <option key={sub} value={sub}>{sub}</option>
                            ))}
                          </select>
                          <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-600 transition-colors group-hover:text-game-primary">
                             <i className="fas fa-chevron-down"></i>
                          </div>
                      </div>
                  </div>

                  <div className="pt-3 border-t border-white/5 flex justify-between items-center">
                      <button 
                        onClick={() => { setActiveCategory('all'); setActiveSubject('all'); setSearchTerm(''); playSound('click'); }}
                        className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] hover:text-white transition-colors"
                      >
                        Reset All
                      </button>
                      <span className="text-[9px] font-black text-game-primary uppercase tracking-widest">{filteredMaterials.length} Results</span>
                  </div>
              </div>
          )}
      </div>

      {/* DOCUMENT LIST */}
      <div className="flex-1 p-6 relative z-10 overflow-y-auto custom-scrollbar">
          {loading && materials.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32">
                  <div className="w-12 h-12 border-4 border-cyan-500/10 border-t-cyan-500 rounded-full animate-spin mb-6"></div>
                  <p className="font-black text-[10px] uppercase tracking-[0.4em] text-slate-500 animate-pulse">Scanning Archive...</p>
              </div>
          ) : filteredMaterials.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center opacity-40">
                  <div className="w-24 h-24 bg-slate-800/50 rounded-[2.5rem] flex items-center justify-center text-slate-600 mb-6 border border-slate-700/50">
                      <i className="fas fa-folder-open text-4xl"></i>
                  </div>
                  <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase">No Records</h3>
                  <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-2">Adjust search or filters</p>
              </div>
          ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-10">
                  {filteredMaterials.map(item => (
                      <div 
                        key={item.id} 
                        onClick={() => openReader(item)}
                        className="bg-[#0f172a]/60 backdrop-blur-sm border-2 border-slate-800 hover:border-game-primary/40 group transition-all cursor-pointer relative overflow-hidden rounded-[2.5rem] p-6 shadow-xl hover:shadow-game-primary/5 active:scale-[0.98]"
                      >
                          {/* Background Visual Hint */}
                          <div className={`absolute -right-4 -bottom-4 text-8xl opacity-[0.03] rotate-12 transition-transform group-hover:scale-110 group-hover:rotate-0 text-cyan-500`}>
                              <i className="fas fa-file-pdf"></i>
                          </div>

                          <div className="flex items-center gap-6 relative z-10">
                              <div className="w-18 h-18 rounded-[1.5rem] bg-game-primary/5 text-game-primary flex items-center justify-center text-3xl shadow-2xl border border-white/5 transition-all group-hover:bg-game-primary group-hover:text-slate-950">
                                  <i className="fas fa-file-alt"></i>
                              </div>
                              <div className="flex-1 min-w-0">
                                  <h4 className="text-white font-black text-base truncate leading-tight mb-3 group-hover:text-game-primary transition-colors uppercase italic tracking-tight">{item.fileName}</h4>
                                  <div className="flex flex-wrap gap-2">
                                      <span className="text-[8px] font-black uppercase px-3 py-1.5 rounded-xl border tracking-widest bg-cyan-900/20 border-cyan-500/30 text-cyan-400">
                                          {item.subjectName}
                                      </span>
                                      <span className="text-[8px] font-black uppercase px-3 py-1.5 rounded-xl border tracking-widest bg-orange-900/20 border-orange-500/30 text-orange-400">
                                          {item.category}
                                      </span>
                                  </div>
                              </div>
                              <div className="w-11 h-11 rounded-full bg-slate-800/50 flex items-center justify-center text-slate-500 group-hover:bg-game-primary group-hover:text-slate-950 group-hover:scale-110 transition-all border border-white/5">
                                  <i className="fas fa-book-open text-xs"></i>
                              </div>
                          </div>
                      </div>
                  ))}
              </div>
          )}

          {/* Adsterra Integration with Duplication Prevention & 4:1 Ratio Container */}
          <div className="mt-12 mb-8 flex flex-col items-center w-full max-w-xl mx-auto px-4 animate__animated animate__fadeIn">
             <div className="w-full flex items-center gap-2 mb-3">
                 <span className="text-[7px] font-black text-slate-600 uppercase tracking-[0.3em] whitespace-nowrap">Sponsored Resource</span>
                 <div className="h-px w-full bg-slate-800/30"></div>
             </div>
             
             {/* 4:1 Aspect Ratio Container Wrapper */}
             <div className="w-full aspect-[4/1] bg-[#0f172a]/40 rounded-[1.5rem] border border-white/5 flex items-center justify-center overflow-hidden shadow-2xl relative">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent pointer-events-none"></div>
                <div ref={adWrapperRef} className="w-full flex justify-center">
                    {/* invoke.js will inject into container-b7749c6413cf35935cfa37b468c20ce2 inside here */}
                </div>
             </div>
             <p className="text-[6px] text-slate-700 mt-2 font-bold uppercase">Supported by Adsterra Network</p>
          </div>
      </div>

      {/* Static Footer Indicator */}
      <div className="fixed bottom-24 left-0 right-0 flex justify-center pointer-events-none opacity-20">
          <div className="px-6 py-2 rounded-full border border-white/5 bg-slate-900/50 backdrop-blur-sm">
             <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.5em]">Secure Archive Connection</span>
          </div>
      </div>
    </div>
  );
};

export default LibraryPage;
