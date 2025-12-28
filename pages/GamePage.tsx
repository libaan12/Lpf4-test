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
  const [opponentProfile, setOpponentProfile] = useState<UserProfile | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState<{correct: boolean, answer: number} | null>(null);
  
  // Animation State
  const [showIntro, setShowIntro] = useState(false);
  const [showTurnAlert, setShowTurnAlert] = useState(false);
  const prevTurnRef = useRef<string | null>(null);
  
  // Opponent Details Modal
  const [showOpponentModal, setShowOpponentModal] = useState(false);
  
  const processingRef = useRef(false);
  const questionsLoadedRef = useRef(false);

  useEffect(() => {
    if (!matchId || !user) return;
    const matchRef = ref(db, `matches/${matchId}`);

    // ----- PRESENCE SYSTEM -----
    // Instead of ending match immediately on disconnect, we mark status as offline.
    const myStatusRef = ref(db, `matches/${matchId}/players/${user.uid}`);
    
    // Set my status to online and level immediately
    const myLevel = Math.floor((profile?.points || 0) / 10) + 1;
    update(myStatusRef, { 
        status: 'online',
        lastSeen: serverTimestamp(),
        level: myLevel 
    });

    // On disconnect, mark offline and timestamp
    onDisconnect(myStatusRef).update({ 
        status: 'offline',
        lastSeen: serverTimestamp()
    });
    // ---------------------------

    const unsubscribe = onValue(matchRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        set(ref(db, `users/${user.uid}/activeMatch`), null);
        navigate('/');
        return;
      }
      setMatch(data);

      // Question Loading Logic
      if (questions.length === 0 && data.subject && !questionsLoadedRef.current) {
          questionsLoadedRef.current = true; // Mark as attempting load
          let loadedQ: Question[] = [];
          const cacheKey = `questions_cache_${data.subject}`;
          const cachedData = localStorage.getItem(cacheKey);
          
          try {
            if (data.subject.startsWith('ALL_')) {
                const subjectId = data.subject.replace('ALL_', '');
                const chaptersSnap = await get(ref(db, `chapters/${subjectId}`));
                const chapters = Object.values(chaptersSnap.val() || {}) as Chapter[];
                const snaps = await Promise.all(chapters.map(c => get(ref(db, `questions/${c.id}`))));
                snaps.forEach(s => s.exists() && loadedQ.push(...Object.values(s.val()) as Question[]));
            } else {
                if (cachedData) try { loadedQ = JSON.parse(cachedData); } catch(e) {}
                if (loadedQ.length === 0) {
                    const snap = await get(ref(db, `questions/${data.subject}`));
                    if(snap.exists()) {
                        loadedQ = Object.values(snap.val()) as Question[];
                        localStorage.setItem(cacheKey, JSON.stringify(loadedQ));
                    }
                }
            }

            if (loadedQ.length > 0) {
                const rng = createSeededRandom(data.matchId);
                let shuffledQ = shuffleArraySeeded(loadedQ, rng).map(q => {
                    const opts = q.options.map((o, i) => ({ t: o, c: i === q.answer }));
                    const sOpts = shuffleArraySeeded(opts, rng);
                    return { ...q, options: sOpts.map(o => o.t), answer: sOpts.findIndex(o => o.c) };
                });
                const limit = data.questionLimit || 10;
                setQuestions(shuffledQ.slice(0, limit));
            } else {
                // HANDLE NO QUESTIONS CASE
                await showAlert("Setup Error", "This chapter has no questions yet. The match will be cancelled.", "error");
                await set(ref(db, `users/${user.uid}/activeMatch`), null);
                // Try to delete match if host
                if (data.turn === user.uid) remove(matchRef);
                navigate('/');
            }
          } catch(e) {
              console.error("Q Load Error", e);
              questionsLoadedRef.current = false; // Allow retry if error (or maybe not?)
          }
      }

      // Opponent Setup
      if (!opponentProfile) {
        const oppUid = Object.keys(data.scores).find(uid => uid !== user.uid);
        if (oppUid) {
             const oppSnap = await get(ref(db, `users/${oppUid}`));
             if (oppSnap.exists()) {
                 const oppData = oppSnap.val();
                 setOpponentProfile({ uid: oppUid, ...oppData });
                 
                 // Show Intro only if start
                 if (data.currentQ === 0 && data.answersCount === 0) {
                     setShowIntro(true);
                     playSound('click'); 
                 }
             }
        }
      }

      // Check Winner
      if (data.status === 'completed' && data.winner) {
          if (data.winner === user.uid) { 
              playSound('win'); 
              confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } }); 
          }
          else if (data.winner !== 'draw') playSound('wrong'); 
      }
    });

    return () => { 
        unsubscribe(); 
        onDisconnect(myStatusRef).cancel();
    };
  }, [matchId, user, navigate]); 

  // Handle Intro Timeout
  useEffect(() => {
      if (showIntro && match && opponentProfile) {
          const timer = setTimeout(() => {
              setShowIntro(false);
          }, 3500); 
          return () => clearTimeout(timer);
      }
  }, [showIntro, match, opponentProfile]);

  // Handle Turn Notifications
  useEffect(() => {
      if (!match || !user) return;
      
      // If turn changed and it is now MY turn
      if (prevTurnRef.current && prevTurnRef.current !== match.turn && match.turn === user.uid) {
          setShowTurnAlert(true);
          playSound('click'); // Subtle cue
          const timer = setTimeout(() => setShowTurnAlert(false), 1500);
          return () => clearTimeout(timer);
      }
      prevTurnRef.current = match.turn;
  }, [match?.turn, user?.uid]);

  const currentQuestion = match && questions.length > 0 ? questions[match.currentQ] : null;
  const isMyTurn = match?.turn === user?.uid;
  const isGameOver = match?.status === 'completed';

  const handleOptionClick = async (index: number) => {
    if (!match || !user || !isMyTurn || selectedOption !== null || processingRef.current || !currentQuestion) return;
    
    setSelectedOption(index);
    playSound('click');
    processingRef.current = true;

    setTimeout(async () => {
        const isCorrect = index === currentQuestion.answer;
        isCorrect ? playSound('correct') : playSound('wrong');
        setShowFeedback({ correct: isCorrect, answer: currentQuestion.answer });

        setTimeout(async () => {
            const oppUid = Object.keys(match.scores).find(uid => uid !== user.uid) || '';
            const newScores = { ...match.scores };
            if (isCorrect) newScores[user.uid] += POINTS_PER_QUESTION;

            // --- Logic for Game Progression ---
            // Round State: answersCount (0 = start of Q, 1 = one player answered)
            const currentAnswers = match.answersCount || 0;
            let nextQ = match.currentQ;
            let nextAnswersCount = currentAnswers + 1;
            let nextTurn = oppUid; // Flip turn by default

            // If we are the second person to answer this question (0 -> 1 -> Finish Round)
            if (currentAnswers >= 1) {
                
                // If this was the LAST question
                if (match.currentQ >= questions.length - 1) {
                    // Determine Winner
                    let winner = 'draw';
                    if (newScores[user.uid] > newScores[oppUid]) winner = user.uid;
                    else if (newScores[oppUid] > newScores[user.uid]) winner = oppUid;

                    // Update Points for ME
                    const myPts = (await get(ref(db, `users/${user.uid}/points`))).val() || 0;
                    await update(ref(db, `users/${user.uid}`), { points: myPts + newScores[user.uid], activeMatch: null });
                    
                    // Update Points for Opponent (since they can't do it themselves now)
                    const oppPts = (await get(ref(db, `users/${oppUid}/points`))).val() || 0;
                    await update(ref(db, `users/${oppUid}`), { points: oppPts + newScores[oppUid], activeMatch: null });

                    // Complete Match
                    await update(ref(db, `matches/${matchId}`), { 
                        scores: newScores, 
                        status: 'completed', 
                        winner,
                        answersCount: 2 // Mark as fully done
                    });
                    
                    setSelectedOption(null);
                    setShowFeedback(null);
                    processingRef.current = false;
                    return;
                }

                // Advance to next question
                nextQ = match.currentQ + 1;
                nextAnswersCount = 0;
            }

            // Standard Update
            await update(ref(db, `matches/${matchId}`), { 
                scores: newScores, 
                currentQ: nextQ, 
                turn: nextTurn,
                answersCount: nextAnswersCount 
            });

            setSelectedOption(null);
            setShowFeedback(null);
            processingRef.current = false;
        }, 1500);
    }, 800);
  };

  const handleLeave = async () => {
      if(!user || !matchId) return;
      if (match?.status === 'completed') try { await remove(ref(db, `matches/${matchId}`)); } catch(e) {}
      await set(ref(db, `users/${user.uid}/activeMatch`), null);
      navigate('/');
  };

  const handleSurrender = async () => {
      if (!match || !user || !opponentProfile) return;
      
      const confirmed = await showConfirm(
          "Exit Match?", 
          "If you exit now, you will lose the match and forfeit points.", 
          "Exit", "Stay", "warning"
      );

      if (!confirmed) return;

      // Award points to opponent (Win bonus)
      const oppPts = (await get(ref(db, `users/${opponentProfile.uid}/points`))).val() || 0;
      await update(ref(db, `users/${opponentProfile.uid}`), { 
          points: oppPts + 20, // Win bonus
          activeMatch: null 
      });

      // Mark match completed, opponent wins
      await update(ref(db, `matches/${matchId}`), {
          status: 'completed',
          winner: opponentProfile.uid
      });

      // Cleanup self and leave
      await set(ref(db, `users/${user.uid}/activeMatch`), null);
      navigate('/');
      showToast("Match Forfeited", "info");
  };

  const addFriend = async () => {
      if(!user || !opponentProfile) return;
      await update(ref(db, `users/${opponentProfile.uid}/friendRequests/${user.uid}`), {
          status: 'pending'
      });
      showToast("Friend Request Sent!", "success");
      setShowOpponentModal(false);
  };

  if (!match || !opponentProfile || (!currentQuestion && !isGameOver && !showIntro)) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
            {questions.length === 0 ? (
                // LOADING STATE
                <>
                   <div className="w-16 h-16 border-4 border-game-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                   <h2 className="font-black text-2xl animate-pulse">CONNECTING...</h2>
                   <p className="text-slate-500 mt-2 text-sm">Preparing battle arena</p>
                </>
            ) : (
                // Should not happen if logic is correct, but fail-safe
                <div className="animate__animated animate__fadeIn">
                     <i className="fas fa-exclamation-triangle text-4xl text-yellow-500 mb-4"></i>
                     <h2 className="font-bold text-xl">Waiting for opponent...</h2>
                </div>
            )}
        </div>
    );
  }

  const myLevel = Math.floor((profile?.points || 0) / 10) + 1;
  const oppLevel = Math.floor((opponentProfile.points || 0) / 10) + 1;

  return (
    <div className="min-h-screen relative flex flex-col font-sans bg-slate-900 overflow-hidden transition-colors">
       {/* Background - Restored Blue/Grey Vibe */}
       <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800 z-0"></div>
       <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] z-0 pointer-events-none"></div>

      {/* VERSUS INTRO ANIMATION */}
      {showIntro && (
          <div className="fixed inset-0 z-50 flex flex-col md:flex-row items-center justify-center bg-slate-900 overflow-hidden">
              {/* Player 1 (Top / Left) */}
              <div className="relative w-full h-1/2 md:w-1/2 md:h-full bg-indigo-600 flex flex-col items-center justify-center animate__animated animate__slideInLeft shadow-[0_0_50px_rgba(0,0,0,0.5)] z-10">
                  <div className="relative z-10 scale-90 md:scale-150 mb-2 md:mb-0">
                     <Avatar src={profile?.avatar} seed={user!.uid} size="xl" className="border-4 border-white shadow-2xl" isVerified={profile?.isVerified} />
                     <div className="absolute -bottom-2 -right-2 bg-yellow-400 text-slate-900 font-black px-2 py-0.5 rounded-full border-2 border-white text-sm">LVL {myLevel}</div>
                  </div>
                  <h2 className="mt-4 md:mt-8 text-2xl md:text-4xl font-black text-white uppercase italic tracking-widest drop-shadow-lg text-center px-2 break-words max-w-full">
                      {profile?.name}
                  </h2>
              </div>

              {/* Player 2 (Bottom / Right) */}
              <div className="relative w-full h-1/2 md:w-1/2 md:h-full bg-red-600 flex flex-col items-center justify-center animate__animated animate__slideInRight shadow-[0_0_50px_rgba(0,0,0,0.5)] z-10">
                  <div className="relative z-10 scale-90 md:scale-150 mb-2 md:mb-0">
                     <Avatar src={opponentProfile.avatar} seed={opponentProfile.uid} size="xl" className="border-4 border-white shadow-2xl" isVerified={opponentProfile.isVerified} />
                     <div className="absolute -bottom-2 -right-2 bg-yellow-400 text-slate-900 font-black px-2 py-0.5 rounded-full border-2 border-white text-sm">LVL {oppLevel}</div>
                  </div>
                  <h2 className="mt-4 md:mt-8 text-2xl md:text-4xl font-black text-white uppercase italic tracking-widest drop-shadow-lg text-center px-2 break-words max-w-full">
                      {opponentProfile.name}
                  </h2>
              </div>

              {/* Center Effects */}
              <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
                  <div className="relative animate-clash">
                      <h1 
                        className="text-[80px] md:text-[140px] font-black italic text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 drop-shadow-[0_0_25px_rgba(234,179,8,0.8)] leading-none"
                        style={{ 
                            WebkitTextStroke: '2px black',
                            filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))' 
                        }}
                      >
                          VS
                      </h1>
                  </div>
                  <div className="mt-2 md:mt-8 text-lg md:text-2xl font-black text-white uppercase tracking-[0.5em] animate__animated animate__fadeInUp animate__delay-1s bg-black/50 px-4 py-1 rounded-full backdrop-blur-sm border border-white/10">
                      Get Ready
                  </div>
              </div>
          </div>
      )}

      {/* TURN ALERT SPLASH */}
      {showTurnAlert && !isGameOver && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
             <div className="bg-game-primary/90 text-white px-8 py-4 rounded-3xl shadow-2xl animate__animated animate__zoomInDown flex flex-col items-center">
                <i className="fas fa-bolt text-5xl mb-2 animate-bounce"></i>
                <h2 className="text-4xl font-black italic uppercase tracking-widest">Your Turn!</h2>
             </div>
          </div>
      )}

      {/* Exit Button (Replaces AFK) */}
      {!isGameOver && (
          <div className="absolute top-4 left-4 z-40">
              <button 
                onClick={handleSurrender}
                className="bg-white/10 backdrop-blur-md text-white/70 hover:text-red-400 hover:bg-white/20 px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider border border-white/10 transition-all flex items-center gap-2"
              >
                  <i className="fas fa-sign-out-alt"></i> Exit Match
              </button>
          </div>
      )}

      {/* HUD */}
      <div className="pt-16 md:pt-4 px-4 pb-2 z-20">
         <div className="max-w-4xl mx-auto bg-white/95 dark:bg-slate-800/95 backdrop-blur rounded-[2rem] shadow-xl p-3 flex justify-between items-center border-b-4 border-slate-200 dark:border-slate-700">
            {/* Me */}
            <div className={`flex items-center gap-3 transition-all duration-300 ${isMyTurn && !isGameOver ? 'scale-105 opacity-100' : 'scale-95 opacity-60'}`}>
                 <div className="relative">
                     <Avatar src={profile?.avatar} seed={user!.uid} size="sm" border={isMyTurn ? '3px solid #6366f1' : '3px solid transparent'} className={isMyTurn ? 'shadow-lg shadow-indigo-500/50' : ''} isVerified={profile?.isVerified} />
                     <div className="absolute -bottom-1 -right-1 bg-gray-800 text-white text-[8px] px-1 rounded font-bold border border-white">LVL {myLevel}</div>
                 </div>
                 <div>
                     <div className="flex items-center gap-1">
                        <div className="text-[10px] font-black uppercase text-slate-400">You</div>
                        {isMyTurn && !isGameOver && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>}
                     </div>
                     <div className="text-2xl font-black text-game-primary leading-none">{match.scores[user!.uid]}</div>
                 </div>
            </div>
            
            <div className="flex flex-col items-center">
                 <div className="text-xl font-black text-slate-300 dark:text-slate-600 italic">VS</div>
                 <div className="text-xs font-bold text-slate-400">Q {match.currentQ + 1}/{questions.length}</div>
            </div>

            {/* Opponent (Clickable for details) */}
            <div 
                className={`flex items-center gap-3 flex-row-reverse text-right transition-all duration-300 cursor-pointer ${!isMyTurn && !isGameOver ? 'scale-105 opacity-100' : 'scale-95 opacity-60'}`}
                onClick={() => setShowOpponentModal(true)}
            >
                 <div className="relative">
                    <Avatar src={opponentProfile.avatar} seed={opponentProfile.uid} size="sm" border={!isMyTurn ? '3px solid #ef4444' : '3px solid transparent'} className={!isMyTurn ? 'shadow-lg shadow-red-500/50' : ''} isVerified={opponentProfile.isVerified} />
                    <div className="absolute -bottom-1 -right-1 bg-gray-800 text-white text-[8px] px-1 rounded font-bold border border-white">LVL {oppLevel}</div>
                 </div>
                 <div>
                     <div className="flex items-center gap-1 justify-end">
                         {!isMyTurn && !isGameOver && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
                         <div className="text-[10px] font-black uppercase text-slate-400 truncate w-16">{opponentProfile.name}</div>
                     </div>
                     <div className="text-2xl font-black text-game-danger leading-none">{match.scores[opponentProfile.uid]}</div>
                 </div>
            </div>
         </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-3xl mx-auto z-10">
        {isGameOver ? (
           <Card className="text-center w-full animate__animated animate__zoomIn !p-8 md:!p-10 border-t-8 border-game-primary dark:border-game-primaryDark">
               {match.winner === user!.uid ? (
                   <>
                       <div className="text-6xl mb-4">🏆</div>
                       <h1 className="text-4xl font-black text-game-primary mb-2 uppercase italic">Victory!</h1>
                       <p className="text-slate-500 font-bold mb-8">You crushed it!</p>
                   </>
               ) : match.winner === 'draw' ? (
                   <>
                       <div className="text-6xl mb-4">🤝</div>
                       <h1 className="text-4xl font-black text-slate-600 mb-2 uppercase italic">Draw!</h1>
                       <p className="text-slate-500 font-bold mb-8">Well fought battle.</p>
                   </>
               ) : (
                   <>
                       <div className="text-6xl mb-4">💀</div>
                       <h1 className="text-4xl font-black text-game-danger mb-2 uppercase italic">Defeat</h1>
                       <p className="text-slate-500 font-bold mb-8">Better luck next time.</p>
                   </>
               )}
               
               <div className="flex justify-center gap-4 md:gap-12 mb-10">
                   <div className="text-center bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800">
                       <Avatar src={profile?.avatar} size="lg" className="mx-auto mb-2 shadow-md" isVerified={profile?.isVerified} />
                       <div className="font-bold text-slate-800 dark:text-white truncate max-w-[100px]">{profile?.name}</div>
                       <div className="text-xs font-bold text-slate-400 mb-2">LVL {myLevel}</div>
                       <div className="font-black text-2xl text-game-primary">{match.scores[user!.uid]}</div>
                   </div>
                   
                   <div className="flex items-center text-slate-300 font-black text-2xl italic">VS</div>

                   <div className="text-center bg-red-50 dark:bg-red-900/20 p-4 rounded-2xl border border-red-100 dark:border-red-800 opacity-90">
                       <Avatar src={opponentProfile.avatar} size="lg" className="mx-auto mb-2 grayscale shadow-md" isVerified={opponentProfile.isVerified} />
                       <div className="font-bold text-slate-800 dark:text-white truncate max-w-[100px]">{opponentProfile.name}</div>
                       <div className="text-xs font-bold text-slate-400 mb-2">LVL {oppLevel}</div>
                       <div className="font-black text-2xl text-game-danger">{match.scores[opponentProfile.uid]}</div>
                   </div>
               </div>

               <Button onClick={handleLeave} size="lg" fullWidth>Return to Base</Button>
           </Card>
        ) : (
            <>
                <div className={`
                    w-full rounded-[2rem] p-6 md:p-8 shadow-[0_10px_0_rgba(0,0,0,0.1)] mb-6 text-center border-2 
                    min-h-[160px] flex items-center justify-center relative overflow-hidden transition-all duration-500
                    ${isMyTurn 
                        ? 'bg-white dark:bg-slate-800 border-game-primary/50 shadow-game-primary/20' 
                        : 'bg-gray-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 opacity-90 grayscale-[0.5]'}
                `}>
                    {isMyTurn && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-game-primary via-purple-500 to-game-danger animate-pulse"></div>}
                    <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white leading-relaxed z-10">
                        {currentQuestion && currentQuestion.question}
                    </h2>
                </div>

                {/* REDESIGNED OPTION CARDS */}
                <div className="relative w-full">
                    {/* Locked Overlay for Opponent's Turn */}
                    {!isMyTurn && (
                         <div className="absolute inset-0 z-20 bg-slate-900/10 backdrop-blur-[2px] rounded-3xl flex items-center justify-center animate__animated animate__fadeIn">
                             <div className="bg-slate-900/80 text-white px-6 py-3 rounded-full font-black uppercase tracking-widest shadow-2xl flex items-center gap-3 border border-white/20">
                                 <i className="fas fa-hourglass-half animate-spin-slow"></i>
                                 {opponentProfile.name}'s Turn
                             </div>
                         </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                        {currentQuestion && currentQuestion.options.map((opt, idx) => {
                            // Determine visual state
                            let isActive = selectedOption === idx;
                            let isCorrect = showFeedback?.answer === idx;

                            let bgClass = "bg-white dark:bg-slate-800 border-b-4 border-slate-300 dark:border-slate-700";
                            let textClass = "text-slate-700 dark:text-slate-200";

                            if (isActive) {
                                bgClass = "bg-game-primary border-b-4 border-game-primaryDark translate-y-[2px]";
                                textClass = "text-white";
                            }
                            
                            if (showFeedback) {
                                if (idx === showFeedback.answer) {
                                    bgClass = "bg-green-500 border-b-4 border-green-700 animate__animated animate__pulse";
                                    textClass = "text-white";
                                } else if (isActive) {
                                    bgClass = "bg-red-500 border-b-4 border-red-700 animate__animated animate__shakeX";
                                    textClass = "text-white";
                                } else {
                                    bgClass = "bg-slate-100 dark:bg-slate-800 opacity-50 border-transparent grayscale";
                                }
                            }

                            return (
                                <button
                                    key={idx}
                                    disabled={!isMyTurn || selectedOption !== null}
                                    onClick={() => handleOptionClick(idx)}
                                    className={`
                                        relative p-5 rounded-2xl text-left transition-all duration-150 active:scale-[0.98]
                                        ${bgClass} ${!isMyTurn ? 'cursor-not-allowed' : ''}
                                        shadow-lg hover:brightness-105 min-h-[80px] flex items-center
                                    `}
                                >
                                    <div className={`
                                        w-8 h-8 rounded-lg flex items-center justify-center font-black mr-4 text-sm shrink-0
                                        ${isActive || (showFeedback && idx === showFeedback.answer) ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300'}
                                    `}>
                                        {String.fromCharCode(65 + idx)}
                                    </div>
                                    <span className={`font-bold text-lg leading-tight ${textClass}`}>
                                        {opt}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </>
        )}
      </div>

      {/* Opponent Modal */}
      {showOpponentModal && (
          <Modal isOpen={true} onClose={() => setShowOpponentModal(false)} title="Opponent Profile">
               <div className="flex flex-col items-center mb-6">
                   <Avatar src={opponentProfile.avatar} seed={opponentProfile.uid} size="xl" isVerified={opponentProfile.isVerified} className="mb-4 shadow-xl border-4 border-white dark:border-slate-700" />
                   <h2 className="text-2xl font-black text-slate-900 dark:text-white text-center flex items-center gap-2">
                       {opponentProfile.name}
                       {opponentProfile.isVerified && <i className="fas fa-check-circle text-blue-500 text-lg"></i>}
                   </h2>
                   <p className="text-slate-500 dark:text-slate-400 font-mono font-bold mb-4">@{opponentProfile.username || 'unknown'}</p>
                   
                   <div className="grid grid-cols-2 gap-4 w-full">
                       <div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl text-center">
                           <div className="text-xs text-slate-400 font-bold uppercase">Level</div>
                           <div className="text-xl font-black text-slate-800 dark:text-white">{oppLevel}</div>
                       </div>
                       <div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl text-center">
                           <div className="text-xs text-slate-400 font-bold uppercase">Points</div>
                           <div className="text-xl font-black text-game-primary dark:text-blue-400">{opponentProfile.points}</div>
                       </div>
                   </div>
               </div>
               
               <Button fullWidth onClick={addFriend}><i className="fas fa-user-plus mr-2"></i> Add Friend</Button>
          </Modal>
      )}
    </div>
  );
};

export default GamePage;