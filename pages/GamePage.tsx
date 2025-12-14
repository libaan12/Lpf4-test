import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, onDisconnect, get, set, remove } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../App';
import { POINTS_PER_QUESTION } from '../constants';
import { MatchState, Question } from '../types';
import { Avatar, Button } from '../components/UI';
import { playSound } from '../services/audioService';
import confetti from 'canvas-confetti';
import Swal from 'sweetalert2';

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
          const qRef = ref(db, `questions/${data.subject}`);
          const qSnap = await get(qRef);
          if (qSnap.exists()) {
              let loadedQ = Object.values(qSnap.val()) as Question[];
              
              if (data.mode === 'custom' && data.questionLimit && loadedQ.length > data.questionLimit) {
                  loadedQ = loadedQ.slice(0, data.questionLimit);
              }

              setQuestions(loadedQ);
          } else {
              console.error("No questions found for chapter: " + data.subject);
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
    
    const result = await Swal.fire({
      title: 'Surrender?',
      text: "You will lose this match and exit to the lobby.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, give up',
      cancelButtonText: 'Cancel',
      background: document.documentElement.classList.contains('dark') ? '#1f2937' : '#fff',
      color: document.documentElement.classList.contains('dark') ? '#fff' : '#000'
    });

    if (result.isConfirmed) {
        await update(ref(db, `matches/${matchId}`), {
            status: 'completed',
            winner: opponentProfile.uid
        });
        await set(ref(db, `users/${user.uid}/activeMatch`), null);
        navigate('/');
    }
  };

  // Loading State
  if (!match || !opponentProfile || (!currentQuestion && !isGameOver)) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 overflow-hidden relative transition-colors">
            <div className="absolute inset-0 -z-10">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-somali-blue/20 rounded-full blur-[100px] animate-pulse"></div>
            </div>
            <div className="flex flex-col items-center z-10">
                 <div className="w-16 h-16 border-4 border-somali-blue border-t-transparent rounded-full animate-spin mb-4"></div>
                 <h2 className="text-xl font-bold text-gray-700 dark:text-gray-300 animate-pulse">
                     {match && questions.length === 0 ? "Loading Quiz Data..." : "Initializing Battlefield..."}
                 </h2>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex flex-col font-sans transition-colors duration-500 bg-gray-50 dark:bg-gray-900">
      
      {/* Dynamic Background Blobs */}
       <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-400/20 dark:bg-blue-600/10 rounded-full blur-[120px] animate-blob mix-blend-multiply dark:mix-blend-screen"></div>
          <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-400/20 dark:bg-purple-600/10 rounded-full blur-[120px] animate-blob animation-delay-2000 mix-blend-multiply dark:mix-blend-screen"></div>
          <div className="absolute top-[40%] left-[30%] w-[400px] h-[400px] bg-pink-400/20 dark:bg-pink-600/10 rounded-full blur-[100px] animate-blob animation-delay-4000 mix-blend-multiply dark:mix-blend-screen"></div>
       </div>

      {/* Glass HUD - Floating Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 p-4 flex justify-center pointer-events-none">
         <div className="w-full max-w-4xl bg-white/70 dark:bg-gray-900/60 backdrop-blur-xl border border-white/50 dark:border-white/10 rounded-3xl shadow-lg p-2 px-4 flex justify-between items-center pointer-events-auto transition-all duration-300">
            {/* Player Left */}
            <div className={`flex items-center gap-3 transition-all duration-500 ${!isGameOver && isMyTurn ? 'scale-105 opacity-100' : 'opacity-70 scale-95'}`}>
                 <div className={`relative ${!isGameOver && isMyTurn ? 'ring-4 ring-green-400/50 rounded-full shadow-[0_0_15px_rgba(74,222,128,0.4)]' : ''}`}>
                    <Avatar src={profile?.avatar} seed={user!.uid} size="sm" />
                    {isMyTurn && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full animate-bounce"></div>}
                 </div>
                 <div className="flex flex-col">
                     <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">You</span>
                     <span className="text-xl font-black text-gray-800 dark:text-white font-mono leading-none">{match.scores[user!.uid]}</span>
                 </div>
            </div>

            {/* Center VS */}
            <div className="flex flex-col items-center">
                 <div className="font-black text-gray-300 dark:text-white/10 text-3xl italic select-none">VS</div>
                 {!isGameOver && (
                    <button 
                        onClick={handleSurrender} 
                        className="mt-1 text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600 bg-red-50/80 dark:bg-red-900/20 px-3 py-1 rounded-full transition-colors backdrop-blur-sm"
                    >
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
                     <span className="text-xl font-black text-gray-800 dark:text-white font-mono leading-none">{match.scores[opponentProfile.uid]}</span>
                 </div>
            </div>
         </div>
      </div>

      {/* Main Game Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 pt-28 pb-10 w-full max-w-3xl mx-auto z-10">
        {isGameOver ? (
           <div className="text-center w-full animate__animated animate__zoomIn bg-white/70 dark:bg-gray-800/60 backdrop-blur-2xl p-10 rounded-[2.5rem] border border-white/60 dark:border-white/10 shadow-2xl">
               {match.winner === 'disconnect' ? (
                   <>
                       <div className="w-24 h-24 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                           <i className="fas fa-plug text-4xl text-red-500"></i>
                       </div>
                       <h2 className="text-3xl font-extrabold mb-2 text-gray-900 dark:text-white">Opponent Left</h2>
                       <p className="mb-8 text-gray-500 dark:text-gray-300">
                           {match.mode === 'auto' 
                               ? "They disconnected. You get half points!"
                               : "The match was interrupted."}
                       </p>
                   </>
               ) : (
                   <>
                       <h2 className="text-5xl font-black mb-4 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-orange-600 drop-shadow-sm">
                           {match.winner === user!.uid ? 'VICTORY!' : match.winner === 'draw' ? 'DRAW!' : 'DEFEAT'}
                       </h2>
                       <div className="text-8xl mb-8 filter drop-shadow-xl animate__animated animate__tada animate__delay-1s">
                           {match.winner === user!.uid ? '🏆' : match.winner === 'draw' ? '🤝' : '💀'}
                       </div>
                       <div className="flex justify-center gap-8 mb-8">
                           <div className="flex flex-col items-center">
                               <Avatar src={profile?.avatar} seed={user!.uid} size="md" className="border-4 border-white dark:border-gray-700 shadow-lg" />
                               <span className="font-bold mt-2 dark:text-white text-lg">{match.scores[user!.uid]}</span>
                           </div>
                           <div className="flex flex-col items-center opacity-70">
                               <Avatar src={opponentProfile.avatar} seed={opponentProfile.uid} size="md" className="border-4 border-white dark:border-gray-700 shadow-lg grayscale" />
                               <span className="font-bold mt-2 dark:text-white text-lg">{match.scores[opponentProfile.uid]}</span>
                           </div>
                       </div>
                   </>
               )}
               <Button onClick={handleLeave} variant="primary" className="px-8 py-4 text-lg shadow-blue-500/30 hover:scale-105">
                   Return to Lobby
               </Button>
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

                        {/* Glass Question Card */}
                        <div className="w-full bg-white/70 dark:bg-gray-800/40 backdrop-blur-xl border border-white/60 dark:border-white/10 text-gray-900 dark:text-white rounded-[2rem] p-8 md:p-10 shadow-xl text-center mb-8 min-h-[200px] flex items-center justify-center animate__animated animate__fadeIn">
                            <h2 className="text-2xl md:text-3xl font-bold leading-snug drop-shadow-sm">
                                {currentQuestion.question}
                            </h2>
                        </div>

                        {/* Options Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                            {currentQuestion.options.map((opt, idx) => {
                                let btnStyle = "bg-white/50 dark:bg-gray-800/30 text-gray-700 dark:text-gray-200 border-white/50 dark:border-white/10 hover:bg-white/80 dark:hover:bg-gray-700/50"; // Default Glass
                                
                                if (selectedOption === idx) {
                                    btnStyle = "bg-somali-blue/90 text-white border-somali-blue ring-4 ring-blue-400/30 scale-[1.02] shadow-lg"; // Selected
                                }
                                
                                if (showFeedback) {
                                    if (idx === showFeedback.answer) btnStyle = "bg-green-500 text-white border-green-600 shadow-[0_0_20px_rgba(34,197,94,0.4)] scale-[1.02]";
                                    else if (idx === selectedOption && !showFeedback.correct) btnStyle = "bg-red-500 text-white border-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)] opacity-90";
                                    else btnStyle = "bg-gray-200/50 dark:bg-gray-900/50 text-gray-400 dark:text-gray-600 border-transparent opacity-50 scale-95";
                                }

                                return (
                                    <button
                                        key={idx}
                                        disabled={!isMyTurn || selectedOption !== null}
                                        onClick={() => handleOptionClick(idx)}
                                        className={`
                                            relative h-24 md:h-28 rounded-2xl font-bold text-lg md:text-xl
                                            border-2 transition-all duration-300 transform
                                            flex items-center justify-center p-4 backdrop-blur-md shadow-sm
                                            ${btnStyle} 
                                            ${!isMyTurn ? 'opacity-60 cursor-not-allowed grayscale-[0.5]' : 'hover:-translate-y-1 hover:shadow-md cursor-pointer active:scale-95'}
                                        `}
                                    >
                                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black opacity-20 text-current text-[2rem]">
                                            {String.fromCharCode(65 + idx)}
                                        </div>
                                        <span className="relative z-10">{opt}</span>
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
                            : 'bg-white/80 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 border-white/40 dark:border-white/10 scale-95'}
                     `}>
                         {isMyTurn ? (
                             <>
                                <span className="relative flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                                </span>
                                <span className="tracking-wide">YOUR TURN</span>
                             </>
                         ) : (
                             <>
                                <i className="fas fa-hourglass-half animate-spin-slow"></i>
                                <span className="tracking-wide">{opponentProfile.name.toUpperCase()} IS THINKING...</span>
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