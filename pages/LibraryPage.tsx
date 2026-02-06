
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import { Subject, StudyMaterial } from '../types';
import { Card } from '../components/UI';
import { showToast } from '../services/alert';

const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>(''); // New Search State
  const [loading, setLoading] = useState(true);
  
  // PDF Viewer State
  const [viewingPdf, setViewingPdf] = useState<StudyMaterial | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  // 1. Fetch Subjects
  useEffect(() => {
    const subRef = ref(db, 'subjects');
    const unsub = onValue(subRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const list = (Object.values(data) as Subject[]).filter(s => s && s.id && s.name);
            setSubjects(list);
        }
    });
    return () => off(subRef);
  }, []);

  // 2. Fetch Materials
  useEffect(() => {
      const matRef = ref(db, 'studyMaterials');
      const unsub = onValue(matRef, (snapshot) => {
          if (snapshot.exists()) {
              const data = snapshot.val();
              const list = Object.values(data) as StudyMaterial[];
              setMaterials(list.sort((a,b) => b.uploadDate - a.uploadDate)); // Newest first
          }
          setLoading(false);
      });
      return () => off(matRef);
  }, []);

  // 3. Handle PDF Blob Creation for Viewer
  useEffect(() => {
      if (viewingPdf) {
          try {
              if (viewingPdf.fileURL.startsWith('data:')) {
                  const blob = dataURItoBlob(viewingPdf.fileURL);
                  const url = URL.createObjectURL(blob);
                  setPdfUrl(url);
              } else {
                  setPdfUrl(viewingPdf.fileURL);
              }
          } catch (e) {
              console.error("Error creating PDF URL", e);
              setPdfUrl(null);
          }
      } else {
          // Cleanup Blob URL to prevent memory leaks
          if (pdfUrl && pdfUrl.startsWith('blob:')) {
              URL.revokeObjectURL(pdfUrl);
          }
          setPdfUrl(null);
      }
  }, [viewingPdf]);

  // Helper to convert Base64 Data URI to Blob
  const dataURItoBlob = (dataURI: string) => {
      const split = dataURI.split(',');
      const byteString = atob(split[1]);
      const mimeString = split[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
      }
      return new Blob([ab], { type: mimeString });
  };

  // Updated Filter Logic: Subject + Search
  const filteredMaterials = useMemo(() => {
      return materials.filter(m => {
          const matchSubject = selectedSubject === 'all' || m.subjectName === selectedSubject;
          const matchSearch = m.fileName.toLowerCase().includes(searchQuery.toLowerCase());
          return matchSubject && matchSearch;
      });
  }, [materials, selectedSubject, searchQuery]);

  const handleDownload = (material: StudyMaterial) => {
      try {
          const link = document.createElement('a');
          link.download = material.fileName.endsWith('.pdf') ? material.fileName : `${material.fileName}.pdf`;

          if (material.fileURL.startsWith('data:')) {
                const blob = dataURItoBlob(material.fileURL);
                const blobUrl = URL.createObjectURL(blob);
                link.href = blobUrl;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                // EXTENDED TIMEOUT: 2 minutes to ensure mobile download manager picks it up
                // before the URL is revoked.
                setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
          } else {
                link.href = material.fileURL;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
          }
          showToast("Download started...", "success");
      } catch (e) {
          console.error("Download failed", e);
          showToast("Download failed", "error");
      }
  };

  const handleDownloadCurrent = () => {
      if (viewingPdf) {
          handleDownload(viewingPdf);
      }
  };

  return (
    <div className="min-h-screen bg-[#050b14] font-sans flex flex-col relative overflow-hidden pb-24">
      
      {/* Abstract Background Elements */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none"></div>
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* --- HEADER SECTION --- */}
      <div className="pt-8 px-6 pb-6 relative z-10">
          <div className="flex items-start justify-between mb-8">
              <button 
                onClick={() => navigate('/')} 
                className="w-12 h-12 rounded-2xl bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-all active:scale-95 shadow-lg backdrop-blur-md"
              >
                  <i className="fas fa-arrow-left"></i>
              </button>
              
              <div className="text-right">
                  <h1 className="text-4xl font-black text-white uppercase tracking-tighter leading-none mb-1">
                      Library
                  </h1>
              </div>
          </div>

          {/* --- CONTROL BAR (Search & Filter) --- */}
          <div className="flex flex-col md:flex-row gap-4">
              
              {/* Search Input */}
              <div className="flex-1 relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <i className="fas fa-search text-slate-500 group-focus-within:text-cyan-400 transition-colors"></i>
                  </div>
                  <input 
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search files..."
                      className="w-full bg-[#1e293b]/80 border border-slate-700/50 rounded-2xl py-4 pl-12 pr-4 text-white font-bold placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/10 transition-all shadow-inner backdrop-blur-sm"
                  />
                  {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute inset-y-0 right-0 pr-4 text-slate-500 hover:text-white">
                          <i className="fas fa-times"></i>
                      </button>
                  )}
              </div>

              {/* Subject Dropdown */}
              <div className="relative md:w-1/3 group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                      <i className="fas fa-filter text-slate-500 group-focus-within:text-cyan-400 transition-colors"></i>
                  </div>
                  <select 
                      value={selectedSubject}
                      onChange={(e) => setSelectedSubject(e.target.value)}
                      className="w-full h-full bg-[#1e293b]/80 border border-slate-700/50 rounded-2xl py-4 pl-12 pr-10 text-white font-bold appearance-none cursor-pointer focus:outline-none focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/10 transition-all shadow-lg backdrop-blur-sm"
                  >
                      <option value="all">All Subjects</option>
                      {subjects.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-slate-500">
                      <i className="fas fa-chevron-down text-xs"></i>
                  </div>
              </div>
          </div>
      </div>

      {/* --- CONTENT GRID --- */}
      <div className="flex-1 px-6 overflow-y-auto custom-scrollbar relative z-10">
          
          {/* Results Count */}
          <div className="flex justify-between items-center mb-4 px-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {filteredMaterials.length} {filteredMaterials.length === 1 ? 'Resource' : 'Resources'} Found
              </span>
              {loading && <i className="fas fa-circle-notch fa-spin text-cyan-500"></i>}
          </div>

          {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[...Array(6)].map((_, i) => (
                      <div key={i} className="h-28 bg-slate-800/50 border border-slate-700/30 rounded-[1.5rem] animate-pulse"></div>
                  ))}
              </div>
          ) : filteredMaterials.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center opacity-60 border-2 border-dashed border-slate-800 rounded-[2.5rem]">
                  <div className="w-20 h-20 bg-slate-800/50 rounded-full flex items-center justify-center mb-4 shadow-inner">
                      <i className="fas fa-search text-3xl text-slate-600"></i>
                  </div>
                  <h3 className="font-black text-slate-400 text-lg uppercase tracking-tight">System Empty</h3>
                  <p className="text-slate-600 text-xs mt-1 font-mono">No matching data files located.</p>
              </div>
          ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate__animated animate__fadeInUp">
                  {filteredMaterials.map((item) => {
                      const subject = subjects.find(s => s.id === item.subjectName);
                      return (
                          <div key={item.id} className="bg-[#1e293b]/60 backdrop-blur-md border border-slate-700/50 p-5 rounded-[1.8rem] hover:border-cyan-500/40 hover:bg-slate-800/80 transition-all group relative overflow-hidden shadow-lg">
                              {/* Decor line */}
                              <div className="absolute left-0 top-6 w-1 h-8 bg-cyan-500 rounded-r-full shadow-[0_0_10px_rgba(34,211,238,0.5)]"></div>
                              
                              <div className="flex items-start gap-4 pl-3 relative z-10">
                                  {/* Icon Box */}
                                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-xl shadow-inner shrink-0 group-hover:scale-105 transition-transform">
                                      <i className="fas fa-file-pdf text-red-400"></i>
                                  </div>
                                  
                                  {/* Info */}
                                  <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                          <span className="bg-cyan-900/30 text-cyan-400 text-[9px] font-black px-2 py-0.5 rounded border border-cyan-500/20 uppercase tracking-wide">
                                              {subject?.name || 'General'}
                                          </span>
                                      </div>
                                      <h3 className="font-bold text-white text-sm leading-snug mb-2 truncate pr-2">{item.fileName}</h3>
                                      <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 uppercase font-mono">
                                          <span className="flex items-center gap-1"><i className="fas fa-database text-slate-600"></i> {item.fileSize}</span>
                                          <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                                          <span>{new Date(item.uploadDate).toLocaleDateString()}</span>
                                      </div>
                                  </div>
                              </div>

                              {/* Actions */}
                              <div className="flex gap-2 mt-5 pl-3">
                                  <button 
                                      onClick={() => setViewingPdf(item)}
                                      className="flex-1 bg-slate-700/50 hover:bg-cyan-500 hover:text-white text-slate-300 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 border border-slate-600 hover:border-cyan-400"
                                  >
                                      <i className="fas fa-eye"></i> View
                                  </button>
                                  <button 
                                      onClick={() => handleDownload(item)}
                                      className="w-10 h-10 rounded-xl bg-slate-700/50 hover:bg-slate-600 text-slate-300 flex items-center justify-center border border-slate-600 transition-all active:scale-95"
                                      title="Download PDF"
                                  >
                                      <i className="fas fa-download"></i>
                                  </button>
                              </div>
                          </div>
                      );
                  })}
              </div>
          )}
      </div>

      {/* PDF Viewer Modal - Fullscreen Overlay */}
      {viewingPdf && (
          <div className="fixed inset-0 z-[100] bg-[#050b14]/95 backdrop-blur-xl flex flex-col animate__animated animate__fadeIn">
              <div className="bg-[#1e293b] p-4 flex justify-between items-center border-b border-slate-700 shadow-xl">
                  <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center text-red-500 border border-red-500/30">
                          <i className="fas fa-file-pdf"></i>
                      </div>
                      <div className="min-w-0">
                          <h3 className="font-bold text-white text-sm truncate max-w-[150px] md:max-w-xs">{viewingPdf.fileName}</h3>
                          <p className="text-[9px] text-slate-400 font-mono uppercase">{viewingPdf.fileSize} • Preview</p>
                      </div>
                  </div>
                  <div className="flex gap-3">
                      <button 
                        onClick={handleDownloadCurrent} 
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors hidden md:flex items-center gap-2"
                      >
                          <i className="fas fa-download"></i> Download
                      </button>
                      <button 
                        onClick={() => setViewingPdf(null)} 
                        className="w-9 h-9 rounded-full bg-slate-700 hover:bg-red-500 hover:text-white text-slate-400 flex items-center justify-center transition-colors"
                      >
                          <i className="fas fa-times"></i>
                      </button>
                  </div>
              </div>
              
              <div className="flex-1 w-full h-full bg-slate-900 relative flex flex-col items-center justify-center p-2">
                  {pdfUrl ? (
                      <object 
                        data={pdfUrl} 
                        type="application/pdf" 
                        className="w-full h-full rounded-xl border border-slate-700 shadow-2xl"
                      >
                          {/* Fallback for browsers that don't support Object/Embed PDF viewing (Mobile often falls here) */}
                          <div className="flex flex-col items-center justify-center h-full text-center p-6">
                              <i className="fas fa-file-pdf text-6xl text-slate-700 mb-4"></i>
                              <h3 className="text-xl font-bold text-white mb-2">Preview Not Available</h3>
                              <p className="text-slate-400 text-sm mb-6 max-w-md">
                                  Your browser does not support embedded PDF viewing. Please download the file to view it.
                              </p>
                              <button 
                                onClick={handleDownloadCurrent}
                                className="bg-game-primary text-white px-6 py-3 rounded-xl font-black text-sm shadow-lg hover:scale-105 transition-transform"
                              >
                                  <i className="fas fa-download mr-2"></i> Download PDF
                              </button>
                          </div>
                      </object>
                  ) : (
                      <div className="flex flex-col items-center justify-center">
                          <i className="fas fa-spinner fa-spin text-4xl text-cyan-500 mb-4"></i>
                          <p className="text-slate-400 font-bold">Loading Document...</p>
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

export default LibraryPage;
