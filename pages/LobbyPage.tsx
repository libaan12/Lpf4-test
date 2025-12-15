import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, push, get, remove, set, onValue } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { Button, Input, Card } from '../components/UI';
import { playSound } from '../services/audioService';
import { MATCH_TIMEOUT_MS } from '../constants';
import { Subject, Chapter } from '../types';
import Swal from 'sweetalert2';

const LobbyPage: React.FC = () => {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  
  // VIEW MODE: 'selection' | 'auto' | 'custom'
  const [viewMode, setViewMode] = useState<'selection' | 'auto' | 'custom'>('selection');
  
  // Selection State
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  
  // Custom Room Settings
  const [quizLimit, setQuizLimit] = useState<number>(5);

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
            setChapters(list);
            if(list.length > 0) setSelectedChapter(list[0].id);
        } else {
            setChapters([]);
        }
    });
  }, [selectedSubject]);

  const showNotify = (msg: string, type: 'error'|'success' = 'error') => {
    playSound(type === 'error' ? 'wrong' : 'click');
    const isDark = document.documentElement.classList.contains('dark');
    Swal.fire({
      icon: type,
      title: msg,
      toast: true,
      position: 'top',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      showCloseButton: true,
    });
  };

  const handleAutoMatch = async () => {
    if (!user) return;
    if (!selectedChapter) {
        showNotify("Please select a subject and chapter first", "error");
        return;
    }

    setIsSearching(true);
    setMatchStatus('Searching for opponent...');
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

          const matchId = `match_${Date.now()}`;
          const matchData = {
            matchId,
            status: 'active',
            mode: 'auto',
            turn: user.uid, 
            currentQ: 0,
            scores: { [user.uid]: 0, [opponentUid]: 0 },
            subject: selectedChapter,
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
      setMatchStatus('Waiting for opponent...');

      timerRef.current = setTimeout(async () => {
        if (isSearching) {
          const checkRef = await get(newRef);
          if (checkRef.exists()) {
             await remove(newRef);
             setQueueKey(null);
             setMatchStatus('No opponent found. Try again.');
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
        showNotify("Please select a topic first", "error");
        return;
    }

    playSound('click');
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    setHostedCode(code);
    
    await set(ref(db, `rooms/${code}`), {
      host: user.uid,
      sid: selectedSubject,
      lid: selectedChapter,
      questionLimit: quizLimit,
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
      showNotify("Code copied!", "success");
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
        showNotify("You cannot join your own room.", "error");
        return;
      }

      const hostUid = roomData.host;
      const chapterId = roomData.lid;
      const qLimit = roomData.questionLimit || 5;

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
      showNotify("Invalid Room Code", "error");
    }
  };

  const handlePasteCode = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const code = text.trim().slice(0, 4);
        setRoomCode(code);
        showNotify("Code pasted!", "success");
      }
    } catch (e) {
      showNotify("Cannot access clipboard", "error");
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

  const SelectionUI = () => (
      <div className="mb-6 bg-white/40 dark:bg-black/40 backdrop-blur-md p-6 rounded-3xl shadow-lg border border-white/20 dark:border-white/5">
          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-3 ml-1 tracking-wider">1. Select Subject</label>
          <div className="flex gap-2 overflow-x-auto pb-4 mb-2 custom-scrollbar">
              {subjects.map(s => (
                  <button 
                    key={s.id} 
                    onClick={() => setSelectedSubject(s.id)}
                    className={`px-5 py-3 rounded-2xl whitespace-nowrap text-sm font-bold transition-all shadow-sm border ${selectedSubject === s.id ? 'bg-somali-blue text-white shadow-blue-500/30 border-blue-400 scale-105' : 'bg-white/60 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 hover:bg-white border-white/30 dark:border-white/10'}`}
                  >
                      {s.name}
                  </button>
              ))}
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 italic mb-6 ml-1 flex items-center gap-1 font-medium">
             <i className="fas fa-info-circle"></i> More subjects will be added soon!
          </p>

          <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-3 ml-1 tracking-wider">2. Select Chapter</label>
          {chapters.length > 0 ? (
             <div className="relative group mb-6">
                <select 
                    value={selectedChapter} 
                    onChange={(e) => setSelectedChapter(e.target.value)}
                    className="w-full p-4 pl-5 bg-white/60 dark:bg-black/30 text-gray-800 dark:text-white border border-white/40 dark:border-white/10 rounded-2xl appearance-none font-bold focus:ring-2 focus:ring-somali-blue/50 backdrop-blur-sm transition-shadow shadow-inner"
                >
                    {chapters.map(c => (
                        <option key={c.id} value={c.id} className="dark:bg-gray-900">{c.name}</option>
                    ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-5 text-gray-600 dark:text-gray-400">
                    <i className="fas fa-chevron-down text-sm"></i>
                </div>
             </div>
          ) : (
              <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-8 italic bg-white/20 dark:bg-white/5 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 mb-6 font-medium">
                  {selectedSubject ? "No chapters found." : "Select a subject first."}
              </div>
          )}

          {viewMode === 'custom' && !hostedCode && (
              <>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 uppercase mb-3 ml-1 tracking-wider">3. Number of Questions</label>
                <div className="flex gap-2">
                    {[5, 10, 15, 20].map(n => (
                        <button
                            key={n}
                            onClick={() => setQuizLimit(n)}
                            className={`flex-1 py-3 rounded-2xl font-bold transition-all border ${quizLimit === n ? 'bg-green-500 text-white shadow-lg shadow-green-500/30 border-green-400' : 'bg-white/60 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 border-white/30 dark:border-white/10'}`}
                        >
                            {n}
                        </button>
                    ))}
                </div>
              </>
          )}
      </div>
  );

  return (
    <div className="flex flex-col min-h-full relative pb-24 md:pb-8 w-full">
      {viewMode === 'selection' && (
        <div className="flex flex-col items-center justify-center p-4 min-h-[85vh] animate__animated animate__fadeIn">
             <div className="w-full max-w-4xl mx-auto">
                 <div className="flex items-center gap-4 mb-8 pl-2">
                     <button onClick={() => navigate('/')} className="w-12 h-12 rounded-full bg-white/30 dark:bg-black/30 backdrop-blur-lg shadow-lg flex items-center justify-center text-gray-700 dark:text-white hover:text-somali-blue transition-colors border border-white/40 dark:border-white/10">
                        <i className="fas fa-arrow-left fa-lg"></i>
                     </button>
                     <h1 className="text-3xl font-black text-gray-900 dark:text-white drop-shadow-sm tracking-tight">Choose Mode</h1>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <button 
                        onClick={() => { playSound('click'); setViewMode('auto'); }}
                        className="group relative h-72 rounded-[2.5rem] overflow-hidden shadow-2xl transition-all hover:scale-[1.02] hover:shadow-blue-500/20 text-left border border-white/40 dark:border-white/10"
                     >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/80 to-indigo-600/80 backdrop-blur-md"></div>
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                        <i className="fas fa-bolt text-[10rem] text-white absolute -bottom-10 -right-10 opacity-10 rotate-12 group-hover:scale-110 transition-transform duration-700"></i>
                        
                        <div className="relative z-10 p-8 h-full flex flex-col justify-between">
                            <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-4 border border-white/20 shadow-inner group-hover:bg-white/30 transition-colors">
                                <i className="fas fa-search text-4xl"></i>
                            </div>
                            <div>
                                <h2 className="text-4xl font-black text-white mb-2 tracking-tight">Quick Match</h2>
                                <p className="text-blue-100 font-bold text-lg opacity-90">Find a random opponent instantly.</p>
                            </div>
                        </div>
                     </button>

                     <button 
                        onClick={() => { playSound('click'); setViewMode('custom'); }}
                        className="group relative h-72 rounded-[2.5rem] overflow-hidden shadow-2xl transition-all hover:scale-[1.02] hover:shadow-orange-500/20 text-left border border-white/40 dark:border-white/10"
                     >
                        <div className="absolute inset-0 bg-gradient-to-br from-orange-400/80 to-red-500/80 backdrop-blur-md"></div>
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                        <i className="fas fa-users text-[10rem] text-white absolute -bottom-10 -right-10 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700"></i>
                        
                        <div className="relative z-10 p-8 h-full flex flex-col justify-between">
                            <div className="w-20 h-20 rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-4 border border-white/20 shadow-inner group-hover:bg-white/30 transition-colors">
                                <i className="fas fa-key text-4xl"></i>
                            </div>
                            <div>
                                <h2 className="text-4xl font-black text-white mb-2 tracking-tight">Custom Room</h2>
                                <p className="text-orange-100 font-bold text-lg opacity-90">Private lobby for friends.</p>
                            </div>
                        </div>
                     </button>
                 </div>
             </div>
        </div>
      )}

      {viewMode !== 'selection' && (
          <div className="p-4 max-w-4xl mx-auto w-full animate__animated animate__fadeInRight">
              <div className="sticky top-0 z-30 bg-white/70 dark:bg-black/60 backdrop-blur-xl -mx-4 px-4 py-4 mb-6 border-b border-white/20 dark:border-white/5 shadow-sm flex items-center gap-4 transition-colors">
                <button onClick={goBack} className="text-gray-600 dark:text-gray-300 hover:text-somali-blue dark:hover:text-blue-400 transition-colors">
                    <i className="fas fa-arrow-left fa-lg"></i>
                </button>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    {viewMode === 'auto' ? 'Quick Match' : 'Custom Room'}
                </h1>
              </div>

              {viewMode === 'auto' ? (
                  <>
                    {!isSearching && <SelectionUI />}
                    <Card className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-700 bg-white/40 dark:bg-black/40">
                        <div className="w-24 h-24 bg-blue-100/50 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-blue-200 dark:border-blue-800">
                            <i className={`fas fa-search text-4xl text-somali-blue dark:text-blue-300 ${isSearching ? 'animate-bounce' : ''}`}></i>
                        </div>
                        <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">Find Opponent</h2>
                        <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium">{matchStatus || "Select a topic and find a match!"}</p>
                        
                        {isSearching ? (
                            <Button fullWidth onClick={cancelSearch} variant="danger" className="shadow-red-500/20 max-w-xs mx-auto">
                                Cancel Search
                            </Button>
                        ) : (
                            <Button fullWidth onClick={handleAutoMatch} disabled={!selectedChapter} className="shadow-blue-500/20 max-w-xs mx-auto">
                                Find Match
                            </Button>
                        )}
                    </Card>
                  </>
              ) : (
                  <div className="space-y-6">
                      <Card className="text-center">
                        <h3 className="font-bold mb-4 text-gray-900 dark:text-white text-lg">Host a Game</h3>
                        
                        {!hostedCode && <div className="mb-4 text-left"><SelectionUI /></div>}

                        {hostedCode ? (
                            <div className="bg-yellow-50/80 dark:bg-yellow-900/20 p-8 rounded-3xl border-2 border-yellow-400 border-dashed mb-4 relative backdrop-blur-sm animate__animated animate__zoomIn">
                                <p className="text-xs uppercase text-yellow-700 dark:text-yellow-300 font-bold tracking-widest mb-3">Room Code</p>
                                <div className="flex items-center justify-center gap-3 mb-4">
                                    <p className="text-6xl font-mono tracking-widest text-black dark:text-white font-black drop-shadow-sm">{hostedCode}</p>
                                </div>
                                <div className="flex justify-center">
                                    <button onClick={handleCopyCode} className="px-4 py-2 bg-yellow-400/20 hover:bg-yellow-400/40 rounded-xl text-sm flex items-center gap-2 text-yellow-800 dark:text-yellow-200 font-bold transition-colors">
                                       <i className="fas fa-copy"></i> Copy Code
                                    </button>
                                </div>
                                <div className="mt-6 flex justify-center items-center gap-3 text-gray-500 dark:text-gray-400 animate-pulse">
                                    <div className="w-2.5 h-2.5 bg-gray-400 rounded-full"></div>
                                    <span className="text-sm font-bold">Waiting for player to join...</span>
                                </div>
                            </div>
                        ) : (
                            <Button fullWidth onClick={createRoom} disabled={!selectedChapter}>
                                <i className="fas fa-plus-circle mr-2"></i> Generate Code
                            </Button>
                        )}
                      </Card>
                      
                      <div className="relative flex py-2 items-center">
                            <div className="flex-grow border-t border-gray-300 dark:border-gray-600 opacity-50"></div>
                            <span className="flex-shrink-0 mx-4 text-gray-400 dark:text-gray-500 font-bold bg-white/50 dark:bg-gray-800/50 px-3 py-1 rounded-full backdrop-blur-sm">OR</span>
                            <div className="flex-grow border-t border-gray-300 dark:border-gray-600 opacity-50"></div>
                      </div>

                      <Card className="text-center">
                        <h3 className="font-bold mb-6 text-gray-900 dark:text-white text-lg">Join a Game</h3>
                        <div className="relative mb-6">
                            <Input 
                                placeholder="0000" 
                                className="text-center text-4xl tracking-[1.5rem] font-mono h-24 font-black text-gray-900 dark:text-white !bg-gray-100 dark:!bg-black/30 border-2 !border-gray-200 dark:!border-gray-700 focus:!border-somali-blue dark:focus:!border-blue-500 rounded-3xl"
                                maxLength={4}
                                value={roomCode}
                                onChange={(e) => setRoomCode(e.target.value)}
                            />
                            <button 
                                onClick={handlePasteCode} 
                                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white dark:bg-gray-800 rounded-xl flex items-center justify-center text-gray-400 hover:text-somali-blue shadow-md transition-colors" 
                                title="Paste Code"
                            >
                                <i className="fas fa-paste text-xl"></i>
                            </button>
                        </div>
                        <Button fullWidth variant="secondary" onClick={joinRoom} disabled={roomCode.length !== 4} className="py-4 text-lg">
                            Join Room
                        </Button>
                      </Card>
                  </div>
              )}
          </div>
      )}
    </div>
  );
};

export default LobbyPage;