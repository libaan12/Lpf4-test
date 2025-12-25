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
  const [viewMode, setViewMode] = useState<'selection' | 'auto' | 'custom'>('selection');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [quizLimit, setQuizLimit] = useState<number>(10);
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
            const allOption: Chapter = { id: `ALL_${selectedSubject}`, name: 'Random Chapter', subjectId: selectedSubject };
            setChapters([allOption, ...list]);
            setSelectedChapter(allOption.id);
        } else setChapters([]);
    });
  }, [selectedSubject]);

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

             <div onClick={() => { playSound('click'); setViewMode('custom'); }} className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-3xl p-8 relative overflow-hidden cursor-pointer shadow-lg group hover:scale-[1.02] transition-transform">
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
                 <button onClick={() => { setViewMode('selection'); cancelSearch(); if(hostedCode) remove(ref(db, `rooms/${hostedCode}`)); }} className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                    <i className="fas fa-chevron-left dark:text-white"></i>
                 </button>
                 <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase">{viewMode === 'auto' ? 'Ranked' : 'Private'}</h2>
              </div>

              {viewMode === 'auto' && isSearching ? (
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
              ) : (
                  !hostedCode && (
                    <div className="space-y-6">
                        <div className="overflow-x-auto pb-4 flex gap-3 snap-x scrollbar-hide">
                            {subjects.map(s => (
                                <button key={s.id} onClick={() => setSelectedSubject(s.id)} className={`snap-start px-6 py-3 rounded-2xl font-black uppercase tracking-wider whitespace-nowrap transition-all border-b-4 ${selectedSubject === s.id ? 'bg-game-primary text-white border-game-primaryDark' : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`}>
                                    {s.name}
                                </button>
                            ))}
                        </div>

                        {chapters.length > 0 ? (
                            <div className="grid grid-cols-1 gap-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                                {chapters.map(c => (
                                    <div key={c.id} onClick={() => setSelectedChapter(c.id)} className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between group ${selectedChapter === c.id ? 'border-game-primary bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300'}`}>
                                        <span className={`font-bold ${selectedChapter === c.id ? 'text-game-primary' : 'text-slate-700 dark:text-slate-300'}`}>{c.name}</span>
                                        {selectedChapter === c.id && <i className="fas fa-check-circle text-game-primary text-xl"></i>}
                                    </div>
                                ))}
                            </div>
                        ) : (
                             <div className="text-center p-8 border-2 border-dashed border-slate-300 rounded-3xl text-slate-400 font-bold">Select a Subject to see Chapters</div>
                        )}

                        {viewMode === 'auto' ? (
                            <Button fullWidth size="lg" onClick={handleAutoMatch} disabled={!selectedChapter} className="shadow-xl">FIND MATCH</Button>
                        ) : (
                            <div className="space-y-4">
                                <Card className="bg-slate-50 dark:bg-slate-900/50">
                                    <div className="flex flex-col md:flex-row gap-2 mb-4">
                                        <input 
                                            value={roomCode} 
                                            onChange={e => setRoomCode(e.target.value)} 
                                            placeholder="ENTER CODE" 
                                            className="w-full md:flex-1 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-xl px-4 py-3 text-center font-black uppercase text-xl text-slate-900 dark:text-white placeholder-slate-400 focus:border-game-primary focus:ring-4 focus:ring-game-primary/20 outline-none transition-all" 
                                            maxLength={4} 
                                        />
                                        <Button fullWidth onClick={joinRoom} disabled={roomCode.length !== 4} className="md:w-auto">JOIN</Button>
                                    </div>
                                    <div className="border-t border-slate-200 dark:border-slate-700 my-4 flex items-center justify-center">
                                        <span className="bg-slate-50 dark:bg-slate-900 px-3 text-xs font-bold text-slate-400">OR</span>
                                    </div>
                                    <Button fullWidth variant="secondary" onClick={createRoom} disabled={!selectedChapter}>CREATE ROOM</Button>
                                </Card>
                            </div>
                        )}
                    </div>
                  )
              )}

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
          </div>
      )}
    </div>
  );
};

export default LobbyPage;