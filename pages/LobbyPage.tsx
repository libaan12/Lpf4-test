
import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ref, push, get, remove, set, onValue, update, serverTimestamp, onDisconnect } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { Button, Input, Avatar, Card } from '../components/UI';
import { playSound } from '../services/audioService';
import { showToast, showAlert } from '../services/alert';
import { MATCH_TIMEOUT_MS, PRIVATE_ROOM_TIMEOUT_MS } from '../constants';
import { Subject, Chapter, Room } from '../types';

const LobbyPage: React.FC = () => {
  const { user, profile } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Navigation States
  const [viewMode, setViewMode] = useState<'selection' | 'auto' | 'custom' | '4p'>('selection');
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
  
  // 4P Logic States
  const [lobbyPlayers, setLobbyPlayers] = useState<Room['players']>({});
  
  const timerRef = useRef<any>(null);
  const hostTimerRef = useRef<any>(null);
  const linkedChatPathRef = useRef<string | null>(null);

  // Handle Incoming Navigation State
  useEffect(() => {
      if (location.state) {
          const { hostedCode: incomingHostCode, autoJoinCode } = location.state;
          if (incomingHostCode) {
              setHostedCode(incomingHostCode);
              // We need to fetch the room to know if it is 4p or custom
              get(ref(db, `rooms/${incomingHostCode}`)).then(snap => {
                  if(snap.exists()) {
                      const rData = snap.val();
                      if(rData.mode === '4p') setViewMode('4p');
                      else setViewMode('custom');
                  } else {
                      setViewMode('custom'); // Default fallback
                  }
              });
          } 
          else if (autoJoinCode) {
              setRoomCode(autoJoinCode);
              // Attempt join immediately
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

  // Listener for Hosted Room 
  useEffect(() => {
      if (hostedCode && user) {
         const roomRef = ref(db, `rooms/${hostedCode}`);
         
         // Timeout Logic: 2 Minutes for expiration if Host doesn't start
         // Only apply timeout if I am the host
         if (hostTimerRef.current) clearTimeout(hostTimerRef.current);
         
         hostTimerRef.current = setTimeout(async () => {
             // Check if I am host before deleting
             const snap = await get(roomRef);
             if (snap.exists() && snap.val().host === user.uid) {
                 if (linkedChatPathRef.current) {
                     update(ref(db, linkedChatPathRef.current), { status: 'expired' });
                     linkedChatPathRef.current = null;
                 }
                 remove(roomRef);
                 setHostedCode(null);
                 showAlert("Room Expired", "Room closed after 2 minutes of inactivity.", "info");
             }
         }, PRIVATE_ROOM_TIMEOUT_MS); 

         const unsub = onValue(roomRef, (snap) => {
             if (snap.exists()) {
                 const val: Room = snap.val();
                 if (val.linkedChatPath) linkedChatPathRef.current = val.linkedChatPath;
                 
                 // 4P Logic: Sync Lobby Players
                 if (val.mode === '4p') {
                     // Safety check: ensure players object exists
                     setLobbyPlayers(val.players || {});
                     
                     // Auto-Start Logic for Host
                     const playerCount = Object.keys(val.players || {}).length;
                     if (val.host === user.uid && playerCount === 4) {
                         start4PMatch(val);
                     }
                 }
             } else {
                 // Room deleted (Match started or Host left)
                 if (hostTimerRef.current) clearTimeout(hostTimerRef.current);
                 // Clear state
                 setHostedCode(null);
                 setLobbyPlayers({});
             }
         });
         
         // Clean up on disconnect 
         // Guest: remove self. Host: room removal handled in creation.
         // We add a listener here just in case, but usually handled by create logic.
         // Just to be safe for guests:
         const userInRoomRef = ref(db, `rooms/${hostedCode}/players/${user.uid}`);
         onDisconnect(userInRoomRef).remove(); 

         return () => {
             unsub();
             if (hostTimerRef.current) clearTimeout(hostTimerRef.current);
         };
      }
  }, [hostedCode, user]);

  const handleBack = async () => {
    playSound('click');
    
    if (hostedCode && user) {
        const roomRef = ref(db, `rooms/${hostedCode}`);
        const snap = await get(roomRef);
        
        if (snap.exists()) {
            const rData = snap.val();
            
            if (rData.host === user.uid) {
                // I am Host -> Kill Room
                if (linkedChatPathRef.current) {
                    update(ref(db, linkedChatPathRef.current), { status: 'canceled' });
                    linkedChatPathRef.current = null;
                }
                await remove(roomRef);
                showToast("Room closed", "info");
            } else {
                // I am Guest -> Leave Room
                await remove(ref(db, `rooms/${hostedCode}/players/${user.uid}`));
                showToast("Left room", "info");
            }
        }

        setHostedCode(null);
        setLobbyPlayers({});
        window.history.replaceState({}, document.title);
        return;
    }

    if (viewMode !== 'selection') {
        if (isSearching) cancelSearch();
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

  // --- 1v1 LOGIC ---
  const handleAutoMatch = async () => {
    if (!user || !selectedChapter) { showToast("Select a chapter", "error"); return; }
    setIsSearching(true); setMatchStatus('Scanning...'); playSound('click');
    const queueRef = ref(db, `queue/${selectedChapter}`);
    const snapshot = await get(queueRef);
    
    const currentSubjectName = subjects.find(s => s.id === selectedSubject)?.name || 'Battle Arena';

    if (snapshot.exists()) {
      const qData = snapshot.val();
      const oppKey = Object.keys(qData).find(k => qData[k].uid !== user.uid);
      if (oppKey) {
          const oppUid = qData[oppKey].uid;
          const matchId = `match_${Date.now()}`;
          const updates: any = {};
          
          updates[`queue/${selectedChapter}/${oppKey}`] = null;
          updates[`matches/${matchId}`] = {
            matchId, status: 'active', mode: 'auto', turn: user.uid, currentQ: 0, answersCount: 0, scores: { [user.uid]: 0, [oppUid]: 0 },
            subject: selectedChapter, 
            subjectTitle: currentSubjectName,
            questionLimit: Math.floor(Math.random() * 11) + 10,
            players: { [user.uid]: { name: user.displayName, avatar: '' }, [oppUid]: { name: 'Opponent', avatar: '' } }, createdAt: serverTimestamp()
          };
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
          await remove(newRef); 
          setQueueKey(null); 
          setMatchStatus(''); 
          setIsSearching(false);
          showAlert("No Match Found", "Try again later or change topic.", "info");
        }
    }, MATCH_TIMEOUT_MS);
  };

  const cancelSearch = async () => {
    setIsSearching(false); setMatchStatus('');
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (queueKey && selectedChapter) { await remove(ref(db, `queue/${selectedChapter}/${queueKey}`)); setQueueKey(null); }
  };

  // --- 4P LOGIC ---
  const create4PRoom = async () => {
      if(!user || !selectedChapter) return;
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      
      const roomData: Room = {
          host: user.uid,
          sid: selectedSubject,
          lid: selectedChapter,
          code,
          mode: '4p',
          questionLimit: quizLimit,
          createdAt: Date.now(),
          players: {
              [user.uid]: { name: profile?.name || 'Host', avatar: profile?.avatar || '' }
          }
      };
      
      // Set room first
      await set(ref(db, `rooms/${code}`), roomData);
      
      // Host Disconnect Logic: Destroy Room (Attached to room root)
      onDisconnect(ref(db, `rooms/${code}`)).remove();

      setHostedCode(code);
      playSound('click');
      showToast("Squad Room Created!", "success");
  };

  const joinRoom = async (codeOverride?: string) => {
    let codeToJoin = codeOverride || roomCode;
    if (!codeToJoin) return;
    codeToJoin = codeToJoin.trim(); 
    
    if (!user) return;
    if (!codeOverride) playSound('click');
    
    const roomRef = ref(db, `rooms/${codeToJoin}`);
    const snapshot = await get(roomRef);
    
    if (snapshot.exists()) {
      const rData: Room = snapshot.val();
      
      // IF 4P MODE
      if (rData.mode === '4p') {
          // Robust check for players object
          const players = rData.players || {};
          
          if (Object.keys(players).length >= 4 && !players[user.uid]) {
              showAlert("Full", "Room is full (4/4)", "error");
              return;
          }
          
          // Already in? (Re-joining)
          if (players[user.uid]) {
              setHostedCode(codeToJoin);
              setViewMode('4p');
              return;
          }

          // Add self to lobby
          await update(ref(db, `rooms/${codeToJoin}/players/${user.uid}`), {
              name: profile?.name || 'Player',
              avatar: profile?.avatar || ''
          });
          
          // Guest Disconnect Logic: Remove Self Only
          onDisconnect(ref(db, `rooms/${codeToJoin}/players/${user.uid}`)).remove();
          
          setHostedCode(codeToJoin);
          setViewMode('4p');
          showToast("Joined Lobby", "success");
          return;
      }

      // EXISTING 1v1 LOGIC
      if (rData.host === user.uid) { showToast("Your Room", "error"); return; }
      
      const matchId = `match_${Date.now()}`;
      let subjectTitle = 'Battle Arena';
      try {
          if(rData.sid) {
             const sSnap = await get(ref(db, `subjects/${rData.sid}`));
             if(sSnap.exists()) subjectTitle = sSnap.val().name;
          }
      } catch(e) {}

      const updates: any = {};
      updates[`rooms/${codeToJoin}`] = null; // Delete 1v1 room on join
      updates[`matches/${matchId}`] = {
        matchId, status: 'active', mode: 'custom', 
        questionLimit: rData.questionLimit || 10, 
        turn: rData.host, currentQ: 0, answersCount: 0,
        scores: { [rData.host]: 0, [user.uid]: 0 }, 
        subject: rData.lid, subjectTitle: subjectTitle,
        players: { 
            [rData.host]: { name: 'Host', avatar: '' },
            [user.uid]: { name: user.displayName, avatar: '' } 
        }, createdAt: serverTimestamp()
      };
      updates[`users/${rData.host}/activeMatch`] = matchId;
      updates[`users/${user.uid}/activeMatch`] = matchId;
      if (rData.linkedChatPath) updates[rData.linkedChatPath + '/status'] = 'played';

      try { await update(ref(db), updates); } 
      catch(e) { showAlert("Error", "Failed to join room.", "error"); }
      
    } else {
        showAlert("Error", "Room not found or expired.", "error");
        setRoomCode('');
    }
  };

  const start4PMatch = async (roomData: Room) => {
      if (!user || !roomData.players) return;
      const matchId = `match_${Date.now()}`;
      
      // Build Players Object & Scores
      const matchPlayers: any = {};
      const scores: any = {};
      const responseTimes: any = {};
      
      Object.entries(roomData.players).forEach(([uid, pData]) => {
          matchPlayers[uid] = { name: pData.name, avatar: pData.avatar };
          scores[uid] = 0;
          responseTimes[uid] = 0;
      });

      let subjectTitle = 'Squad Battle';
      try {
          if(roomData.sid) {
             const sSnap = await get(ref(db, `subjects/${roomData.sid}`));
             if(sSnap.exists()) subjectTitle = sSnap.val().name;
          }
      } catch(e) {}

      const updates: any = {};
      updates[`rooms/${roomData.code}`] = null; // Delete room when starting
      updates[`matches/${matchId}`] = {
          matchId,
          status: 'active',
          mode: '4p',
          currentQ: 0,
          questionLimit: roomData.questionLimit,
          subject: roomData.lid,
          subjectTitle,
          players: matchPlayers,
          scores,
          totalResponseTime: responseTimes,
          createdAt: serverTimestamp()
      };

      // Redirect all players
      Object.keys(roomData.players).forEach(uid => {
          updates[`users/${uid}/activeMatch`] = matchId;
      });

      await update(ref(db), updates);
  };

  const copyRoomCode = () => {
      if (hostedCode) {
          navigator.clipboard.writeText(hostedCode);
          playSound('click');
          showToast('Code Copied!', 'success');
      }
  };

  // UI HELPERS
  const showSelectors = (viewMode === 'auto' && !isSearching) || (viewMode === 'custom' && customSubMode === 'create' && !hostedCode) || (viewMode === '4p' && customSubMode === 'create' && !hostedCode);
  const pageTitle = viewMode === 'auto' ? 'Ranked Match' : viewMode === '4p' ? 'Squad Battle' : customSubMode === 'join' ? 'Join' : customSubMode === 'create' ? 'Create Room' : 'Private Mode';

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

      {/* Main Selection Header */}
      {viewMode === 'selection' && (
          <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 shadow-sm flex items-center gap-4 px-4 py-3 transition-colors duration-300">
                 <button onClick={() => navigate('/')} className="text-gray-600 dark:text-gray-300 hover:text-game-primary dark:hover:text-blue-400 transition-colors">
                    <i className="fas fa-arrow-left fa-lg"></i>
                 </button>
                 <h1 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase italic tracking-tight">Battle Mode</h1>
          </div>
      )}

      {viewMode === 'selection' && (
        <div className="flex flex-col gap-4 animate__animated animate__fadeIn">
             <div onClick={() => { playSound('click'); setViewMode('auto'); }} className="bg-game-primary rounded-3xl p-6 text-white relative overflow-hidden cursor-pointer shadow-xl shadow-indigo-500/30 group hover:scale-[1.02] transition-transform">
                 <div className="relative z-10">
                     <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-black uppercase mb-3 inline-block">1 vs 1</span>
                     <h2 className="text-3xl font-black italic">QUICK MATCH</h2>
                     <p className="opacity-90 font-bold max-w-xs mt-2 text-xs">Find an opponent instantly.</p>
                 </div>
                 <i className="fas fa-bolt text-8xl absolute -right-4 -bottom-6 opacity-20 rotate-12 group-hover:scale-110 transition-transform"></i>
             </div>

             <div onClick={() => { playSound('click'); setViewMode('custom'); setCustomSubMode('menu'); }} className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-3xl p-6 relative overflow-hidden cursor-pointer shadow-lg group hover:scale-[1.02] transition-transform">
                 <div className="relative z-10">
                     <span className="bg-game-accent text-white px-3 py-1 rounded-full text-xs font-black uppercase mb-3 inline-block">1 vs 1</span>
                     <h2 className="text-3xl font-black italic text-slate-800 dark:text-white">PRIVATE DUEL</h2>
                     <p className="text-slate-500 dark:text-slate-400 font-bold max-w-xs mt-2 text-xs">Challenge a friend with a code.</p>
                 </div>
                 <i className="fas fa-user-friends text-8xl absolute -right-4 -bottom-6 text-slate-100 dark:text-slate-700 rotate-12 group-hover:scale-110 transition-transform"></i>
             </div>

             {/* NEW 4P MODE - COMING SOON */}
             <div onClick={() => { playSound('click'); showToast("Coming Soon!", "info"); }} className="bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-3xl p-6 relative overflow-hidden cursor-not-allowed opacity-80">
                 <div className="relative z-10 opacity-50 grayscale">
                     <span className="bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-3 py-1 rounded-full text-xs font-black uppercase mb-3 inline-block">4 Players</span>
                     <h2 className="text-3xl font-black italic text-slate-400 dark:text-slate-500">SQUAD BATTLE</h2>
                     <p className="text-slate-400 dark:text-slate-500 font-bold max-w-xs mt-2 text-xs">4-Player Free For All. Fastest wins.</p>
                 </div>
                 <div className="absolute inset-0 flex items-center justify-center z-20">
                     <span className="bg-yellow-400 text-black px-4 py-2 rounded-xl font-black uppercase tracking-widest text-sm shadow-lg transform -rotate-6">Coming Soon</span>
                 </div>
                 <i className="fas fa-users text-8xl absolute -right-4 -bottom-6 opacity-10 rotate-12 grayscale"></i>
             </div>
        </div>
      )}

      {viewMode !== 'selection' && (
          <div className="animate__animated animate__fadeInRight">
              
              {/* 4P LOBBY WAITING ROOM */}
              {viewMode === '4p' && hostedCode && (
                  <Card className="text-center py-8 animate__animated animate__zoomIn border-4 border-purple-500 !bg-slate-50 dark:!bg-slate-900">
                      <div className="inline-block bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 px-4 py-1 rounded-full text-xs font-black uppercase mb-4 animate-pulse">
                          Waiting for players ({Object.keys(lobbyPlayers).length}/4)
                      </div>
                      
                      <div onClick={copyRoomCode} className="bg-white dark:bg-black p-6 rounded-3xl mb-8 relative cursor-pointer group border-4 border-dashed border-slate-300 dark:border-slate-700 mx-auto max-w-xs hover:border-purple-500 transition-colors">
                         <div className="text-6xl font-black text-slate-800 dark:text-white tracking-[0.1em]">{hostedCode}</div>
                         <div className="absolute bottom-2 w-full left-0 text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tap Code to Copy</div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 px-4">
                          {Array.from({length: 4}).map((_, i) => {
                              const pIds = Object.keys(lobbyPlayers);
                              const player = pIds[i] ? lobbyPlayers[pIds[i]] : null;
                              return (
                                  <div key={i} className={`flex flex-col items-center p-3 rounded-2xl border-2 transition-all ${player ? 'bg-white dark:bg-slate-800 border-purple-500 scale-105 shadow-lg' : 'border-slate-200 dark:border-slate-700 border-dashed opacity-50'}`}>
                                      {player ? (
                                          <>
                                            <Avatar src={player.avatar} size="md" className="mb-2" />
                                            <span className="font-bold text-xs truncate w-full">{player.name}</span>
                                          </>
                                      ) : (
                                          <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-2 animate-pulse">
                                              <i className="fas fa-plus text-slate-400"></i>
                                          </div>
                                      )}
                                  </div>
                              );
                          })}
                      </div>

                      {user && lobbyPlayers[user.uid] && (Object.keys(lobbyPlayers)[0] === user.uid || lobbyPlayers[user.uid].name === (profile?.name || 'Host')) ? (
                          <Button 
                            fullWidth 
                            size="lg" 
                            onClick={() => start4PMatch({ code: hostedCode, players: lobbyPlayers, questionLimit: quizLimit, sid: selectedSubject, lid: selectedChapter, host: user.uid, createdAt: 0 })}
                            disabled={Object.keys(lobbyPlayers).length < 2}
                            className="bg-purple-600 hover:bg-purple-700 border-purple-800"
                          >
                              {Object.keys(lobbyPlayers).length < 2 ? 'Need 2+ Players' : 'START BATTLE'}
                          </Button>
                      ) : (
                          <div className="text-slate-500 dark:text-slate-400 font-bold text-sm animate-pulse">
                              Waiting for host to start...
                          </div>
                      )}
                  </Card>
              )}

              {/* 1v1 HOST WAITING UI */}
              {hostedCode && viewMode === 'custom' && (
                  <Card className="text-center py-10 animate__animated animate__zoomIn border-4 border-game-accent">
                      <h3 className="text-xl font-black text-slate-500 dark:text-slate-400 mb-4 uppercase">Room Code</h3>
                      <div onClick={copyRoomCode} className="bg-slate-100 dark:bg-slate-900 p-6 rounded-3xl mb-6 relative cursor-pointer group hover:bg-slate-200 dark:hover:bg-black transition-colors border-4 border-dashed border-slate-300 dark:border-slate-700">
                         <div className="text-6xl font-black text-game-primary tracking-[0.2em]">{hostedCode}</div>
                         <div className="absolute bottom-2 w-full left-0 text-[10px] text-slate-400 font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">Tap to Copy</div>
                      </div>
                      <div className="flex items-center justify-center gap-2 mb-8">
                         <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                         <p className="text-slate-500 dark:text-slate-300 font-bold">Waiting for opponent to join...</p>
                      </div>
                      <Button variant="danger" fullWidth onClick={handleBack}>CANCEL ROOM</Button>
                  </Card>
              )}

              {/* SHARED: MENU SELECTION (JOIN/CREATE) */}
              {(viewMode === 'custom' || viewMode === '4p') && customSubMode === 'menu' && !hostedCode && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 animate__animated animate__fadeInUp">
                      <div onClick={() => { playSound('click'); setCustomSubMode('join'); }} className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 p-6 rounded-[2rem] cursor-pointer hover:border-game-primary group transition-all shadow-sm hover:shadow-xl relative overflow-hidden">
                          <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-game-primary flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform"><i className="fas fa-door-open"></i></div>
                          <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase italic">Join Room</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 font-bold mt-2">Enter code to join.</p>
                      </div>
                      <div onClick={() => { playSound('click'); setCustomSubMode('create'); }} className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 p-6 rounded-[2rem] cursor-pointer hover:border-purple-500 group transition-all shadow-sm hover:shadow-xl relative overflow-hidden">
                          <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center text-2xl mb-4 group-hover:scale-110 transition-transform"><i className="fas fa-plus"></i></div>
                          <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase italic">Create Room</h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 font-bold mt-2">Host a new game.</p>
                      </div>
                  </div>
              )}

              {/* SHARED: JOIN INPUT */}
              {(viewMode === 'custom' || viewMode === '4p') && customSubMode === 'join' && !hostedCode && (
                  <div className="max-w-md mx-auto mt-8 animate__animated animate__fadeInUp">
                      <Card className="!p-8 text-center bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700">
                          <h3 className="text-xl font-black text-slate-800 dark:text-white mb-6 uppercase">Enter Room Code</h3>
                          <input value={roomCode} onChange={e => setRoomCode(e.target.value)} placeholder="0000" className="w-full bg-slate-100 dark:bg-slate-900 border-4 border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-4 text-center font-black uppercase text-4xl text-slate-900 dark:text-white focus:border-game-primary focus:outline-none transition-all mb-6 tracking-[0.5em]" maxLength={4} type="tel"/>
                          <Button fullWidth size="lg" onClick={() => joinRoom()} disabled={roomCode.length !== 4} className="shadow-xl">Join</Button>
                      </Card>
                  </div>
              )}

              {/* SELECTORS FOR CREATE & AUTO */}
              {showSelectors && (
                    <div className="space-y-6 animate__animated animate__fadeInUp">
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 ml-1">Subject</label>
                                <div className="relative">
                                    <select value={selectedSubject} onChange={(e) => { setSelectedSubject(e.target.value); playSound('click'); }} className="w-full p-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-800 dark:text-white appearance-none cursor-pointer focus:border-game-primary shadow-sm">
                                        <option value="">-- Choose Subject --</option>
                                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500"><i className="fas fa-chevron-down"></i></div>
                                </div>
                            </div>
                            <div className={!selectedSubject ? 'opacity-50 pointer-events-none' : ''}>
                                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 ml-1">Chapter</label>
                                <div className="relative">
                                    <select value={selectedChapter} onChange={(e) => { setSelectedChapter(e.target.value); playSound('click'); }} className="w-full p-4 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl font-bold text-slate-800 dark:text-white appearance-none cursor-pointer focus:border-game-primary shadow-sm" disabled={!selectedSubject}>
                                        <option value="">-- Choose Chapter --</option>
                                        {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500"><i className="fas fa-chevron-down"></i></div>
                                </div>
                            </div>
                        </div>

                        {viewMode === 'auto' ? (
                            <Button fullWidth size="lg" onClick={handleAutoMatch} disabled={!selectedChapter} className="shadow-xl">FIND MATCH</Button>
                        ) : viewMode === '4p' ? (
                            <Button fullWidth size="lg" onClick={create4PRoom} disabled={!selectedChapter} className="shadow-xl bg-purple-600 border-purple-800 hover:bg-purple-700">CREATE SQUAD ROOM</Button>
                        ) : (
                            <Button fullWidth size="lg" onClick={() => {setHostedCode((Math.floor(1000 + Math.random() * 9000).toString())); createRoom();}} disabled={!selectedChapter} className="shadow-xl bg-indigo-600 border-indigo-800 hover:bg-indigo-700">CREATE DUEL ROOM</Button>
                        )}
                    </div>
              )}
              
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
          </div>
      )}
    </div>
  );
  
  // Helper for 1v1 Create Room (restored from prev logic simplistically)
  async function createRoom() {
      if(!user || !selectedChapter) return;
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      setHostedCode(code);
      // Explicitly set mode: '1v1'
      await set(ref(db, `rooms/${code}`), { host: user.uid, sid: selectedSubject, lid: selectedChapter, questionLimit: quizLimit, createdAt: Date.now(), mode: '1v1' });
      // Add disconnect logic for 1v1
      onDisconnect(ref(db, `rooms/${code}`)).remove();
      
      playSound('click');
      showToast("Room Created!", "success");
  }
};

export default LobbyPage;
