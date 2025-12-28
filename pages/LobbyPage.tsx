import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, push, get, remove, set, onValue, update, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { Button, Input, Avatar, Card } from '../components/UI';
import { playSound } from '../services/audioService';
import { showToast, showAlert } from '../services/alert';
import { MATCH_TIMEOUT_MS } from '../constants';
import { Subject, Chapter } from '../types';

const LobbyPage: React.FC = () => {
  const { user, profile } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Navigation States
  const [viewMode, setViewMode] = useState<'selection' | 'auto' | 'custom'>('selection');
  const [customSubMode, setCustomSubMode] = useState<'menu' | 'join' | 'create'>('menu');

  // Data States
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [quizLimit, setQuizLimit] = useState<number>(10);
  
  // Logic States
  const [matchStatus, setMatchStatus] = useState<string>('');
  const [roomCode, setRoomCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [hostedCode, setHostedCode] = useState<string | null>(null);
  const [queueKey, setQueueKey] = useState<string | null>(null);
  
  const timerRef = useRef<any>(null);
  const linkedChatPathRef = useRef<string | null>(null);

  // Handle Incoming Navigation State (Seamless from Chat)
  useEffect(() => {
      if (location.state) {
          const { hostedCode: incomingHostCode, autoJoinCode } = location.state;
          
          // Case 1: Host coming from Chat
          if (incomingHostCode) {
              setHostedCode(incomingHostCode);
              setViewMode('custom');
              // Listen for join is handled by the useEffect below for hostedCode
          } 
          // Case 2: Guest coming from Chat
          else if (autoJoinCode) {
              setRoomCode(autoJoinCode);
              setViewMode('custom');
              // Trigger join immediately
              joinRoom(autoJoinCode);
          }
      }
  }, [location.state]);

  useEffect(() => {
    const cachedSubjects = localStorage.getItem('subjects_cache');
    if (cachedSubjects) setSubjects(JSON.parse(cachedSubjects));
    get(ref(db, 'subjects')).then(snap => {
        if(snap.exists()) {
          const list = (Object.values(snap.val()) as Subject[]).filter(s => s && s.id && s.name);
          setSubjects(list);
          localStorage.setItem('subjects_cache', JSON.stringify(list));
        }
    });
  }, []);

  useEffect(() => {
    if (!selectedSubject) { setChapters([]); return; }
    get(ref(db, `chapters/${selectedSubject}`)).then(snap => {
        if(snap.exists()) {
            const list = Object.values(snap.val()) as Chapter[];
            const allOption: Chapter = { id: `ALL_${selectedSubject}`, name: 'All Chapters', subjectId: selectedSubject };
            setChapters([allOption, ...list]);
            setSelectedChapter(allOption.id);
        } else setChapters([]);
    });
  }, [selectedSubject]);

  // Listener for Hosted Room (Waiting for someone to delete room & start match)
  useEffect(() => {
      if (hostedCode) {
         const roomRef = ref(db, `rooms/${hostedCode}`);
         const unsub = onValue(roomRef, (snap) => {
             // Store linked chat path if available to update later
             if (snap.exists()) {
                 const val = snap.val();
                 if (val.linkedChatPath) linkedChatPathRef.current = val.linkedChatPath;
             }

             // If room is gone, it means someone joined (which deletes the room and creates match)
             // or it was aborted. 
             // Note: Game start navigation is handled by the `App.tsx` global `activeMatch` listener.
             // We just need to handle UI here if aborted externally.
             if (!snap.exists()) {
                 // Check if it was because we joined a match (handled by App.tsx) or just deleted
                 // Small delay to let App.tsx catch activeMatch
                 setTimeout(() => {
                     if (!hostedCode) return; // Cleaned up
                     // If we are still on this page and room is gone, assume game started or cleaned up
                 }, 1000);
             }
         });
         return () => unsub();
      }
  }, [hostedCode]);

  const handleBack = () => {
    playSound('click');
    
    // If hosting a room, abort it first
    if (hostedCode) {
        // If there was a linked chat message, mark it as canceled
        if (linkedChatPathRef.current) {
            update(ref(db, linkedChatPathRef.current), { status: 'canceled' });
            linkedChatPathRef.current = null;
        }

        remove(ref(db, `rooms/${hostedCode}`));
        setHostedCode(null);
        // Clear history state to prevent re-triggering
        window.history.replaceState({}, document.title);
        return;
    }

    if (viewMode === 'auto') {
        if (isSearching) {
            cancelSearch();
        } else {
            setViewMode('selection');
        }
    } else if (viewMode === 'custom') {
        if (customSubMode !== 'menu') {
            setCustomSubMode('menu');
            setRoomCode('');
        } else {
            setViewMode('selection');
        }
    } else {
        navigate('/');
    }
  };

  const handleAutoMatch = async () => {
    if (!user || !selectedChapter) { showToast("Select a chapter", "error"); return; }
    setIsSearching(true); setMatchStatus('Scanning...'); playSound('click');
    const queueRef = ref(db, `queue/${selectedChapter}`);
    const snapshot = await get(queueRef);
    
    if (snapshot.exists()) {
      const qData = snapshot.val();
      const oppKey = Object.keys(qData).find(k => qData[k].uid !== user.uid);
      if (oppKey) {
          const oppUid = qData[oppKey].uid;
          
          // ATOMIC UPDATE FOR AUTO MATCH
          const matchId = `match_${Date.now()}`;
          const updates: any = {};
          
          // Remove opponent from queue
          updates[`queue/${selectedChapter}/${oppKey}`] = null;
          
          // Create Match
          updates[`matches/${matchId}`] = {
            matchId, status: 'active', mode: 'auto', turn: user.uid, currentQ: 0, answersCount: 0, scores: { [user.uid]: 0, [oppUid]: 0 },
            subject: selectedChapter, questionLimit: Math.floor(Math.random() * 11) + 10,
            players: { [user.uid]: { name: user.displayName, avatar: '' }, [oppUid]: { name: 'Opponent', avatar: '' } }, createdAt: serverTimestamp()
          };
          
          // Set Active Match for Both
          updates[`users/${user.uid}/activeMatch`] = matchId;
          updates[`users/${oppUid}/activeMatch`] = matchId;
          
          await update(ref(db), updates);
          return;
      }
    }
    const newRef = push(queueRef);
    setQueueKey(newRef.key);
    await set(newRef, { uid: user.uid });
    setMatchStatus('In Queue...');
    timerRef.current = setTimeout(async () => {
        if (isSearching) {
          await remove(newRef); setQueueKey(null); setMatchStatus('Timeout'); setIsSearching(false);
        }
    }, MATCH_TIMEOUT_MS);
  };

  const cancelSearch = async () => {
    setIsSearching(false); setMatchStatus('');
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (queueKey && selectedChapter) { await remove(ref(db, `queue/${selectedChapter}/${queueKey}`)); setQueueKey(null); }
  };

  const createRoom = async () => {
    if(!user || !selectedChapter) return;
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setHostedCode(code);
    await set(ref(db, `rooms/${code}`), { host: user.uid, sid: selectedSubject, lid: selectedChapter, questionLimit: quizLimit, createdAt: Date.now() });
    playSound('click');
    showToast("Room Created!", "success");
  };

  const joinRoom = async (codeOverride?: string) => {
    const codeToJoin = codeOverride || roomCode;
    if (!user || !codeToJoin) return;
    
    // Only play sound if manual click
    if (!codeOverride) playSound('click');
    
    const roomRef = ref(db, `rooms/${codeToJoin}`);
    const snapshot = await get(roomRef);
    if (snapshot.exists()) {
      const rData = snapshot.val();
      if (rData.host === user.uid) { showToast("Your Room", "error"); return; }
      
      const matchId = `match_${Date.now()}`;
      
      // ATOMIC UPDATE FOR JOINING ROOM
      // This prevents race conditions where one user updates and the other fails/lags
      const updates: any = {};
      
      // 1. Delete Room
      updates[`rooms/${codeToJoin}`] = null;
      
      // 2. Create Match
      updates[`matches/${matchId}`] = {
        matchId, 
        status: 'active', 
        mode: 'custom', 
        questionLimit: rData.questionLimit || 10, 
        turn: rData.host, 
        currentQ: 0, 
        answersCount: 0,
        scores: { [rData.host]: 0, [user.uid]: 0 }, 
        subject: rData.lid,
        players: { 
            [rData.host]: { name: 'Host', avatar: '' }, // Avatars fetched in GamePage
            [user.uid]: { name: user.displayName, avatar: '' } 
        },
        createdAt: serverTimestamp()
      };
      
      // 3. Set Active Match (Redirects users via App.tsx listener)
      updates[`users/${rData.host}/activeMatch`] = matchId;
      updates[`users/${user.uid}/activeMatch`] = matchId;

      // 4. Update Chat Message if linked
      if (rData.linkedChatPath) {
          updates[rData.linkedChatPath + '/status'] = 'played';
      }

      try {
          await update(ref(db), updates);
      } catch(e) {
          console.error("Join Room Error", e);
          showAlert("Error", "Failed to join room.", "error");
      }
      
    } else {
        if (!codeOverride) showToast("Invalid Code", "error");
        // If auto-join failed, clear code
        if (codeOverride) {
            showAlert("Error", "Room not found or expired.", "error");
            setRoomCode('');
        }
    }
  };

  const copyRoomCode = () => {
      if (hostedCode) {
          navigator.clipboard.writeText(hostedCode);
          playSound('click');
          showToast('Code Copied!', 'success');
      }
  };

  useEffect(() => () => {
     if (timerRef.current) clearTimeout(timerRef.current);
     // Note: We do NOT remove hostedCode on unmount if navigating to Game, 
     // but we should if navigating back. handled by handleBack.
     if (queueKey && selectedChapter) remove(ref(db, `queue/${selectedChapter}/${queueKey}`));
  }, [queueKey, selectedChapter]);

  // Determine if Subject/Chapter Selection should be shown
  const showSelectors = (viewMode === 'auto' && !isSearching) || (viewMode === 'custom' && customSubMode === 'create' && !hostedCode);
  const pageTitle = viewMode === 'auto' ? 'Ranked Match' : customSubMode === 'join' ? 'Join' : customSubMode === 'create' ? 'Create Room' : 'Private Mode';

  return (
    <div className="min-h-full flex flex-col p-4 pb-24 pt-24 max-w-4xl mx-auto w-full">
      
      {/* View Mode Header - Fixed */}
      {viewMode !== 'selection' && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 shadow-sm flex items-center gap-4 px-4 py-3 transition-colors duration-300">
                 <button onClick={handleBack} className="text-gray-600 dark:text-gray-300 hover:text-game-primary dark:hover:text-blue-400 transition-colors">
                    <i className="fas fa-arrow-left fa-lg"></i>
                 </button>
                 <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">{pageTitle}</h2>
          </div>
      )}

      {/* Main Selection Header - Fixed */}
      {viewMode === 'selection' && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 shadow-sm flex items-center gap-4 px-4 py-3 transition-colors duration-300">
                 <button onClick={() => navigate('/')} className="text-gray-600 dark:text-gray-300 hover:text-game-primary dark:hover:text-blue-400 transition-colors">
                    <i className="fas fa-arrow-left fa-lg"></i>
                 </button>
                 <h1 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase italic tracking-tight">Battle Mode</h1>
          </div>
      )}

      {viewMode === 'selection' && (
        <div className="flex flex-col gap-6 animate__animated animate__fadeIn">
             <div className="text-center mb-2">
                <p className="text-slate-500 dark:text-slate-400 font-bold text-sm tracking-wide uppercase">Choose your path</p>
             </div>

             <div onClick={() => { playSound('click'); setViewMode('auto'); }} className="bg-game-primary rounded-3xl p-8 text-white relative overflow-hidden cursor-pointer shadow-xl shadow-indigo-500/30 group hover:scale-[1.02] transition-transform">
                 <div className="relative z-10">
                     <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-black uppercase mb-3 inline-block">Ranked</span>
                     <h2 className="text-3xl font-black italic">QUICK MATCH</h2>
                     <p className="opacity-90 font-bold max-w-xs mt-2">Find an opponent instantly and play for points.</p>
                 </div>
                 <i className="fas fa-bolt text-9xl absolute -right-4 -bottom-8 opacity-20 rotate-12 group-hover:scale-110 transition-transform"></i>
             </div>

             <div onClick={() => { playSound('click'); setViewMode('custom'); setCustomSubMode('menu'); }} className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-3xl p-8 relative overflow-hidden cursor-pointer shadow-lg group hover:scale-[1.02] transition-transform">
                 <div className="relative z-10">
                     <span className="bg-game-accent text-white px-3 py-1 rounded-full text-xs font-black uppercase mb-3 inline-block">Custom</span>
                     <h2 className="text-3xl font-black italic text-slate-800 dark:text-white">PRIVATE ROOM</h2>
                     <p className="text-slate-500 dark:text-slate-400 font-bold max-w-xs mt-2">Create a lobby code or join a friend's game.</p>
                 </div>
                 <i className="fas fa-key text-9xl absolute -right-4 -bottom-8 text-slate-100 dark:text-slate-700 rotate-12 group-hover:scale-110 transition-transform"></i>
             </div>
        </div>
      )}

      {viewMode !== 'selection' && (
          <div className="animate__animated animate__fadeInRight">
              
              {/* AUTO MATCH SEARCHING UI */}
              {viewMode === 'auto' && isSearching && (
                 <div className="flex flex-col items-center justify-center py-20">
                     <div className="w-32 h-32 relative mb-8">
                         <div className="absolute inset-0 bg-game-primary rounded-full animate-ping opacity-20"></div>
                         <div className="relative w-full h-full rounded-full border-4 border-game-primary flex items-center justify-center bg-white dark:bg-slate-800">
                             <Avatar src={profile?.avatar} size="lg" />
                         </div>
                     </div>
                     <h3 className="text-2xl font-black text-slate-800 dark:text-white animate-pulse mb-2">{matchStatus}</h3>
                     <Button variant="danger" onClick={cancelSearch}>Cancel</Button>
                 </div>
              )}

              {/* HOSTED ROOM WAITING UI */}
              {hostedCode && (
                  <Card className="text-center py-10 animate__animated animate__zoomIn border-4 border-game-accent">
                      <h3 className="text-xl font-black text-slate-500 dark:text-slate-400 mb-4 uppercase">Room Code</h3>
                      <div 
                        onClick={copyRoomCode}
                        className="bg-slate-100 dark:bg-slate-900 p-6 rounded-3xl mb-6 relative cursor-pointer group hover:bg-slate-200 dark:hover:bg-black transition-colors border-4 border-dashed border-slate-300 dark:border-slate-700"
                      >
                         <div className="text-6xl font-black text-game-primary tracking-[0.2em]">{hostedCode}</div>
                         <div className="absolute top-2 right-2 text-slate-400 group-hover:text-game-primary transition-colors">
                             <i className="fas fa-copy text-xl"></i>
                         </div>
                         <div className="absolute bottom-2 w-full left-0 text-[10px] text-slate-400 font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">Tap to Copy</div>
                      </div>
                      
                      <div className="flex items-center justify-center gap-2 mb-8">
                         <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                         <p className="text-slate-500 dark:text-slate-300 font-bold">Waiting for opponent to join...</p>
                      </div>
                      
                      <Button variant="danger" fullWidth onClick={handleBack}>
                          CANCEL ROOM
                      </Button>
                  </Card>
              )}

              {/* PRIVATE MENU SELECTION */}
              {viewMode === 'custom' && customSubMode === 'menu' && !hostedCode && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate__animated animate__fadeInUp">
                      <div 
                        onClick={() => { playSound('click'); setCustomSubMode('join'); }}
                        className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 p-6 rounded-[2rem] cursor-pointer hover:border-game-primary dark:hover:border-game-primary group transition-all shadow-sm hover:shadow-xl relative overflow-hidden"
                      >
                          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                              <i className="fas fa-search text-8xl text-game-primary transform rotate-12"></i>
                          </div>
                          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-game-primary flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                              <i className="fas fa-door-open"></i>
                          </div>
                          <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase italic">Join Room</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 font-bold mt-2">
                              Have a code? Enter it here to join your friend's lobby.
                          </p>
                      </div>

                      <div 
                        onClick={() => { playSound('click'); setCustomSubMode('create'); }}
                        className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 p-6 rounded-[2rem] cursor-pointer hover:border-purple-500 dark:hover:border-purple-400 group transition-all shadow-sm hover:shadow-xl relative overflow-hidden"
                      >
                          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                              <i className="fas fa-crown text-8xl text-purple-500 transform -rotate-12"></i>
                          </div>
                          <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform">
                              <i className="fas fa-plus"></i>
                          </div>
                          <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase italic">Create Room</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 font-bold mt-2">
                              Create a new private lobby and invite your friends to battle.
                          </p>
                      </div>
                  </div>
              )}

              {/* JOIN ROOM INPUT UI */}
              {viewMode === 'custom' && customSubMode === 'join' && !hostedCode && (
                  <div className="max-w-md mx-auto mt-8 animate__animated animate__fadeInUp">
                      <Card className="!p-8 text-center bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700">
                          <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/50 text-game-primary rounded-full flex items-center justify-center mx-auto mb-6 text-2xl">
                             <i className="fas fa-key"></i>
                          </div>
                          <h3 className="text-xl font-black text-slate-800 dark:text-white mb-6 uppercase">Enter Room Code</h3>
                          <input 
                              value={roomCode} 
                              onChange={e => setRoomCode(e.target.value)} 
                              placeholder="0000" 
                              className="w-full bg-slate-100 dark:bg-slate-900 border-4 border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-4 text-center font-black uppercase text-4xl text-slate-900 dark:text-white placeholder-slate-300 focus:border-game-primary focus:outline-none transition-all mb-6 tracking-[0.5em]" 
                              maxLength={4} 
                              type="tel"
                          />
                          <Button fullWidth size="lg" onClick={() => joinRoom()} disabled={roomCode.length !== 4} className="shadow-xl">
                              Join
                          </Button>
                      </Card>
                  </div>
              )}

              {/* SUBJECT & CHAPTER SELECTORS (Shared by Auto & Create) */}
              {showSelectors && (
                    <div className="space-y-6 animate__animated animate__fadeInUp">
                        {/* Redesigned Dropdowns */}
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 ml-1">Subject</label>
                                <div className="relative">
                                    <select 
                                        value={selectedSubject} 
                                        onChange={(e) => { setSelectedSubject(e.target.value); playSound('click'); }}
                                        className="w-full p-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-800 dark:text-white appearance-none cursor-pointer focus:border-game-primary focus:ring-4 focus:ring-game-primary/20 transition-all shadow-sm"
                                    >
                                        <option value="">-- Choose Subject --</option>
                                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                        <i className="fas fa-chevron-down"></i>
                                    </div>
                                </div>
                            </div>

                            <div className={!selectedSubject ? 'opacity-50 pointer-events-none' : ''}>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 ml-1">Chapter</label>
                                <div className="relative">
                                    <select 
                                        value={selectedChapter} 
                                        onChange={(e) => { setSelectedChapter(e.target.value); playSound('click'); }}
                                        className="w-full p-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-800 dark:text-white appearance-none cursor-pointer focus:border-game-primary focus:ring-4 focus:ring-game-primary/20 transition-all shadow-sm"
                                        disabled={!selectedSubject}
                                    >
                                        <option value="">-- Choose Chapter --</option>
                                        {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                                        <i className="fas fa-chevron-down"></i>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {viewMode === 'auto' ? (
                            <Button fullWidth size="lg" onClick={handleAutoMatch} disabled={!selectedChapter} className="shadow-xl">FIND MATCH</Button>
                        ) : (
                            <Button fullWidth size="lg" onClick={createRoom} disabled={!selectedChapter} className="shadow-xl bg-purple-600 border-purple-800 hover:bg-purple-700">CREATE ROOM</Button>
                        )}
                    </div>
              )}
          </div>
      )}
    </div>
  );
};

export default LobbyPage;