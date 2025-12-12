import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, push, get, remove, set, onValue } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../App';
import { Button, Input, Card } from '../components/UI';
import { playSound } from '../services/audioService';
import { MATCH_TIMEOUT_MS } from '../constants';
import { Subject, Chapter } from '../types';

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

  // Match State
  const [matchStatus, setMatchStatus] = useState<string>('');
  const [roomCode, setRoomCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [notification, setNotification] = useState<{msg: string, type: 'error'|'success'} | null>(null);
  
  // Custom Room Host State
  const [hostedCode, setHostedCode] = useState<string | null>(null);

  // Queue State
  const [queueKey, setQueueKey] = useState<string | null>(null);
  const timerRef = useRef<any>(null);

  // Fetch Subjects on Mount
  useEffect(() => {
    // Cache check
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

  // Fetch Chapters when Subject changes
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
            if(list.length > 0) setSelectedChapter(list[0].id); // Auto select first
        } else {
            setChapters([]);
        }
    });
  }, [selectedSubject]);

  const showNotify = (msg: string, type: 'error'|'success' = 'error') => {
    setNotification({msg, type});
    playSound(type === 'error' ? 'wrong' : 'click');
    setTimeout(() => setNotification(null), 3000);
  };

  // --- LOGIC: Auto Match ---
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

  // --- LOGIC: Custom Room ---
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
      await remove(roomRef);

      const matchId = `match_${Date.now()}`;
      await set(ref(db, `matches/${matchId}`), {
        matchId,
        status: 'active',
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

  // Cleanup
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

  // Handle Back Navigation
  const goBack = () => {
      if (isSearching) cancelSearch();
      if (hostedCode) {
        remove(ref(db, `rooms/${hostedCode}`));
        setHostedCode(null);
      }
      setViewMode('selection');
  };

  // --- RENDER COMPONENTS ---

  const SelectionUI = () => (
      <div className="mb-6 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">1. Select Subject</label>
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
              {subjects.map(s => (
                  <button 
                    key={s.id} 
                    onClick={() => setSelectedSubject(s.id)}
                    className={`px-4 py-2 rounded-lg whitespace-nowrap text-sm font-bold transition-all ${selectedSubject === s.id ? 'bg-somali-blue text-white shadow-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                  >
                      {s.name}
                  </button>
              ))}
          </div>

          <label className="block text-xs font-bold text-gray-500 uppercase mb-2">2. Select Chapter</label>
          {chapters.length > 0 ? (
             <div className="relative">
                <select 
                    value={selectedChapter} 
                    onChange={(e) => setSelectedChapter(e.target.value)}
                    className="w-full p-3 bg-gray-50 dark:bg-gray-700 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-xl appearance-none font-bold text-gray-700 focus:border-somali-blue"
                >
                    {chapters.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-700 dark:text-gray-400">
                    <i className="fas fa-chevron-down text-sm"></i>
                </div>
             </div>
          ) : (
              <div className="text-center text-gray-400 text-sm py-4 italic bg-gray-50 dark:bg-gray-700 rounded-xl">
                  {selectedSubject ? "No chapters found." : "Select a subject first."}
              </div>
          )}
      </div>
  );

  return (
    <div className="flex flex-col min-h-full relative pb-8 w-full">
      {/* Notification Toast */}
       {notification && (
         <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-2 rounded-full shadow-lg font-bold text-white flex items-center gap-2 animate__animated animate__fadeInDown ${notification.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
            {notification.type === 'error' ? <i className="fas fa-exclamation-circle"></i> : <i className="fas fa-check-circle"></i>}
            <span>{notification.msg}</span>
         </div>
       )}

      {/* --- SCENE 1: MODE SELECTION (Full Screen) --- */}
      {viewMode === 'selection' && (
        <div className="flex flex-col items-center justify-center p-6 min-h-[85vh] animate__animated animate__fadeIn">
             <div className="w-full max-w-4xl mx-auto">
                 <div className="flex items-center gap-4 mb-8">
                     <button onClick={() => navigate('/')} className="w-12 h-12 rounded-full bg-white dark:bg-gray-800 shadow-md flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-somali-blue transition-colors">
                        <i className="fas fa-arrow-left fa-lg"></i>
                     </button>
                     <h1 className="text-3xl font-extrabold dark:text-white">Choose Battle Mode</h1>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     {/* Auto Match Card */}
                     <button 
                        onClick={() => { playSound('click'); setViewMode('auto'); }}
                        className="group relative h-64 rounded-3xl overflow-hidden shadow-xl transition-all hover:scale-[1.02] hover:shadow-2xl text-left"
                     >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 opacity-90 transition-opacity group-hover:opacity-100"></div>
                        {/* Decor */}
                        <i className="fas fa-bolt text-9xl text-white absolute -bottom-8 -right-8 opacity-20 rotate-12 group-hover:scale-110 transition-transform duration-500"></i>
                        
                        <div className="relative z-10 p-8 h-full flex flex-col justify-between">
                            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-4">
                                <i className="fas fa-search text-3xl"></i>
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">Quick Match</h2>
                                <p className="text-blue-100 font-medium">Find a random opponent instantly based on subject.</p>
                            </div>
                        </div>
                     </button>

                     {/* Custom Room Card */}
                     <button 
                        onClick={() => { playSound('click'); setViewMode('custom'); }}
                        className="group relative h-64 rounded-3xl overflow-hidden shadow-xl transition-all hover:scale-[1.02] hover:shadow-2xl text-left"
                     >
                        <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-red-500 opacity-90 transition-opacity group-hover:opacity-100"></div>
                        {/* Decor */}
                        <i className="fas fa-users text-9xl text-white absolute -bottom-8 -right-8 opacity-20 -rotate-12 group-hover:scale-110 transition-transform duration-500"></i>
                        
                        <div className="relative z-10 p-8 h-full flex flex-col justify-between">
                            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-4">
                                <i className="fas fa-key text-3xl"></i>
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-2">Custom Room</h2>
                                <p className="text-orange-100 font-medium">Create a private lobby or join a friend's room.</p>
                            </div>
                        </div>
                     </button>
                 </div>
             </div>
        </div>
      )}

      {/* --- SCENE 2: SPECIFIC MODE UI --- */}
      {viewMode !== 'selection' && (
          <div className="p-6 max-w-4xl mx-auto w-full animate__animated animate__fadeInRight">
              <div className="sticky top-0 z-30 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md -mx-6 px-6 py-4 mb-6 border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm flex items-center gap-4 transition-colors">
                <button onClick={goBack} className="text-gray-600 dark:text-gray-300 hover:text-somali-blue dark:hover:text-blue-400 transition-colors">
                    <i className="fas fa-arrow-left fa-lg"></i>
                </button>
                <h1 className="text-2xl font-bold dark:text-white">
                    {viewMode === 'auto' ? 'Quick Match' : 'Custom Room'}
                </h1>
              </div>

              {viewMode === 'auto' ? (
                  // AUTO MATCH UI
                  <>
                    {!isSearching && <SelectionUI />}
                    <Card className="text-center py-10">
                        <div className="w-24 h-24 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <i className={`fas fa-search text-4xl text-somali-blue dark:text-blue-300 ${isSearching ? 'animate-bounce' : ''}`}></i>
                        </div>
                        <h2 className="text-xl font-bold mb-2 dark:text-white">Find Opponent</h2>
                        <p className="text-gray-500 dark:text-gray-400 mb-6">{matchStatus || "Select a topic and find a match!"}</p>
                        
                        {isSearching ? (
                            <Button fullWidth onClick={cancelSearch} variant="danger">
                                Cancel Search
                            </Button>
                        ) : (
                            <Button fullWidth onClick={handleAutoMatch} disabled={!selectedChapter}>
                                Find Match
                            </Button>
                        )}
                    </Card>
                  </>
              ) : (
                  // CUSTOM ROOM UI
                  <div className="space-y-6">
                      <Card className="text-center">
                        <h3 className="font-bold mb-4 dark:text-white text-lg">Host a Game</h3>
                        
                        {!hostedCode && <div className="mb-4 text-left"><SelectionUI /></div>}

                        {hostedCode ? (
                            <div className="bg-yellow-100 dark:bg-yellow-900/50 p-6 rounded-2xl border-2 border-yellow-400 mb-4 relative">
                                <p className="text-xs uppercase text-yellow-700 dark:text-yellow-300 font-bold tracking-widest mb-2">Room Code</p>
                                <div className="flex items-center justify-center gap-3 mb-2">
                                    <p className="text-5xl font-mono tracking-widest text-black dark:text-white font-black">{hostedCode}</p>
                                </div>
                                <div className="flex justify-center">
                                    <button onClick={handleCopyCode} className="text-sm flex items-center gap-2 text-yellow-800 dark:text-yellow-200 font-bold hover:underline">
                                       <i className="fas fa-copy"></i> Copy Code
                                    </button>
                                </div>
                                <div className="mt-4 flex justify-center items-center gap-2 text-gray-500 dark:text-gray-400 animate-pulse">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                    <span className="text-sm">Waiting for player to join...</span>
                                </div>
                            </div>
                        ) : (
                            <Button fullWidth onClick={createRoom} disabled={!selectedChapter}>
                                <i className="fas fa-plus-circle mr-2"></i> Generate Code
                            </Button>
                        )}
                      </Card>
                      
                      <div className="relative flex py-2 items-center">
                            <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
                            <span className="flex-shrink-0 mx-4 text-gray-400 dark:text-gray-500 font-bold">OR</span>
                            <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
                      </div>

                      <Card className="text-center">
                        <h3 className="font-bold mb-4 dark:text-white text-lg">Join a Game</h3>
                        <Input 
                            placeholder="0000" 
                            className="text-center text-3xl tracking-[1rem] font-mono h-16 font-bold"
                            maxLength={4}
                            value={roomCode}
                            onChange={(e) => setRoomCode(e.target.value)}
                            rightElement={
                            <button onClick={handlePasteCode} className="text-gray-400 hover:text-somali-blue dark:hover:text-white transition-colors p-3" title="Paste Code">
                                <i className="fas fa-paste text-xl"></i>
                            </button>
                            }
                        />
                        <Button fullWidth variant="secondary" onClick={joinRoom} disabled={roomCode.length !== 4}>
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