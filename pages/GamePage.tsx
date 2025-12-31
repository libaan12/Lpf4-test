
import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, onDisconnect, get, set, remove, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { POINTS_PER_QUESTION } from '../constants';
import { MatchState, Question, Chapter, UserProfile } from '../types';
import { Avatar, Button, Card, Modal } from '../components/UI';
import { playSound } from '../services/audioService';
import { showToast, showConfirm, showAlert } from '../services/alert';
import confetti from 'canvas-confetti';

const createSeededRandom = (seedStr: string) => {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
        hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
        hash |= 0;
    }
    let seed = Math.abs(hash);
    return () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };
};

const shuffleArraySeeded = <T,>(array: T[], rng: () => number): T[] => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
};

const GamePage: React.FC = () => {
  const { matchId } = useParams();
  const { user, profile } = useContext(UserContext);
  const navigate = useNavigate();

  const [match, setMatch] = useState<MatchState | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjectName, setSubjectName] = useState('');
  
  // Players Data
  const [leftProfile, setLeftProfile] = useState<UserProfile | null>(null);
  const [rightProfile, setRightProfile] = useState<UserProfile | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState<{correct: boolean, answer: number} | null>(null);
  
  // Animation State
  const [showIntro, setShowIntro] = useState(false);
  const [showTurnAlert, setShowTurnAlert] = useState(false);
  const prevTurnRef = useRef<string | null>(null);
  
  // Opponent Details Modal
  const [showOpponentModal, setShowOpponentModal] = useState(false);
  
  // Loading State
  const [isLoadingError, setIsLoadingError] = useState(false);
  
  const processingRef = useRef(false);
  const questionsLoadedRef = useRef(false);

  // 1. Sync Match Data
  useEffect(() => {
    if (!matchId || !user) return;
    const matchRef = ref(db, `matches/${matchId}`);

    const unsubscribe = onValue(matchRef, async (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        if (!profile?.isSupport) set(ref(db, `users/${user.uid}/activeMatch`), null);
        navigate(profile?.isSupport ? '/support' : '/');
        return;
      }
      
      setMatch(data);

      // Determine Role
      const pIds = Object.keys(data.players || {});
      const userIsPlayer = pIds.includes(user.uid);
      
      if (!userIsPlayer) {
          if (profile?.isSupport) {
              setIsSpectator(true);
          } else {
              navigate('/');
              return;
          }
      }

      // Check Winner
      if (data.status === 'completed' && data.winner) {
          if (data.winner === user.uid) { 
              playSound('win'); 
              confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } }); 
          }
          else if (data.winner !== 'draw' && !isSpectator) playSound('wrong'); 
      }
    });

    return () => { 
        unsubscribe(); 
    };
  }, [matchId, user, navigate, profile?.isSupport, isSpectator]); 

  // 2. Presence Logic (Separated to avoid loop)
  useEffect(() => {
      if (!matchId || !user || isSpectator) return;
      
      // Update presence only on mount/unmount or matchId change, NOT on every match update
      const myStatusRef = ref(db, `matches/${matchId}/players/${user.uid}`);
      const myLevel = Math.floor((profile?.points || 0) / 10) + 1;
      
      update(myStatusRef, { status: 'online', lastSeen: serverTimestamp(), level: myLevel });
      const disconnectRef = onDisconnect(myStatusRef);
      disconnectRef.update({ status: 'offline', lastSeen: serverTimestamp() });

      return () => {
          disconnectRef.cancel();
      };
  }, [matchId, user, isSpectator, profile?.points]);

  // 3. Load Profiles
  useEffect(() => {
      if (!match || !user) return;
      
      const loadProfiles = async () => {
          const pIds = Object.keys(match.players || {});
          
          if (isSpectator) {
              // Spectator View: Player 1 (Left), Player 2 (Right)
              if (pIds.length >= 2) {
                  const p1Snap = await get(ref(db, `users/${pIds[0]}`));
                  const p2Snap = await get(ref(db, `users/${pIds[1]}`));
                  if (p1Snap.exists()) setLeftProfile({ uid: pIds[0], ...p1Snap.val() });
                  if (p2Snap.exists()) setRightProfile({ uid: pIds[1], ...p2Snap.val() });
              }
          } else {
              // Player View: Me (Left), Opponent (Right)
              setLeftProfile(profile);
              const oppUid = pIds.find(uid => uid !== user.uid);
              if (oppUid) {
                  const oppSnap = await get(ref(db, `users/${oppUid}`));
                  if (oppSnap.exists()) {
                      setRightProfile({ uid: oppUid, ...oppSnap.val() });
                      
                      // Show Intro only if start of game
                      if (match.currentQ === 0 && match.answersCount === 0 && !isSpectator) {
                          setShowIntro(true);
                          playSound('click'); 
                      }
                  }
              }
          }
      };
      loadProfiles();
  }, [match?.matchId, user?.uid, isSpectator, profile]); // Re-run if matchId changes or role changes

  // 4. Load Questions & Subject Name
  useEffect(() => {
      if (!match || !match.subject || questions.length > 0 || questionsLoadedRef.current) return;
      loadQuestions();
  }, [match?.subject, match?.matchId]);

  const loadQuestions = async () => {
      if (!match) return;
      
      questionsLoadedRef.current = true; // Lock
      setIsLoadingError(false);
      let loadedQ: Question[] = [];
      const cacheKey = `questions_cache_${match.subject}`;
      const cachedData = localStorage.getItem(cacheKey);
      
      try {
        if (match.subjectTitle) setSubjectName(match.subjectTitle);

        if (match.subject.startsWith('ALL_')) {
            const subjectId = match.subject.replace('ALL_', '');
            if (!match.subjectTitle) {
                const subSnap = await get(ref(db, `subjects/${subjectId}`));
                if(subSnap.exists()) setSubjectName(subSnap.val().name);
            }
            const chaptersSnap = await get(ref(db, `chapters/${subjectId}`));
            if (chaptersSnap.exists()) {
                const chapters = Object.values(chaptersSnap.val() || {}) as Chapter[];
                const snaps = await Promise.all(chapters.map(c => get(ref(db, `questions/${c.id}`))));
                snaps.forEach(s => s.exists() && loadedQ.push(...Object.values(s.val()) as Question[]));
            }
        } else {
            if (cachedData) try { loadedQ = JSON.parse(cachedData); } catch(e) {}
            if (loadedQ.length === 0) {
                const snap = await get(ref(db, `questions/${match.subject}`));
                if(snap.exists()) {
                    loadedQ = Object.values(snap.val()) as Question[];
                    try { localStorage.setItem(cacheKey, JSON.stringify(loadedQ)); } catch(e) {}
                }
            }
            if(!match.subjectTitle) setSubjectName("Battle Arena"); 
        }

        if (loadedQ.length > 0) {
            const rng = createSeededRandom(match.matchId);
            let shuffledQ = shuffleArraySeeded(loadedQ, rng).map(q => {
                const opts = q.options.map((o, i) => ({ t: o, c: i === q.answer }));
                const sOpts = shuffleArraySeeded(opts, rng);
                return { ...q, options: sOpts.map(o => o.t), answer: sOpts.findIndex(o => o.c) };
            });
            const limit = match.questionLimit || 10;
            setQuestions(shuffledQ.slice(0, limit));
        } else {
            setIsLoadingError(true);
            questionsLoadedRef.current = false;
        }
      } catch(e) {
          setIsLoadingError(true);
          questionsLoadedRef.current = false;
      }
  };

  const handleRetry = () => {
      questionsLoadedRef.current = false;
      setIsLoadingError(false);
      loadQuestions();
  };

  // 5. Reset Selection on Question Change
  useEffect(() => {
      setSelectedOption(null);
      setShowFeedback(null);
      processingRef.current = false;
  }, [match?.currentQ]);

  // Handle Intro Timeout
  useEffect(() => {
      if (showIntro && match && rightProfile) {
          const timer = setTimeout(() => setShowIntro(false), 3500); 
          return () => clearTimeout(timer);
      }
  }, [showIntro, match, rightProfile]);

  // Handle Turn Notifications
  useEffect(() => {
      if (!match || !user || isSpectator) return;
      if (prevTurnRef.current && prevTurnRef.current !== match.turn && match.turn === user.uid) {
          setShowTurnAlert(true);
          playSound('click');
          const timer = setTimeout(() => setShowTurnAlert(false), 1500); 
          return () => clearTimeout(timer);
      }
      prevTurnRef.current = match.turn;
  }, [match?.turn, user?.uid, isSpectator]);

  const currentQuestion = match && questions.length > 0 ? questions[match.currentQ] : null;
  const isMyTurn = match?.turn === user?.uid;
  const isGameOver = match?.status === 'completed';

  const handleOptionClick = async (index: number) => {
    if (isSpectator) return; // Spectators cannot click
    if (!match || !user || !isMyTurn || selectedOption !== null || processingRef.current || !currentQuestion) return;
    
    // Safety check for scores object
    const currentScores = match.scores || {};
    
    setSelectedOption(index);
    playSound('click');
    processingRef.current = true;

    const isCorrect = index === currentQuestion.answer;
    isCorrect ? playSound('correct') : playSound('wrong');
    setShowFeedback({ correct: isCorrect, answer: currentQuestion.answer });

    setTimeout(async () => {
        const oppUid = Object.keys(currentScores).find(uid => uid !== user.uid) || '';
        const newScores = { ...currentScores };
        if (isCorrect) newScores[user.uid] = (newScores[user.uid] || 0) + POINTS_PER_QUESTION;

        const currentAnswers = match.answersCount || 0;
        let nextQ = match.currentQ;
        let nextAnswersCount = currentAnswers + 1;
        let nextTurn = oppUid; 

        if (currentAnswers >= 1) {
            if (match.currentQ >= questions.length - 1) {
                let winner = 'draw';
                const myScore = newScores[user.uid] || 0;
                const oppScore = newScores[oppUid] || 0;
                
                if (myScore > oppScore) winner = user.uid;
                else if (oppScore > myScore) winner = oppUid;

                const myPts = (await get(ref(db, `users/${user.uid}/points`))).val() || 0;
                await update(ref(db, `users/${user.uid}`), { points: myPts + myScore, activeMatch: null });
                if (oppUid) {
                    const oppPts = (await get(ref(db, `users/${oppUid}/points`))).val() || 0;
                    await update(ref(db, `users/${oppUid}`), { points: oppPts + oppScore, activeMatch: null });
                }

                await update(ref(db, `matches/${matchId}`), { scores: newScores, status: 'completed', winner, answersCount: 2 });
                
                setSelectedOption(null); setShowFeedback(null); processingRef.current = false;
                return;
            }
            nextQ = match.currentQ + 1;
            nextAnswersCount = 0;
        }

        await update(ref(db, `matches/${matchId}`), { 
            scores: newScores, currentQ: nextQ, turn: nextTurn, answersCount: nextAnswersCount 
        });

        setSelectedOption(null); setShowFeedback(null); processingRef.current = false;
    }, 400); 
  };

  const handleLeave = async () => {
      if(!user || !matchId) return;
      if (isSpectator) {
          navigate('/support');
          return;
      }
      if (match?.status === 'completed') try { await remove(ref(db, `matches/${matchId}`)); } catch(e) {}
      await set(ref(db, `users/${user.uid}/activeMatch`), null);
      navigate('/');
  };

  const handleSurrender = async () => {
      if (isSpectator) {
          handleLeave();
          return;
      }
      if (!match || !user || !rightProfile) return;
      const confirmed = await showConfirm("Exit Match?", "If you exit now, you will lose the match and forfeit points.", "Exit", "Stay", "warning");
      if (!confirmed) return;

      const oppPts = (await get(ref(db, `users/${rightProfile.uid}/points`))).val() || 0;
      await update(ref(db, `users/${rightProfile.uid}`), { points: oppPts + 20, activeMatch: null });
      await update(ref(db, `matches/${matchId}`), { status: 'completed', winner: rightProfile.uid });
      await set(ref(db, `users/${user.uid}/activeMatch`), null);
      navigate('/');
      showToast("Match Forfeited", "info");
  };

  const addFriend = async () => {
      if(!user || !rightProfile) return;
      await update(ref(db, `users/${rightProfile.uid}/friendRequests/${user.uid}`), { status: 'pending' });
      showToast("Friend Request Sent!", "success");
      setShowOpponentModal(false);
  };

  // LOADING SCREEN
  if (!match || !leftProfile || !rightProfile || (!currentQuestion && !isGameOver && !showIntro && !isSpectator)) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
            {isLoadingError ? (
                <div className="animate__animated animate__fadeIn">
                     <i className="fas fa-exclamation-circle text-4xl text-red-500 mb-4"></i>
                     <h2 className="font-bold text-xl mb-2">Connection Issue</h2>
                     <div className="flex gap-3 justify-center">
                        <Button onClick={handleLeave} variant="secondary">Return</Button>
                        <Button onClick={handleRetry} variant="primary">Retry</Button>
                     </div>
                </div>
            ) : (
                <div className="animate__animated animate__fadeIn">
                     <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                        <i className="fas fa-gamepad text-game-accent"></i>
                     </div>
                     <h2 className="font-bold text-xl">{isSpectator ? 'Loading Match...' : 'Waiting for opponent...'}</h2>
                </div>
            )}
        </div>
    );
  }

  const leftLevel = Math.floor((leftProfile.points || 0) / 10) + 1;
  const rightLevel = Math.floor((rightProfile.points || 0) / 10) + 1;
  
  // UI Logic helpers
  const leftIsActive = match.turn === leftProfile.uid;
  const rightIsActive = match.turn === rightProfile.uid;
  
  // Safe scores
  const safeScores = match.scores || {};
  const winnerUid = match.winner;

  return (
    <div className="min-h-screen relative flex flex-col font-sans overflow-hidden transition-colors pt-24">
       
      {/* VS Screen Animation */}
      {showIntro && !isSpectator && (
          <div className="fixed inset-0 z-[60] flex flex-col md:flex-row items-center justify-center bg-slate-900 overflow-hidden">
              {/* Left Side (Me) */}
              <div className="w-full md:w-1/2 h-1/2 md:h-full bg-orange-500 relative flex items-center justify-center animate__animated animate__slideInLeft">
                  <div className="text-center z-10">
                      <Avatar src={leftProfile.avatar} seed={leftProfile.uid} size="xl" className="border-4 border-white shadow-2xl mb-4 mx-auto" isVerified={leftProfile.isVerified} />
                      <h2 className="text-3xl font-black text-white uppercase drop-shadow-md">{leftProfile.name}</h2>
                      <div className="inline-block bg-black/30 px-3 py-1 rounded-full text-white font-bold mt-2">LVL {leftLevel}</div>
                  </div>
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
              </div>

              {/* VS Badge */}
              <div className="absolute z-20 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate__animated animate__zoomIn animate__delay-1s">
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center border-4 border-slate-900 shadow-[0_0_50px_rgba(255,255,255,0.5)]">
                      <span className="font-black text-4xl italic text-slate-900">VS</span>
                  </div>
              </div>

              {/* Right Side (Opponent) */}
              <div className="w-full md:w-1/2 h-1/2 md:h-full bg-blue-600 relative flex items-center justify-center animate__animated animate__slideInRight">
                  <div className="text-center z-10">
                      <Avatar src={rightProfile.avatar} seed={rightProfile.uid} size="xl" className="border-4 border-white shadow-2xl mb-4 mx-auto" isVerified={rightProfile.isVerified} />
                      <h2 className="text-3xl font-black text-white uppercase drop-shadow-md">{rightProfile.name}</h2>
                      <div className="inline-block bg-black/30 px-3 py-1 rounded-full text-white font-bold mt-2">LVL {rightLevel}</div>
                  </div>
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
              </div>
          </div>
      )}

      {showTurnAlert && !isGameOver && !isSpectator && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
             <div className="bg-game-primary/90 text-white px-8 py-4 rounded-3xl shadow-2xl animate__animated animate__zoomInDown flex flex-col items-center">
                <i className="fas fa-bolt text-5xl mb-2 animate-bounce"></i>
                <h2 className="text-4xl font-black italic uppercase tracking-widest">Your Turn!</h2>
             </div>
          </div>
      )}

      {!isGameOver && (
          <div className="fixed top-20 left-4 z-[60] md:top-24">
              <button onClick={handleSurrender} className="bg-red-500/80 hover:bg-red-600 text-white px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg border-2 border-white/20 transition-all flex items-center gap-2 backdrop-blur-md">
                  <i className="fas fa-sign-out-alt"></i> Exit
              </button>
          </div>
      )}
      
      {isSpectator && !isGameOver && (
          <div className="fixed top-20 right-4 z-[60] md:top-24">
              <div className="bg-blue-600/90 text-white px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg border-2 border-white/20 flex items-center gap-2 backdrop-blur-md animate-pulse">
                  <i className="fas fa-eye"></i> Spectating
              </div>
          </div>
      )}

      {/* HEADER SCOREBOARD */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-xl border-b border-slate-700 shadow-xl p-3">
         <div className="max-w-4xl mx-auto flex justify-between items-center">
            {/* Left Player */}
            <div className={`flex items-center gap-3 transition-all duration-300 ${leftIsActive && !isGameOver ? 'scale-105 opacity-100' : 'scale-95 opacity-60'}`}>
                 <div className="relative">
                     <Avatar src={leftProfile.avatar} seed={leftProfile.uid} size="sm" border={leftIsActive ? '3px solid #f97316' : '3px solid transparent'} className={leftIsActive ? 'shadow-lg shadow-orange-500/50' : ''} isVerified={leftProfile.isVerified} />
                     <div className="absolute -bottom-1 -right-1 bg-gray-800 text-white text-[8px] px-1 rounded font-bold border border-white">LVL {leftLevel}</div>
                 </div>
                 <div>
                     <div className="flex items-center gap-1">
                         <div className="text-[10px] font-black uppercase text-slate-400 truncate w-16">{leftProfile.name}</div>
                         {leftIsActive && !isGameOver && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>}
                     </div>
                     <div className="text-2xl font-black text-game-primary leading-none">{safeScores[leftProfile.uid] ?? 0}</div>
                 </div>
            </div>
            
            <div className="flex flex-col items-center">
                 <div className="text-xl font-black text-slate-300 dark:text-gray-600 italic">VS</div>
                 <div className="text-xs font-bold text-slate-400">Q {match.currentQ + 1}/{questions.length}</div>
            </div>
            
            {/* Right Player */}
            <div className={`flex items-center gap-3 flex-row-reverse text-right transition-all duration-300 ${rightIsActive && !isGameOver ? 'scale-105 opacity-100' : 'scale-95 opacity-60'} ${!isSpectator ? 'cursor-pointer' : ''}`} onClick={() => !isSpectator && setShowOpponentModal(true)}>
                 <div className="relative">
                    <Avatar src={rightProfile.avatar} seed={rightProfile.uid} size="sm" border={rightIsActive ? '3px solid #ef4444' : '3px solid transparent'} className={rightIsActive ? 'shadow-lg shadow-red-500/50' : ''} isVerified={rightProfile.isVerified} />
                    <div className="absolute -bottom-1 -right-1 bg-gray-800 text-white text-[8px] px-1 rounded font-bold border border-white">LVL {rightLevel}</div>
                 </div>
                 <div>
                     <div className="flex items-center gap-1 justify-end">
                         {rightIsActive && !isGameOver && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
                         <div className="text-[10px] font-black uppercase text-slate-400 truncate w-16">
                             {rightProfile.name}
                         </div>
                     </div>
                     <div className="text-2xl font-black text-game-danger leading-none">{safeScores[rightProfile.uid] ?? 0}</div>
                 </div>
            </div>
         </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-3xl mx-auto z-10">
        {isGameOver ? (
           <Card className="text-center w-full animate__animated animate__zoomIn !p-0 overflow-hidden border-none shadow-2xl bg-white dark:bg-slate-800">
               {/* Result Header */}
               <div className={`py-12 relative ${winnerUid === user?.uid && !isSpectator ? 'bg-gradient-to-br from-yellow-400 to-orange-500' : winnerUid === 'draw' ? 'bg-slate-500' : isSpectator ? 'bg-indigo-600' : 'bg-red-500'}`}>
                   <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                   <h1 className="text-5xl md:text-6xl font-black text-white uppercase italic tracking-tighter drop-shadow-lg relative z-10 animate__animated animate__bounceIn">
                       {isSpectator ? 'Match Over!' : winnerUid === user?.uid ? 'Victory!' : winnerUid === 'draw' ? 'Draw' : 'Defeat'}
                   </h1>
                   <p className="text-white/80 font-bold uppercase tracking-widest mt-2 relative z-10">
                       {isSpectator ? 'Result' : winnerUid === user?.uid ? '+20 Points' : winnerUid === 'draw' ? '+5 Points' : '+0 Points'}
                   </p>
               </div>
               
               <div className="p-8">
                   <div className="flex justify-center items-center gap-8 mb-8">
                       <div className="text-center">
                           <div className="relative">
                               <Avatar src={leftProfile.avatar} size="lg" className={`mx-auto mb-3 shadow-xl border-4 ${winnerUid === leftProfile.uid ? 'border-yellow-400 ring-4 ring-yellow-400/30' : 'border-slate-200 grayscale'}`} />
                               {winnerUid === leftProfile.uid && <div className="absolute -top-6 -right-2 text-4xl animate-bounce">👑</div>}
                           </div>
                           <div className="font-bold text-slate-800 dark:text-white truncate max-w-[100px]">{leftProfile.name}</div>
                           <div className="font-black text-3xl text-slate-900 dark:text-white mt-1">{safeScores[leftProfile.uid] ?? 0}</div>
                       </div>

                       <div className="text-slate-300 font-black text-xl italic">VS</div>

                       <div className="text-center">
                           <div className="relative">
                               <Avatar src={rightProfile.avatar} size="lg" className={`mx-auto mb-3 shadow-xl border-4 ${winnerUid === rightProfile.uid ? 'border-yellow-400 ring-4 ring-yellow-400/30' : 'border-slate-200 grayscale'}`} />
                               {winnerUid === rightProfile.uid && <div className="absolute -top-6 -right-2 text-4xl animate-bounce">👑</div>}
                           </div>
                           <div className="font-bold text-slate-800 dark:text-white truncate max-w-[100px]">{rightProfile.name}</div>
                           <div className="font-black text-3xl text-slate-900 dark:text-white mt-1">{safeScores[rightProfile.uid] ?? 0}</div>
                       </div>
                   </div>

                   {!isSpectator && (
                       <div className="grid grid-cols-2 gap-4 mb-6">
                           <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl">
                               <div className="text-xs text-slate-400 uppercase font-bold">Accuracy</div>
                               <div className="font-black text-lg text-slate-800 dark:text-white">
                                   {Math.round(((safeScores[leftProfile.uid] ?? 0) / (questions.length * POINTS_PER_QUESTION)) * 100)}%
                               </div>
                           </div>
                           <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-xl">
                               <div className="text-xs text-slate-400 uppercase font-bold">Total XP</div>
                               <div className="font-black text-lg text-game-primary">{leftProfile.points}</div>
                           </div>
                       </div>
                   )}

                   <Button onClick={handleLeave} size="lg" fullWidth className="shadow-xl animate__animated animate__pulse animate__infinite">
                       {isSpectator ? 'Leave Match' : 'Continue'} <i className="fas fa-arrow-right ml-2"></i>
                   </Button>
               </div>
           </Card>
        ) : (
            <>
                 {/* Question Card */}
                 <div className="relative w-full bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-[0_8px_30px_rgb(0,0,0,0.12)] mb-8 min-h-[200px] flex flex-col items-center justify-center text-center border border-slate-100 dark:border-slate-700 relative overflow-hidden transition-all duration-300 hover:shadow-2xl">
                     <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-orange-400 via-red-500 to-purple-600"></div>
                     <div className="relative z-10 mb-5">
                         <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 shadow-sm backdrop-blur-md">
                             <i className="fas fa-layer-group text-game-primary text-xs"></i>
                             <span className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest">
                                 {subjectName || "Battle Arena"}
                             </span>
                         </span>
                     </div>
                     <h2 className="relative z-10 text-xl md:text-3xl font-black text-slate-800 dark:text-white leading-snug drop-shadow-sm animate__animated animate__fadeIn">
                        {currentQuestion && currentQuestion.question}
                     </h2>
                 </div>

                 {/* Options Grid */}
                 <div className="relative w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                     {/* Turn Overlay */}
                     {!isMyTurn && !isSpectator && (
                         <div className="absolute inset-0 z-20 bg-slate-100/50 dark:bg-slate-900/50 backdrop-blur-[2px] rounded-3xl flex items-center justify-center animate__animated animate__fadeIn">
                             <div className="bg-white dark:bg-slate-800 px-8 py-4 rounded-2xl shadow-2xl flex flex-col items-center gap-2 border-2 border-slate-200 dark:border-slate-600 transform scale-110">
                                 <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
                                     <i className="fas fa-hourglass-half text-indigo-500 animate-spin-slow"></i>
                                 </div>
                                 <div className="text-center">
                                     <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Waiting for</div>
                                     <div className="text-base font-black text-slate-800 dark:text-white">{rightProfile.name}</div>
                                 </div>
                             </div>
                         </div>
                     )}

                     {currentQuestion && currentQuestion.options.map((opt, idx) => {
                        let isActive = selectedOption === idx;
                        let bgClass = "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200";
                        let letterClass = "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400";
                        
                        if (isSpectator) {
                            bgClass += " opacity-90";
                        } else {
                            bgClass += " hover:border-game-primary dark:hover:border-game-primary";
                        }

                        if (isActive) {
                             bgClass = "bg-game-primary border-game-primaryDark text-white translate-y-[4px] border-b-0";
                             letterClass = "bg-white/20 text-white";
                        } else if (!isSpectator) {
                             bgClass += " border-b-[6px] active:border-b-0 active:translate-y-[6px]";
                        } else {
                             bgClass += " border-b-[6px]";
                        }

                        if (showFeedback) {
                            if (idx === showFeedback.answer) {
                                bgClass = "bg-green-500 border-green-700 text-white translate-y-[4px] border-b-0 animate__animated animate__pulse";
                                letterClass = "bg-white/20 text-white";
                            } else if (isActive) {
                                bgClass = "bg-red-500 border-red-700 text-white translate-y-[4px] border-b-0 animate__animated animate__shakeX";
                                letterClass = "bg-white/20 text-white";
                            } else if (!isSpectator) {
                                bgClass = "bg-slate-100 dark:bg-slate-900 border-transparent opacity-50 grayscale";
                            }
                        }

                        return (
                            <button 
                                key={`${currentQuestion.id}_${idx}`} 
                                disabled={!isMyTurn || selectedOption !== null || isSpectator} 
                                onClick={() => handleOptionClick(idx)} 
                                className={`group relative w-full p-5 rounded-2xl text-left transition-all duration-100 flex items-center gap-4 ${bgClass} ${(!isMyTurn || isSpectator) ? 'cursor-default' : ''}`}
                            >
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 transition-transform ${!isSpectator && 'group-hover:scale-110'} ${letterClass}`}>
                                    {String.fromCharCode(65 + idx)}
                                </div>
                                <span className="font-bold text-lg leading-tight flex-1">{opt}</span>
                                
                                {isActive && !showFeedback && <i className="fas fa-spinner fa-spin ml-2"></i>}
                                {selectedOption !== null && idx === currentQuestion.answer && showFeedback && (
                                    <i className="fas fa-check-circle text-white text-2xl animate__animated animate__zoomIn"></i>
                                )}
                                 {selectedOption !== null && idx === selectedOption && idx !== currentQuestion.answer && showFeedback && (
                                    <i className="fas fa-times-circle text-white text-2xl animate__animated animate__zoomIn"></i>
                                )}
                            </button>
                        );
                    })}
                 </div>
            </>
        )}
      </div>

      {showOpponentModal && (
          <Modal isOpen={true} onClose={() => setShowOpponentModal(false)} title="Opponent Profile">
               <div className="flex flex-col items-center mb-6">
                   <Avatar src={rightProfile.avatar} seed={rightProfile.uid} size="xl" isVerified={rightProfile.isVerified} className="mb-4 shadow-xl border-4 border-white dark:border-slate-700" />
                   <h2 className="text-2xl font-black text-slate-900 dark:text-white text-center flex items-center gap-2">
                       {rightProfile.name} 
                       {rightProfile.isVerified && <i className="fas fa-check-circle text-blue-500 text-lg"></i>}
                   </h2>
                   <div className="grid grid-cols-2 gap-4 w-full mt-4"><div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl text-center"><div className="text-xs text-slate-400 font-bold uppercase">Level</div><div className="text-xl font-black text-slate-800 dark:text-white">{rightLevel}</div></div><div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl text-center"><div className="text-xs text-slate-400 font-bold uppercase">Points</div><div className="text-xl font-black text-game-primary dark:text-blue-400">{rightProfile.points}</div></div></div>
               </div>
               <Button fullWidth onClick={addFriend}><i className="fas fa-user-plus mr-2"></i> Add Friend</Button>
          </Modal>
      )}
    </div>
  );
};

export default GamePage;
