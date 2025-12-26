import React, { useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, push, get, remove, set, onValue } from 'firebase/database';
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

  const handleBack = () => {
    playSound('click');
    
    // If hosting a room, abort it first
    if (hostedCode) {
        remove(ref(db, `rooms/${hostedCode}`));
        setHostedCode(null);
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
          await remove(ref(db, `queue/${selectedChapter}/${oppKey}`));
          const matchId = `match_${Date.now()}`;
          await set(ref(db, `matches/${matchId}`), {
            matchId, status: 'active', mode: 'auto', turn: user.uid, currentQ: 0, answersCount: 0, scores: { [user.uid]: 0, [oppUid]: 0 },
            subject: selectedChapter, questionLimit: Math.floor(Math.random() * 11) + 10,
            players: { [user.uid]: { name: user.displayName, avatar: '' }, [oppUid]: { name: 'Opponent', avatar: '' } }, createdAt: Date.now()
          });
          await set(ref(db, `users/${user.uid}/activeMatch`), matchId);
          await set(ref(db, `users/${oppUid}/activeMatch`), matchId);
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
    onValue(ref(db, `rooms/${code}`), (snap) => { if (!snap.exists()) setHostedCode(null); });
    playSound('click');
    showToast("Room Created!", "success");
  };

  const joinRoom = async () => {
    if (!user || !roomCode) return;
    playSound('click');
    const roomRef = ref(db, `rooms/${roomCode}`);
    const snapshot = await get(roomRef);
    if (snapshot.exists()) {
      const rData = snapshot.val();
      if (rData.host === user.uid) { showToast("Your Room", "error"); return; }
      await remove(roomRef);
      const matchId = `match_${Date.now()}`;
      await set(ref(db, `matches/${matchId}`), {
        matchId, status: 'active', mode: 'custom', questionLimit: rData.questionLimit, turn: rData.host, currentQ: 0, answersCount: 0,
        scores: { [rData.host]: 0, [user.uid]: 0 }, subject: rData.lid,
        players: { [rData.host]: { name: 'Host', avatar: '' }, [user.uid]: { name: user.displayName, avatar: '' } }
      });
      await set(ref(db, `users/${rData.host}/activeMatch`), matchId);
      await set(ref(db, `users/${user.uid}/activeMatch`), matchId);
    } else showToast("Invalid Code", "error");
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
     if (hostedCode) remove(ref(db, `rooms/${hostedCode}`));
     if (queueKey && selectedChapter) remove(ref(db, `queue/${selectedChapter}/${queueKey}`));
  }, [hostedCode, queueKey, selectedChapter]);

  // Determine if Subject/Chapter Selection should be shown
  const showSelectors = (viewMode === 'auto' && !isSearching) || (viewMode === 'custom' && customSubMode === 'create' && !hostedCode);
  const pageTitle = viewMode === 'auto' ? 'Ranked Match' : customSubMode === 'join' ? 'Join' : customSubMode === 'create' ? 'Create Room' : 'Private Mode';

  return (
    <div className="min-h-full flex flex-col p-4 pb-24 max-w-4xl mx-auto w-full">
      {viewMode === 'selection' && (
        <div className="flex flex-col gap-6 pt-10">
             <div className="flex items-center gap-4 mb-4">
                 <button onClick={() => navigate('/')} className="w-12 h-12 rounded-2xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center hover:bg-white transition-colors">
                    <i className="fas fa-arrow-left text-slate-600 dark:text-slate-300"></i>
                 </button>
                 <div>
                    <h1 className="text-4xl font-black text-slate-800 dark:text-white uppercase italic">Battle Mode</h1>
                    <p className="text-slate-500 font-bold">Choose your path</p>
                 </div>
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
          <div className="pt-4 animate__animated animate__fadeInRight">
              <div className="flex items-center gap-4 mb-6">
                 <button onClick={handleBack} className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center transition-colors hover:bg-slate-300 dark:hover:bg-slate-700">
                    <i className="fas fa-chevron-left dark:text-white"></i>
                 </button>
                 <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase">{pageTitle}</h2>
              </div>

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
                      
                      <Button variant="danger" fullWidth onClick={() => {remove(ref(db, `rooms/${hostedCode}`)); setHostedCode(null);}}>
                          ABORT ROOM
                      </Button>
                  </Card>
              )}

              {/* PRIVATE MENU SELECTION */}
              {viewMode === 'custom' && customSubMode === 'menu' && (
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
              {viewMode === 'custom' && customSubMode === 'join' && (
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
                          <Button fullWidth size="lg" onClick={joinRoom} disabled={roomCode.length !== 4} className="shadow-xl">
                              JOIN LOBBY
                          </Button>
                      </Card>
                  </div>
              )}

              {/* SUBJECT & CHAPTER SELECTORS (Shared by Auto & Create) */}
              {showSelectors && (
                    <div className="space-y-6 animate__animated animate__fadeInUp">
                        <div className="overflow-x-auto pb-4 flex gap-3 snap-x scrollbar-hide">
                            {subjects.map(s => (
                                <button key={s.id} onClick={() => { setSelectedSubject(s.id); playSound('click'); }} className={`snap-start px-6 py-3 rounded-2xl font-black uppercase tracking-wider whitespace-nowrap transition-all border-b-4 ${selectedSubject === s.id ? 'bg-game-primary text-white border-game-primaryDark shadow-lg' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                                    {s.name}
                                </button>
                            ))}
                        </div>

                        {chapters.length > 0 ? (
                            <div className="grid grid-cols-1 gap-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                                {chapters.map(c => (
                                    <div key={c.id} onClick={() => { setSelectedChapter(c.id); playSound('click'); }} className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between group ${selectedChapter === c.id ? 'border-game-primary bg-indigo-50 dark:bg-indigo-900/20 shadow-md transform scale-[1.01]' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${selectedChapter === c.id ? 'bg-game-primary text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                                                <i className="fas fa-book-open"></i>
                                            </div>
                                            <span className={`font-bold ${selectedChapter === c.id ? 'text-game-primary' : 'text-slate-700 dark:text-slate-300'}`}>{c.name}</span>
                                        </div>
                                        {selectedChapter === c.id && <i className="fas fa-check-circle text-game-primary text-xl animate__animated animate__zoomIn"></i>}
                                    </div>
                                ))}
                            </div>
                        ) : (
                             <div className="text-center p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl text-slate-400 font-bold bg-slate-50 dark:bg-slate-900/50">
                                 <i className="fas fa-layer-group text-3xl mb-2 opacity-50"></i>
                                 <p>Select a Subject above to view Chapters</p>
                             </div>
                        )}

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