import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, onDisconnect, get, set, remove } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { POINTS_PER_QUESTION } from '../constants';
import { MatchState, Question, Chapter } from '../types';
import { Avatar, Button } from '../components/UI';
import { playSound } from '../services/audioService';
import { showConfirm } from '../services/alert';
import confetti from 'canvas-confetti';

// Simple seeded random number generator (Linear Congruential Generator)
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
  const [opponentProfile, setOpponentProfile] = useState<{name: string, avatar: string, uid: string} | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  
  // Local UI State
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState<{correct: boolean, answer: number} | null>(null);
  const [pointsAwardedForDisconnect, setPointsAwardedForDisconnect] = useState(false);
  
  const processingRef = useRef(false);

  useEffect(() => {
    if (!matchId || !user) return;

    const matchRef = ref(db, `matches/${matchId}`);
    const userMatchRef = ref(db, `users/${user.uid}/activeMatch`);

    onDisconnect(matchRef).update({ 
        status: 'completed', 
        winner: 'disconnect' 
    });

    const unsubscribe = onValue(matchRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        set(userMatchRef, null);
        navigate('/');
        return;
      }
      
      setMatch(data);

      if (questions.length === 0 && data.subject) {
          let loadedQ: Question[] = [];
          
          // CACHING LOGIC
          const cacheKey = `questions_cache_${data.subject}`;
          const cachedData = localStorage.getItem(cacheKey);
          
          if (data.subject.startsWith('ALL_')) {
              const subjectId = data.subject.replace('ALL_', '');
              const chaptersRef = ref(db, `chapters/${subjectId}`);
              const chapSnap = await get(chaptersRef);
              
              if (chapSnap.exists()) {
                  const chapters = Object.values(chapSnap.val()) as Chapter[];
                  const promises = chapters.map(c => get(ref(db, `questions/${c.id}`)));
                  const snapshots = await Promise.all(promises);
                  snapshots.forEach(snap => {
                      if (snap.exists()) {
                          loadedQ.push(...(Object.values(snap.val()) as Question[]));
                      }
                  });
              }
          } else {
              if (cachedData) {
                  try { loadedQ = JSON.parse(cachedData); } catch(e) {}
              }

              if (loadedQ.length === 0) {
                const qRef = ref(db, `questions/${data.subject}`);
                const qSnap = await get(qRef);
                if (qSnap.exists()) {
                    loadedQ = Object.values(qSnap.val()) as Question[];
                    localStorage.setItem(cacheKey, JSON.stringify(loadedQ));
                }
              }
          }

          if (loadedQ.length > 0) {
              const rng = createSeededRandom(data.matchId);
              let shuffledQ = shuffleArraySeeded(loadedQ, rng);
              
              shuffledQ = shuffledQ.map(q => {
                  const optionsWithIndex = q.options.map((opt, idx) => ({ 
                      text: opt, 
                      isCorrect: idx === q.answer 
                  }));
                  const shuffledOptions = shuffleArraySeeded(optionsWithIndex, rng);
                  return {
                      ...q,
                      options: shuffledOptions.map(o => o.text),
                      answer: shuffledOptions.findIndex(o => o.isCorrect) 
                  };
              });

              const limit = data.questionLimit || 10;
              if (shuffledQ.length > limit) {
                  shuffledQ = shuffledQ.slice(0, limit);
              }

              setQuestions(shuffledQ);
          } else {
              console.error("No questions found.");
          }
      }

      if (!opponentProfile) {
        const opponentUid = Object.keys(data.scores).find(uid => uid !== user.uid);
        if (opponentUid) {
             const oppRef = ref(db, `users/${opponentUid}`);
             const oppSnap = await get(oppRef);
             if (oppSnap.exists()) {
                 setOpponentProfile({ uid: opponentUid, ...oppSnap.val() });
             }
        }
      }

      if (data.status === 'completed') {
        if (data.winner && data.winner !== 'draw' && data.winner !== 'disconnect') {
             if (data.winner === user.uid) {
                 playSound('win');
                 confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
             } else if (data.winner !== 'draw') {
                 playSound('wrong'); 
             }
        }
      }
    });

    return () => {
      unsubscribe();
      onDisconnect(matchRef).cancel();
    };
  }, [matchId, user, navigate]); 

  const currentQuestion = match && questions.length > 0 ? questions[match.currentQ] : null;
  const isMyTurn = match?.turn === user?.uid;
  const isGameOver = match?.status === 'completed';

  useEffect(() => {
      if (isGameOver && match?.winner === 'disconnect' && !pointsAwardedForDisconnect && match.mode === 'auto' && questions.length > 0 && user) {
          const totalPossible = questions.length * POINTS_PER_QUESTION;
          const award = Math.floor(totalPossible / 2);
          
          setPointsAwardedForDisconnect(true);

          const myPointsRef = ref(db, `users/${user.uid}/points`);
          get(myPointsRef).then(snap => {
              const cur = snap.val() || 0;
              update(ref(db, `users/${user.uid}`), { points: cur + award });
          });
      }
  }, [isGameOver, match, questions, user, pointsAwardedForDisconnect]);

  const handleOptionClick = async (index: number) => {
    if (!match || !user || !isMyTurn || selectedOption !== null || processingRef.current || !currentQuestion) return;
    
    setSelectedOption(index);
    playSound('click');
    processingRef.current = true;

    setTimeout(async () => {
        const isCorrect = index === currentQuestion.answer;
        if (isCorrect) playSound('correct');
        else playSound('wrong');

        setShowFeedback({ correct: isCorrect, answer: currentQuestion.answer });

        setTimeout(async () => {
            const nextQ = match.currentQ + 1;
            const newScores = { ...match.scores };
            if (isCorrect) {
                newScores[user.uid] += POINTS_PER_QUESTION;
            }

            const opponentUid = Object.keys(match.scores).find(uid => uid !== user.uid) || '';
            const nextTurn = opponentUid;

            if (nextQ >= questions.length) {
               let winner = 'draw';
               if (newScores[user.uid] > newScores[opponentUid]) winner = user.uid;
               if (newScores[opponentUid] > newScores[user.uid]) winner = opponentUid;

               const myPointsRef = ref(db, `users/${user.uid}/points`);
               const currentPoints = (await get(myPointsRef)).val() || 0;
               await update(ref(db, `users/${user.uid}`), { points: currentPoints + newScores[user.uid], activeMatch: null });

               await update(ref(db, `matches/${matchId}`), {
                   scores: newScores,
                   status: 'completed',
                   winner
               });
            } else {
                await update(ref(db, `matches/${matchId}`), {
                    scores: newScores,
                    currentQ: nextQ,
                    turn: nextTurn
                });
            }

            setSelectedOption(null);
            setShowFeedback(null);
            processingRef.current = false;
        }, 1500);
    }, 1000);
  };

  const handleLeave = async () => {
      if(!user || !matchId) return;
      if (match?.status === 'completed') {
        try {
            await remove(ref(db, `matches/${matchId}`));
        } catch(e) {}
      }
      await set(ref(db, `users/${user.uid}/activeMatch`), null);
      navigate('/');
  };

  const handleSurrender = async () => {
    if(!matchId || !user || !opponentProfile) return;
    const isConfirmed = await showConfirm('Surrender?', 'You will lose this match and exit to the lobby.', 'Yes, give up', 'Cancel', 'warning');
    if (isConfirmed) {
        await update(ref(db, `matches/${matchId}`), { status: 'completed', winner: opponentProfile.uid });
        await set(ref(db, `users/${user.uid}/activeMatch`), null);
        navigate('/');
    }
  };

  // Loading State
  if (!match || !opponentProfile || (!currentQuestion && !isGameOver)) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="w-16 h-16 border-4 border-somali-blue border-t-transparent rounded-full animate-spin mb-4"></div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200 animate-pulse">
                {match && questions.length === 0 ? "Loading Quiz Data..." : "Initializing Battlefield..."}
            </h2>
        </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col font-sans transition-colors duration-500 bg-gray-50 dark:bg-gray-900">
      
      {/* Dynamic Background Blobs */}
       <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-400/20 dark:bg-blue-600/10 rounded-full blur-[120px] animate-blob mix-blend-multiply dark:mix-blend-screen"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-400/20 dark:bg-purple-600/10 rounded-full blur-[120px] animate-blob animation-delay-2000 mix-blend-multiply dark:mix-blend-screen"></div>
       </div>

      {/* Glass HUD - Floating Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 flex justify-center pointer-events-none">
         <div className="w-full max-w-4xl bg-white/70 dark:bg-gray-900/60 backdrop-blur-xl border border-white/50 dark:border-white/10 rounded-3xl shadow-lg p-2 px-4 flex justify-between items-center pointer-events-auto">
            {/* Player Left */}
            <div className={`flex items-center gap-3 transition-all duration-500 ${!isGameOver && isMyTurn ? 'scale-105 opacity-100' : 'opacity-70 scale-95'}`}>
                 <div className={`relative ${!isGameOver && isMyTurn ? 'ring-4 ring-green-400/50 rounded-full shadow-[0_0_15px_rgba(74,222,128,0.4)]' : ''}`}>
                    <Avatar src={profile?.avatar} seed={user!.uid} size="sm" />
                    {isMyTurn && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full animate-bounce"></div>}
                 </div>
                 <div className="flex flex-col">
                     <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">You</span>
                     <span className="text-xl font-black text-gray-900 dark:text-white font-mono leading-none">{match.scores[user!.uid]}</span>
                 </div>
            </div>

            {/* Center VS */}
            <div className="flex flex-col items-center">
                 <div className="font-black text-gray-300 dark:text-white/10 text-3xl italic select-none">VS</div>
                 {!isGameOver && (
                    <button onClick={handleSurrender} className="mt-1 text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600 bg-red-50/80 dark:bg-red-900/20 px-3 py-1 rounded-full transition-colors backdrop-blur-sm">
                        Surrender
                    </button>
                )}
            </div>

            {/* Opponent Right */}
            <div className={`flex items-center gap-3 flex-row-reverse text-right transition-all duration-500 ${!isGameOver && !isMyTurn ? 'scale-105 opacity-100' : 'opacity-70 scale-95'}`}>
                 <div className={`relative ${!isGameOver && !isMyTurn ? 'ring-4 ring-red-400/50 rounded-full shadow-[0_0_15px_rgba(248,113,113,0.4)]' : ''}`}>
                    <Avatar src={opponentProfile.avatar} seed={opponentProfile.uid} size="sm" />
                    {!isMyTurn && <div className="absolute -bottom-1 -left-1 w-4 h-4 bg-red-500 border-2 border-white rounded-full animate-pulse"></div>}
                 </div>
                 <div className="flex flex-col">
                     <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider truncate max-w-[80px]">{opponentProfile.name}</span>
                     <span className="text-xl font-black text-gray-900 dark:text-white font-mono leading-none">{match.scores[opponentProfile.uid]}</span>
                 </div>
            </div>
         </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 pt-28 pb-10 w-full max-w-3xl mx-auto z-10">
        {isGameOver ? (
           <div className="text-center w-full animate__animated animate__zoomIn bg-white/70 dark:bg-gray-800/60 backdrop-blur-3xl p-8 md:p-12 rounded-[3rem] border border-white/60 dark:border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)]">
               {match.winner === 'disconnect' ? (
                   <>
                       <div className="w-24 h-24 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                           <i className="fas fa-plug text-4xl text-red-500"></i>
                       </div>
                       <h2 className="text-3xl font-extrabold mb-2 text-gray-900 dark:text-white">Opponent Left</h2>
                       <p className="mb-8 text-gray-600 dark:text-gray-300">
                           {match.mode === 'auto' ? "They disconnected. You get half points!" : "The match was interrupted."}
                       </p>
                   </>
               ) : (
                   <>
                       <div className="mb-8">
                           <h2 className="text-5xl md:text-7xl font-black mb-4 tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-yellow-400 via-orange-500 to-red-600 drop-shadow-sm uppercase italic">
                               {match.winner === user!.uid ? 'Victory!' : match.winner === 'draw' ? 'Draw!' : 'Defeat'}
                           </h2>
                       </div>
                       
                       <div className="flex justify-center items-end gap-6 md:gap-12 mb-10 relative">
                           {/* Player */}
                           <div className="flex flex-col items-center relative z-10">
                               <div className="relative">
                                  <Avatar src={profile?.avatar} seed={user!.uid} size="lg" className="w-24 h-24 md:w-32 md:h-32 border-4 border-white dark:border-gray-700 shadow-2xl" />
                                  {match.winner === user!.uid && <div className="absolute -top-6 -right-6 text-5xl animate-bounce drop-shadow-md">👑</div>}
                               </div>
                               <span className="font-black mt-4 text-gray-900 dark:text-white text-xl md:text-2xl">{profile?.name || 'You'}</span>
                               <span className="font-mono text-3xl font-bold text-somali-blue dark:text-blue-400">{match.scores[user!.uid]}</span>
                           </div>

                           <div className="text-4xl font-black text-gray-300 dark:text-gray-600 mb-12 italic">VS</div>

                           {/* Opponent */}
                           <div className="flex flex-col items-center opacity-90 relative z-10">
                               <div className="relative">
                                  <Avatar src={opponentProfile.avatar} seed={opponentProfile.uid} size="lg" className="w-24 h-24 md:w-32 md:h-32 border-4 border-white dark:border-gray-700 shadow-2xl" />
                                  {match.winner === opponentProfile.uid && <div className="absolute -top-6 -right-6 text-5xl animate-bounce drop-shadow-md">👑</div>}
                               </div>
                               <span className="font-black mt-4 text-gray-900 dark:text-white text-xl md:text-2xl">{opponentProfile.name}</span>
                               <span className="font-mono text-3xl font-bold text-gray-600 dark:text-gray-400">{match.scores[opponentProfile.uid]}</span>
                           </div>
                       </div>
                   </>
               )}
               <button onClick={handleLeave} className="px-8 py-4 text-xl font-black uppercase tracking-widest bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl shadow-xl shadow-blue-500/30 transform hover:scale-105 active:scale-95 transition-all w-full max-w-xs mx-auto flex items-center justify-center gap-3">
                   <i className="fas fa-home"></i> Return to Lobby
               </button>
           </div>
        ) : (
            <>
                {currentQuestion && (
                    <div className="w-full flex flex-col items-center">
                        {/* Question Progress Pill */}
                        <div className="mb-6 px-4 py-1.5 bg-white/50 dark:bg-gray-800/50 backdrop-blur-md rounded-full border border-white/30 dark:border-white/10 shadow-sm">
                             <span className="text-xs font-bold text-gray-600 dark:text-gray-300 tracking-widest">
                                 QUESTION {match.currentQ + 1} / {questions.length}
                             </span>
                        </div>

                        {/* Updated Question Card - reduced size, better padding */}
                        <div className="w-full bg-white dark:bg-gray-800 backdrop-blur-xl border-2 border-gray-100 dark:border-gray-700 text-gray-900 dark:text-white rounded-[1.5rem] p-6 shadow-xl text-center mb-6 min-h-[140px] flex items-center justify-center animate__animated animate__fadeIn">
                            <h2 className="text-lg md:text-xl font-bold leading-relaxed">
                                {currentQuestion.question}
                            </h2>
                        </div>

                        {/* Options Grid - Improved Visibility & Compactness */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                            {currentQuestion.options.map((opt, idx) => {
                                let btnClasses = "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-somali-blue dark:hover:border-blue-500"; 
                                let circleClasses = "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400";
                                
                                if (selectedOption === idx) {
                                    // Selected (waiting for feedback)
                                    btnClasses = "bg-somali-blue border-somali-blue text-white ring-2 ring-blue-300 dark:ring-blue-900";
                                    circleClasses = "bg-white/20 text-white";
                                }
                                
                                if (showFeedback) {
                                    if (idx === showFeedback.answer) {
                                        // Correct Answer
                                        btnClasses = "bg-green-500 border-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.5)] scale-[1.02] z-10";
                                        circleClasses = "bg-white/20 text-white";
                                    } else if (idx === selectedOption && !showFeedback.correct) {
                                        // Wrong Selection
                                        btnClasses = "bg-red-500 border-red-500 text-white opacity-90";
                                        circleClasses = "bg-white/20 text-white";
                                    } else {
                                        // Unselected options during feedback
                                        btnClasses = "bg-gray-100 dark:bg-gray-800 border-transparent text-gray-400 dark:text-gray-600 opacity-50 grayscale";
                                    }
                                }

                                return (
                                    <button
                                        key={idx}
                                        disabled={!isMyTurn || selectedOption !== null}
                                        onClick={() => handleOptionClick(idx)}
                                        className={`
                                            relative min-h-[4rem] h-auto py-3 px-4 rounded-xl font-bold text-base md:text-lg text-left
                                            border-2 transition-all duration-200 transform
                                            flex items-center gap-3 shadow-sm
                                            ${btnClasses} 
                                            ${!isMyTurn ? 'opacity-60 cursor-not-allowed grayscale-[0.5]' : 'hover:-translate-y-0.5 hover:shadow-md cursor-pointer active:scale-95'}
                                        `}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0 transition-colors ${circleClasses}`}>
                                            {String.fromCharCode(65 + idx)}
                                        </div>
                                        <span className="leading-tight">{opt}</span>
                                        
                                        {/* Status Icon */}
                                        {showFeedback && idx === showFeedback.answer && (
                                            <i className="fas fa-check-circle absolute right-4 text-white text-xl animate__animated animate__zoomIn"></i>
                                        )}
                                        {showFeedback && idx === selectedOption && !showFeedback.correct && (
                                            <i className="fas fa-times-circle absolute right-4 text-white text-xl animate__animated animate__zoomIn"></i>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
                
                {/* Turn Indicator Pill */}
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full px-6 flex justify-center pointer-events-none">
                     <div className={`
                        px-6 py-3 rounded-full font-bold backdrop-blur-xl border shadow-lg flex items-center gap-3 transition-all duration-500
                        ${isMyTurn 
                            ? 'bg-green-500/90 dark:bg-green-600/90 text-white border-green-400/50 scale-105 shadow-green-500/30' 
                            : 'bg-white/90 dark:bg-gray-800/90 text-gray-600 dark:text-gray-300 border-white/50 dark:border-white/10 scale-95'}
                     `}>
                         {isMyTurn ? (
                             <>
                                <span className="relative flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                                </span>
                                <span className="tracking-wide text-sm">YOUR TURN</span>
                             </>
                         ) : (
                             <>
                                <i className="fas fa-hourglass-half animate-spin-slow"></i>
                                <span className="tracking-wide text-sm">{opponentProfile.name.toUpperCase()} THINKING...</span>
                             </>
                         )}
                    </div>
                </div>
            </>
        )}
      </div>
    </div>
  );
};

export default GamePage;