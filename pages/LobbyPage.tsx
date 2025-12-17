import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, push, get, remove, set, onValue } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { Button, Input, Card, Avatar } from '../components/UI';
import { playSound } from '../services/audioService';
import { showToast } from '../services/alert';
import { MATCH_TIMEOUT_MS } from '../constants';
import { Subject, Chapter } from '../types';

const LobbyPage: React.FC = () => {
  const { user, profile } = useContext(UserContext);
  const navigate = useNavigate();
  
  // VIEW MODE: 'selection' | 'auto' | 'custom'
  const [viewMode, setViewMode] = useState<'selection' | 'auto' | 'custom'>('selection');
  
  // Selection State
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  
  // Custom Room Settings
  const [quizLimit, setQuizLimit] = useState<number>(10);

  // Match State
  const [matchStatus, setMatchStatus] = useState<string>('');
  const [roomCode, setRoomCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // Custom Room Host State
  const [hostedCode, setHostedCode] = useState<string | null>(null);

  // Queue State
  const [queueKey, setQueueKey] = useState<string | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const cachedSubjects = localStorage.getItem('subjects_cache');
    if (cachedSubjects) setSubjects(JSON.parse(cachedSubjects));

    const subRef = ref(db, 'subjects');
    get(subRef).then(snap => {
        if(snap.exists()) {
          const list = (Object.values(snap.val()) as Subject[]).filter(s => s && s.id && s.name);
          setSubjects(list);
          localStorage.setItem('subjects_cache', JSON.stringify(list));
        }
    });
  }, []);

  useEffect(() => {
    if (!selectedSubject) {
        setChapters([]);
        return;
    }
    const chapRef = ref(db, `chapters/${selectedSubject}`);
    get(chapRef).then(snap => {
        if(snap.exists()) {
            const list = Object.values(snap.val()) as Chapter[];
            // Add "All Chapters" option at the beginning
            const allOption: Chapter = {
                id: `ALL_${selectedSubject}`,
                name: 'All Operations (Random)',
                subjectId: selectedSubject
            };
            setChapters([allOption, ...list]);
            setSelectedChapter(allOption.id);
        } else {
            setChapters([]);
        }
    });
  }, [selectedSubject]);

  const handleAutoMatch = async () => {
    if (!user) return;
    if (!selectedChapter) {
        showToast("Select a battlefield first", "error");
        return;
    }

    setIsSearching(true);
    setMatchStatus('Scanning for opponents...');
    playSound('click');

    const queueRef = ref(db, `queue/${selectedChapter}`);
    const snapshot = await get(queueRef);
    let foundOpponent = false;

    if (snapshot.exists()) {
      const queueData = snapshot.val();
      const opponentKey = Object.keys(queueData).find(key => queueData[key].uid !== user.uid);

      if (opponentKey) {
          foundOpponent = true;
          const opponentUid = queueData[opponentKey].uid;
          await remove(ref(db, `queue/${selectedChapter}/${opponentKey}`));

          // Randomize limit for Ranked Match (10-20)
          const randomLimit = Math.floor(Math.random() * 11) + 10;

          const matchId = `match_${Date.now()}`;
          const matchData = {
            matchId,
            status: 'active',
            mode: 'auto',
            turn: user.uid, 
            currentQ: 0,
            scores: { [user.uid]: 0, [opponentUid]: 0 },
            subject: selectedChapter, // Can be specific ID or ALL_subjectId
            questionLimit: randomLimit,
            players: {
              [user.uid]: { name: user.displayName, avatar: '' },
              [opponentUid]: { name: 'Opponent', avatar: '' }
            },
            createdAt: Date.now()
          };

          await set(ref(db, `matches/${matchId}`), matchData);
          await set(ref(db, `users/${user.uid}/activeMatch`), matchId);
          await set(ref(db, `users/${opponentUid}/activeMatch`), matchId);
          return;
      }
    }
    
    if (!foundOpponent) {
      const newRef = push(queueRef);
      setQueueKey(newRef.key);
      await set(newRef, { uid: user.uid });
      setMatchStatus('Waiting in queue...');

      timerRef.current = setTimeout(async () => {
        if (isSearching) {
          const checkRef = await get(newRef);
          if (checkRef.exists()) {
             await remove(newRef);
             setQueueKey(null);
             setMatchStatus('No match found. Retrying...');
             setIsSearching(false);
          }
        }
      }, MATCH_TIMEOUT_MS);
    }
  };

  const cancelSearch = async () => {
    playSound('click');
    setIsSearching(false);
    setMatchStatus('');
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (queueKey && selectedChapter) {
      const myQueueRef = ref(db, `queue/${selectedChapter}/${queueKey}`);
      await remove(myQueueRef);
      setQueueKey(null);
    }
  };

  const createRoom = async () => {
    if(!user) return;
    if (!selectedChapter) {
        showToast("Select a topic to host", "error");
        return;
    }

    playSound('click');
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setHostedCode(code);
    
    await set(ref(db, `rooms/${code}`), {
      host: user.uid,
      sid: selectedSubject,
      lid: selectedChapter,
      questionLimit: quizLimit, // Host decides limit in custom
      createdAt: Date.now()
    });

    const roomRef = ref(db, `rooms/${code}`);
    onValue(roomRef, (snap) => {
       if (!snap.exists()) {
         setHostedCode(null);
       }
    });
  };

  const handleCopyCode = () => {
    if (hostedCode) {
      navigator.clipboard.writeText(hostedCode);
      showToast("Code copied to clipboard", "success");
    }
  };

  const joinRoom = async () => {
    if (!user || !roomCode) return;
    playSound('click');
    
    const roomRef = ref(db, `rooms/${roomCode}`);
    const snapshot = await get(roomRef);
    
    if (snapshot.exists()) {
      const roomData = snapshot.val();
      if (roomData.host === user.uid) {
        showToast("Cannot join your own room", "error");
        return;
      }

      const hostUid = roomData.host;
      const chapterId = roomData.lid;
      const qLimit = roomData.questionLimit || 10;

      await remove(roomRef);

      const matchId = `match_${Date.now()}`;
      await set(ref(db, `matches/${matchId}`), {
        matchId,
        status: 'active',
        mode: 'custom',
        questionLimit: qLimit,
        turn: hostUid,
        currentQ: 0,
        scores: { [hostUid]: 0, [user.uid]: 0 },
        subject: chapterId,
        players: {
            [hostUid]: { name: 'Host', avatar: '' },
            [user.uid]: { name: user.displayName, avatar: '' }
        }
      });

      await set(ref(db, `users/${hostUid}/activeMatch`), matchId);
      await set(ref(db, `users/${user.uid}/activeMatch`), matchId);
    } else {
      showToast("Invalid Room Code", "error");
    }
  };

  const handlePasteCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const code = text.trim().slice(0, 4);
        setRoomCode(code);
        showToast("Code pasted", "success");
      }
    } catch (e) {
      showToast("Clipboard access denied", "error");
    }
  };

  useEffect(() => {
    return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        if (hostedCode) {
            remove(ref(db, `rooms/${hostedCode}`));
        }
        if (queueKey && selectedChapter) {
            remove(ref(db, `queue/${selectedChapter}/${queueKey}`));
        }
    };
  }, [hostedCode, queueKey, selectedChapter]);

  const goBack = () => {
      if (isSearching) cancelSearch();
      if (hostedCode) {
        remove(ref(db, `rooms/${hostedCode}`));
        setHostedCode(null);
      }
      setViewMode('selection');
  };

  // --- SUB-COMPONENTS FOR GAME FEEL ---

  const SelectionUI = () => (
      <div className="w-full animate__animated animate__fadeIn">
          {/* Subject Bar - Horizontal Scroll */}
          <div className="mb-6">
              <label className="flex items-center text-xs font-black text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1 tracking-[0.2em]">
                  <i className="fas fa-book-open mr-2"></i> Select Discipline
              </label>
              <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar snap-x">
                  {subjects.map(s => (
                      <button 
                        key={s.id} 
                        onClick={() => { playSound('click'); setSelectedSubject(s.id); }}
                        className={`
                            snap-start shrink-0 px-6 py-4 rounded-2xl whitespace-nowrap text-sm font-black transition-all duration-300 border-2
                            ${selectedSubject === s.id 
                                ? 'bg-somali-blue text-white border-somali-blue shadow-[0_0_20px_rgba(65,137,221,0.4)] scale-105' 
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}
                        `}
                      >
                          {s.name.toUpperCase()}
                      </button>
                  ))}
              </div>
          </div>

          {/* Chapter Grid - Tactical Cards */}
          <div className="mb-6">
              <label className="flex items-center text-xs font-black text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1 tracking-[0.2em]">
                 <i className="fas fa-map-marker-alt mr-2"></i> Select Operation
              </label>
              {chapters.length > 0 ? (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {chapters.map(c => (
                        <div 
                            key={c.id}
                            onClick={() => { playSound('click'); setSelectedChapter(c.id); }}
                            className={`
                                relative cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 group overflow-hidden
                                ${selectedChapter === c.id 
                                    ? 'bg-gradient-to-br from-somali-blue/20 to-purple-500/20 border-somali-blue shadow-lg' 
                                    : 'bg-white dark:bg-gray-800 border-transparent hover:border-gray-300 dark:hover:border-gray-600'}
                            `}
                        >
                            <div className="flex items-center justify-between relative z-10">
                                <span className={`font-bold ${selectedChapter === c.id ? 'text-somali-blue dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                    {c.name}
                                </span>
                                {selectedChapter === c.id && <i className="fas fa-check-circle text-somali-blue text-xl animate__animated animate__zoomIn"></i>}
                            </div>
                            {/* Decorative Elements */}
                            <div className={`absolute -right-4 -bottom-4 text-6xl opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity ${selectedChapter === c.id ? 'text-somali-blue' : 'text-gray-500'}`}>
                                <i className="fas fa-crosshairs"></i>
                            </div>
                            {/* Special visual for ALL chapters */}
                            {c.id.startsWith('ALL_') && (
                                <div className="absolute top-0 right-0 p-2 opacity-10">
                                    <i className="fas fa-random text-4xl"></i>
                                </div>
                            )}
                        </div>
                    ))}
                 </div>
              ) : (
                  <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
                      <i className="fas fa-ban text-gray-400 text-3xl mb-2"></i>
                      <span className="text-gray-500 font-bold text-sm">{selectedSubject ? "No Operations Available" : "Select a Discipline First"}</span>
                  </div>
              )}
          </div>

          {/* Settings for Custom Room */}
          {viewMode === 'custom' && !hostedCode && (
              <div className="animate__animated animate__fadeInUp">
                <label className="flex items-center text-xs font-black text-gray-500 dark:text-gray-400 uppercase mb-3 ml-1 tracking-[0.2em]">
                    <i className="fas fa-cogs mr-2"></i> Mission Length
                </label>
                <div className="flex gap-2 p-1 bg-gray-200 dark:bg-gray-800 rounded-xl">
                    {[5, 10, 15, 20].map(n => (
                        <button
                            key={n}
                            onClick={() => { playSound('click'); setQuizLimit(n); }}
                            className={`flex-1 py-2 rounded-lg font-black text-sm transition-all ${quizLimit === n ? 'bg-white dark:bg-gray-700 text-somali-blue dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                        >
                            {n} Qs
                        </button>
                    ))}
                </div>
              </div>
          )}
      </div>
  );

  return (
    <div className="flex flex-col min-h-full relative pb-24 md:pb-8 w-full">
      {/* ... (Rest of the render return remains the same) ... */}
      {/* --- PHASE 1: MODE SELECTION (Battle HQ) --- */}
      {viewMode === 'selection' && (
        <div className="flex flex-col items-center justify-center p-6 min-h-[85vh] animate__animated animate__fadeIn">
             <div className="w-full max-w-5xl mx-auto">
                 {/* Header */}
                 <div className="flex items-center gap-4 mb-10">
                     <button onClick={() => navigate('/')} className="w-12 h-12 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-gray-800 dark:text-white hover:bg-white/20 transition-all">
                        <i className="fas fa-arrow-left"></i>
                     </button>
                     <div>
                        <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tighter uppercase italic">
                            Battle <span className="text-transparent bg-clip-text bg-gradient-to-r from-somali-blue to-purple-500">HQ</span>
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 font-bold tracking-widest text-xs uppercase">Select Game Mode</p>
                     </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     {/* RANKED CARD */}
                     <button 
                        onClick={() => { playSound('click'); setViewMode('auto'); }}
                        className="group relative h-80 rounded-[2.5rem] overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(59,130,246,0.5)] border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 text-left"
                     >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 opacity-90 group-hover:opacity-100 transition-opacity"></div>
                        <img src="https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-40 grayscale group-hover:grayscale-0 transition-all duration-700" />
                        
                        <div className="relative z-10 p-8 h-full flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30 shadow-inner group-hover:scale-110 transition-transform">
                                    <i className="fas fa-bolt text-3xl"></i>
                                </div>
                                <span className="bg-blue-500/20 border border-blue-400/30 text-blue-100 text-[10px] font-black uppercase px-3 py-1 rounded-full backdrop-blur-md">
                                    Popular
                                </span>
                            </div>
                            <div>
                                <h2 className="text-4xl font-black text-white mb-2 tracking-tight italic uppercase">Ranked Battle</h2>
                                <p className="text-blue-100 font-medium text-sm leading-relaxed max-w-xs">
                                    Quickly match with a random opponent. Earn points and climb the global leaderboard.
                                </p>
                            </div>
                        </div>
                     </button>

                     {/* CUSTOM CARD */}
                     <button 
                        onClick={() => { playSound('click'); setViewMode('custom'); }}
                        className="group relative h-80 rounded-[2.5rem] overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(249,115,22,0.5)] border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900 text-left"
                     >
                        <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-red-600 to-rose-900 opacity-90 group-hover:opacity-100 transition-opacity"></div>
                         <img src="https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&q=80" className="absolute inset-0 w-full h-full object-cover mix-blend-overlay opacity-40 grayscale group-hover:grayscale-0 transition-all duration-700" />

                        <div className="relative z-10 p-8 h-full flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white border border-white/30 shadow-inner group-hover:scale-110 transition-transform">
                                    <i className="fas fa-users-cog text-3xl"></i>
                                </div>
                                <span className="bg-orange-500/20 border border-orange-400/30 text-orange-100 text-[10px] font-black uppercase px-3 py-1 rounded-full backdrop-blur-md">
                                    Private
                                </span>
                            </div>
                            <div>
                                <h2 className="text-4xl font-black text-white mb-2 tracking-tight italic uppercase">Custom Lobby</h2>
                                <p className="text-orange-100 font-medium text-sm leading-relaxed max-w-xs">
                                    Create a private room for friends or join with a code. You control the rules.
                                </p>
                            </div>
                        </div>
                     </button>
                 </div>
             </div>
        </div>
      )}

      {/* --- PHASE 2: CONFIGURE & QUEUE --- */}
      {viewMode !== 'selection' && (
          <div className="p-4 max-w-3xl mx-auto w-full animate__animated animate__fadeInRight">
              {/* Floating Header */}
              <div className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl -mx-4 px-6 py-4 mb-8 border-b border-gray-200 dark:border-white/5 shadow-sm flex items-center gap-4 transition-colors rounded-b-3xl">
                <button onClick={goBack} className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:text-somali-blue dark:hover:text-white transition-colors">
                    <i className="fas fa-chevron-left"></i>
                </button>
                <div>
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight uppercase italic">
                        {viewMode === 'auto' ? 'Ranked Match' : 'Private Lobby'}
                    </h1>
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 tracking-widest uppercase">
                        {isSearching ? 'Status: Scanning...' : 'Status: Configuration'}
                    </p>
                </div>
              </div>

              {/* QUICK MATCH INTERFACE */}
              {viewMode === 'auto' && (
                  <>
                    {!isSearching ? (
                        <div className="bg-white/60 dark:bg-gray-900/40 backdrop-blur-md p-6 rounded-[2rem] border border-white/40 dark:border-white/5 shadow-xl">
                             <SelectionUI />
                             <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
                                <Button 
                                    fullWidth 
                                    onClick={handleAutoMatch} 
                                    disabled={!selectedChapter} 
                                    className="h-16 text-lg uppercase tracking-widest shadow-blue-500/30 hover:scale-[1.02]"
                                >
                                    <i className="fas fa-radar mr-2 animate-pulse"></i> Find Match
                                </Button>
                             </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 animate__animated animate__fadeIn">
                            {/* RADAR ANIMATION */}
                            <div className="relative w-64 h-64 mb-10">
                                <div className="absolute inset-0 bg-somali-blue/20 rounded-full animate-ping"></div>
                                <div className="absolute inset-4 bg-somali-blue/10 rounded-full animate-ping delay-150"></div>
                                <div className="absolute inset-0 border-2 border-somali-blue/30 rounded-full flex items-center justify-center">
                                    <div className="w-48 h-1 bg-gradient-to-r from-transparent via-somali-blue to-transparent absolute animate-spin"></div>
                                </div>
                                <div className="absolute inset-0 flex items-center justify-center">
                                     <Avatar src={profile?.avatar} seed={user?.uid} size="lg" className="border-4 border-white dark:border-gray-900 shadow-2xl relative z-10" />
                                </div>
                                <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 text-center w-64">
                                     <div className="font-black text-xl text-gray-900 dark:text-white uppercase tracking-widest animate-pulse">{matchStatus}</div>
                                     <div className="text-xs font-bold text-gray-500 mt-1">EST. WAIT: 5s</div>
                                </div>
                            </div>

                            <Button onClick={cancelSearch} variant="danger" className="px-8 rounded-full shadow-red-500/20 backdrop-blur-md">
                                Cancel Operation
                            </Button>
                        </div>
                    )}
                  </>
              )}

              {/* CUSTOM LOBBY INTERFACE */}
              {viewMode === 'custom' && (
                  <div className="space-y-6">
                      {/* TABS */}
                      <div className="flex p-1 bg-gray-200 dark:bg-gray-800 rounded-xl mb-4">
                          <button className={`flex-1 py-2 rounded-lg text-sm font-black uppercase tracking-wider transition-all ${!roomCode ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'}`} onClick={() => setRoomCode('')}>
                             Host Game
                          </button>
                          <button className={`flex-1 py-2 rounded-lg text-sm font-black uppercase tracking-wider transition-all ${roomCode || roomCode === '' && hostedCode === null ? 'text-gray-500' : ''}`} onClick={() => {}}>
                             Join Game
                          </button>
                      </div>

                      {/* HOST VIEW */}
                      <div className="bg-white/60 dark:bg-gray-900/40 backdrop-blur-md p-6 rounded-[2rem] border border-white/40 dark:border-white/5 shadow-xl">
                        {!hostedCode ? (
                            <>
                                <SelectionUI />
                                <div className="mt-8 border-t border-gray-200 dark:border-gray-700 pt-6">
                                    <Button fullWidth onClick={createRoom} disabled={!selectedChapter} className="h-14 text-lg shadow-yellow-500/20" variant="secondary">
                                        <i className="fas fa-satellite-dish mr-2"></i> Create Uplink
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-8 animate__animated animate__zoomIn">
                                <div className="inline-block p-6 rounded-3xl bg-yellow-400/10 border-2 border-yellow-400 border-dashed mb-6 relative">
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-yellow-900 text-[10px] font-black uppercase px-3 py-1 rounded-full">
                                        Secure Channel
                                    </div>
                                    <div className="text-7xl font-mono font-black text-gray-900 dark:text-white tracking-[0.2em] drop-shadow-sm">
                                        {hostedCode}
                                    </div>
                                </div>
                                
                                <p className="text-gray-500 dark:text-gray-400 font-bold animate-pulse mb-8">
                                    <i className="fas fa-circle text-[8px] text-green-500 mr-2 align-middle"></i>
                                    Waiting for player connection...
                                </p>

                                <div className="flex gap-4 justify-center">
                                    <Button onClick={handleCopyCode} variant="glass" className="border-gray-300 dark:border-gray-600">
                                        Copy Code
                                    </Button>
                                    <Button onClick={() => {remove(ref(db, `rooms/${hostedCode}`)); setHostedCode(null);}} variant="danger">
                                        Abort
                                    </Button>
                                </div>
                            </div>
                        )}
                      </div>
                      
                      {/* JOIN VIEW (Divider) */}
                      {!hostedCode && (
                          <div className="relative">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-gray-50 dark:bg-gray-900 px-4 text-sm font-black text-gray-400 uppercase">OR JOIN</span>
                            </div>
                          </div>
                      )}

                      {!hostedCode && (
                          <div className="bg-white/60 dark:bg-gray-900/40 backdrop-blur-md p-6 rounded-[2rem] border border-white/40 dark:border-white/5 shadow-xl text-center">
                                <h3 className="text-sm font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">Enter Access Code</h3>
                                <div className="relative max-w-xs mx-auto mb-6">
                                    <Input 
                                        placeholder="----" 
                                        className="text-center text-4xl tracking-[1rem] font-mono h-20 font-black text-gray-900 dark:text-white !bg-gray-100 dark:!bg-black/30 border-2 !border-gray-300 dark:!border-gray-700 focus:!border-somali-blue rounded-2xl"
                                        maxLength={4}
                                        value={roomCode}
                                        onChange={(e) => setRoomCode(e.target.value)}
                                    />
                                    <button 
                                        onClick={handlePasteCode} 
                                        className="absolute -right-12 top-1/2 -translate-y-1/2 w-10 h-10 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center text-gray-500 hover:text-somali-blue shadow-md transition-colors border border-gray-200 dark:border-gray-700" 
                                        title="Paste Code"
                                    >
                                        <i className="fas fa-paste"></i>
                                    </button>
                                </div>
                                <Button fullWidth variant="primary" onClick={joinRoom} disabled={roomCode.length !== 4} className="h-14 text-lg">
                                    Connect to Room
                                </Button>
                          </div>
                      )}
                  </div>
              )}
          </div>
      )}
    </div>
  );
};

export default LobbyPage;