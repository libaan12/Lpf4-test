import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, push, get, remove, set, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../App';
import { Button, Input, Card } from '../components/UI';
import { playSound } from '../services/audioService';
import { MATCH_TIMEOUT_MS } from '../constants';
import { Subject, Chapter } from '../types';

const LobbyPage: React.FC = () => {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'auto' | 'custom'>('auto');
  
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
    const subRef = ref(db, 'subjects');
    get(subRef).then(snap => {
        if(snap.exists()) setSubjects(Object.values(snap.val()));
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
            setChapters(Object.values(snap.val()));
            setSelectedChapter(''); // Reset chapter on subject change
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

  // Auto Match Logic
  const handleAutoMatch = async () => {
    if (!user) return;
    if (!selectedChapter) {
        showNotify("Please select a subject and chapter first", "error");
        return;
    }

    setIsSearching(true);
    setMatchStatus('Searching for opponent...');
    playSound('click');

    // Queue is specific to the Chapter ID
    const queueRef = ref(db, `queue/${selectedChapter}`);
    
    // Check queue
    const snapshot = await get(queueRef);
    let foundOpponent = false;

    if (snapshot.exists()) {
      const queueData = snapshot.val();
      // Find someone who isn't me
      const opponentKey = Object.keys(queueData).find(key => queueData[key].uid !== user.uid);

      if (opponentKey) {
          foundOpponent = true;
          const opponentUid = queueData[opponentKey].uid;

          // Remove opponent from queue to "claim" them
          await remove(ref(db, `queue/${selectedChapter}/${opponentKey}`));

          // Create Match
          const matchId = `match_${Date.now()}`;
          const matchData = {
            matchId,
            status: 'active',
            turn: user.uid, // Creator goes first
            currentQ: 0,
            scores: { [user.uid]: 0, [opponentUid]: 0 },
            subject: selectedChapter, // IMPORTANT: Using ChapterID as the subject for questions
            players: {
              [user.uid]: { name: user.displayName, avatar: '' }, // Avatar fetched in game
              [opponentUid]: { name: 'Opponent', avatar: '' }
            },
            createdAt: Date.now()
          };

          await set(ref(db, `matches/${matchId}`), matchData);

          // Notify users (Update their activeMatch)
          await set(ref(db, `users/${user.uid}/activeMatch`), matchId);
          await set(ref(db, `users/${opponentUid}/activeMatch`), matchId);
          
          // Listener in App.tsx will handle redirect
          return;
      }
    }
    
    if (!foundOpponent) {
      // Add self to queue
      const newRef = push(queueRef);
      setQueueKey(newRef.key);
      await set(newRef, { uid: user.uid });
      setMatchStatus('Waiting for opponent...');

      // Timeout logic
      timerRef.current = setTimeout(async () => {
        if (isSearching) {
          // Check if I am still in queue (wasn't picked up)
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

  // Custom Room: Create
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
      lid: selectedChapter, // Storing Chapter ID as 'lid' (Level ID)
      createdAt: Date.now()
    });

    // Listen for room deletion (means someone joined)
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

  // Custom Room: Join (No selection needed)
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
      const chapterId = roomData.lid; // Retrieve the chapter ID set by host
      
      // Delete room to signal join
      await remove(roomRef);

      // Create Match
      const matchId = `match_${Date.now()}`;
      await set(ref(db, `matches/${matchId}`), {
        matchId,
        status: 'active',
        turn: hostUid,
        currentQ: 0,
        scores: { [hostUid]: 0, [user.uid]: 0 },
        subject: chapterId, // Match uses the chapter ID to fetch questions
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

  // Cleanup on unmount
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

  // UI Helper for Selection
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
             <div className="grid grid-cols-1 gap-2">
                 {chapters.map(c => (
                     <button
                        key={c.id}
                        onClick={() => setSelectedChapter(c.id)}
                        className={`text-left px-4 py-3 rounded-xl text-sm font-bold transition-all border-2 ${selectedChapter === c.id ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'border-transparent bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200'}`}
                     >
                         {c.name}
                     </button>
                 ))}
             </div>
          ) : (
              <div className="text-center text-gray-400 text-sm py-4 italic">
                  {selectedSubject ? "No chapters found." : "Select a subject first."}
              </div>
          )}
      </div>
  );

  return (
    <div className="flex flex-col p-6 min-h-full relative pb-24">
      {/* Notification Toast */}
       {notification && (
         <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-6 py-2 rounded-full shadow-lg font-bold text-white flex items-center gap-2 animate__animated animate__fadeInDown ${notification.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
            {notification.type === 'error' ? <i className="fas fa-exclamation-circle"></i> : <i className="fas fa-check-circle"></i>}
            <span>{notification.msg}</span>
         </div>
       )}

      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold dark:text-white">Battle Lobby</h1>
      </div>

      <div className="flex bg-gray-200 dark:bg-gray-700 rounded-xl p-1 mb-6">
        <button 
          className={`flex-1 py-2 rounded-lg font-bold transition-all ${activeTab === 'auto' ? 'bg-white dark:bg-gray-600 shadow-sm text-somali-blue dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}
          onClick={() => setActiveTab('auto')}
        >
          Auto Match
        </button>
        <button 
          className={`flex-1 py-2 rounded-lg font-bold transition-all ${activeTab === 'custom' ? 'bg-white dark:bg-gray-600 shadow-sm text-somali-blue dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}
          onClick={() => setActiveTab('custom')}
        >
          Custom Room
        </button>
      </div>

      <div className="flex-1 flex flex-col">
        {activeTab === 'auto' ? (
          <>
            {!isSearching && <SelectionUI />}
            <Card className="text-center py-10 animate__animated animate__fadeIn">
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
          <div className="space-y-4 animate__animated animate__fadeIn">
            <Card className="text-center">
              <h3 className="font-bold mb-4 dark:text-white">Host a Game</h3>
              
              {!hostedCode && <div className="mb-4 text-left"><SelectionUI /></div>}

              {hostedCode ? (
                <div className="bg-yellow-100 dark:bg-yellow-900/50 p-4 rounded-xl border-2 border-yellow-400 mb-4 relative">
                  <p className="text-xs uppercase text-yellow-700 dark:text-yellow-300 font-bold">Room Code</p>
                  <div className="flex items-center justify-center gap-3">
                    <p className="text-4xl font-mono tracking-widest text-black dark:text-white">{hostedCode}</p>
                    <button onClick={handleCopyCode} className="w-10 h-10 flex items-center justify-center rounded-full bg-yellow-200 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 hover:scale-110 transition-transform shadow-sm" title="Copy Code">
                       <i className="fas fa-copy"></i>
                    </button>
                  </div>
                  <p className="text-xs mt-2 animate-pulse text-gray-600 dark:text-gray-300">Waiting for player...</p>
                </div>
              ) : (
                <Button fullWidth onClick={createRoom} disabled={!selectedChapter}>Generate Code</Button>
              )}
            </Card>
            
            <div className="flex items-center gap-2 text-gray-400">
                <div className="h-px bg-gray-300 dark:bg-gray-600 flex-1"></div>
                <span>OR</span>
                <div className="h-px bg-gray-300 dark:bg-gray-600 flex-1"></div>
            </div>

            <Card className="text-center">
              <h3 className="font-bold mb-4 dark:text-white">Join a Game</h3>
              <Input 
                placeholder="Enter 4-digit code" 
                className="text-center text-xl tracking-widest font-mono"
                maxLength={4}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                rightElement={
                  <button onClick={handlePasteCode} className="text-gray-400 hover:text-somali-blue dark:hover:text-white transition-colors p-2" title="Paste Code">
                      <i className="fas fa-paste"></i>
                  </button>
                }
              />
              <Button fullWidth variant="secondary" onClick={joinRoom} disabled={roomCode.length !== 4}>Join Room</Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default LobbyPage;