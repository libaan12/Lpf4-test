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
      confirmButtonText: 'Yes, I give up',
      cancelButtonText: 'No, keep fighting',
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

  if (!match || !opponentProfile || (!currentQuestion && !isGameOver)) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-somali-blue dark:text-white animate-pulse font-bold text-xl transition-colors">
        <i className="fas fa-spinner fa-spin mr-3"></i> {match && questions.length === 0 ? "Loading Questions..." : "Initializing Battle..."}
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col text-gray-900 dark:text-white relative overflow-hidden transition-colors">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-200/50 dark:bg-blue-600/30 rounded-full blur-[100px] animate-blob pointer-events-none mix-blend-multiply dark:mix-blend-normal"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-purple-200/50 dark:bg-purple-600/30 rounded-full blur-[100px] animate-blob animation-delay-2000 pointer-events-none mix-blend-multiply dark:mix-blend-normal"></div>

      {/* HUD - Glassy */}
      <div className="flex justify-between items-center p-4 bg-white/70 dark:bg-white/5 backdrop-blur-xl border-b border-gray-200 dark:border-white/10 shadow-lg z-20">
        <div className={`flex flex-col items-center transition-all ${!isGameOver && isMyTurn ? 'scale-110 opacity-100' : 'opacity-60 scale-90'}`}>
           <Avatar src={profile?.avatar} seed={user!.uid} size="sm" className={!isGameOver && isMyTurn ? 'ring-4 ring-green-400/80 shadow-[0_0_20px_rgba(74,222,128,0.5)]' : ''} />
           <span className="font-bold text-xs mt-1 text-gray-500 dark:text-gray-300">You</span>
           <span className="text-yellow-500 dark:text-yellow-400 font-mono text-xl font-bold drop-shadow-sm">{match.scores[user!.uid]}</span>
        </div>
        
        <div className="flex flex-col items-center">
            <div className="font-extrabold text-gray-300 dark:text-white/50 mb-2 text-2xl italic tracking-widest">VS</div>
            {!isGameOver && (
                <button 
                    onClick={handleSurrender} 
                    className="text-xs bg-red-100 dark:bg-red-500/20 hover:bg-red-200 dark:hover:bg-red-500/40 text-red-600 dark:text-red-300 px-3 py-1 rounded-full border border-red-200 dark:border-red-500/30 transition-colors backdrop-blur-sm"
                >
                    <i className="fas fa-flag mr-1"></i> Exit
                </button>
            )}
        </div>

        <div className={`flex flex-col items-center transition-all ${!isGameOver && !isMyTurn ? 'scale-110 opacity-100' : 'opacity-60 scale-90'}`}>
           <Avatar src={opponentProfile.avatar} seed={opponentProfile.uid} size="sm" className={!isGameOver && !isMyTurn ? 'ring-4 ring-red-400/80 shadow-[0_0_20px_rgba(248,113,113,0.5)]' : ''} />
           <span className="font-bold text-xs mt-1 text-gray-500 dark:text-gray-300 truncate max-w-[60px]">{opponentProfile.name}</span>
           <span className="text-yellow-500 dark:text-yellow-400 font-mono text-xl font-bold drop-shadow-sm">{match.scores[opponentProfile.uid]}</span>
        </div>
      </div>

      {/* Game Area */}
      <div className="flex-1 flex flex-col p-6 items-center justify-center z-10 max-w-2xl mx-auto w-full">
        {isGameOver ? (
           <div className="text-center animate__animated animate__zoomIn bg-white/80 dark:bg-white/10 backdrop-blur-xl p-8 rounded-3xl border border-white/50 dark:border-white/20 shadow-2xl">
               {match.winner === 'disconnect' ? (
                   <>
                       <h2 className="text-3xl font-bold mb-2 text-red-500 dark:text-red-400">Opponent Disconnected</h2>
                       <div className="text-6xl mb-6">🔌</div>
                       <p className="mb-6 text-gray-700 dark:text-gray-300">
                           {match.mode === 'auto' 
                               ? "You have been awarded half marks for this match."
                               : "The match has ended."}
                       </p>
                   </>
               ) : (
                   <>
                       <h2 className="text-4xl font-extrabold mb-4 text-transparent bg-clip-text bg-gradient-to-br from-yellow-400 to-orange-600">
                           {match.winner === user!.uid ? 'VICTORY!' : match.winner === 'draw' ? 'DRAW!' : 'DEFEAT'}
                       </h2>
                       <div className="text-7xl mb-8 filter drop-shadow-lg">
                           {match.winner === user!.uid ? '🏆' : match.winner === 'draw' ? '🤝' : '💀'}
                       </div>
                   </>
               )}
               <Button onClick={handleLeave} variant="primary" className="shadow-lg">Return Home</Button>
           </div>
        ) : (
            <>
                {currentQuestion && (
                    <>
                        {/* Question Card - Glassy */}
                        <div className="bg-white dark:bg-white/10 backdrop-blur-md border border-gray-100 dark:border-white/20 text-gray-900 dark:text-white rounded-3xl p-8 shadow-2xl w-full text-center mb-8 min-h-[180px] flex items-center justify-center flex-col relative animate__animated animate__fadeIn">
                            <span className="absolute top-3 right-5 text-xs font-bold text-gray-400 dark:text-white/40 tracking-widest bg-gray-100 dark:bg-black/20 px-2 py-1 rounded-lg">QUESTION {match.currentQ + 1} / {questions.length}</span>
                            <h2 className="text-2xl font-bold leading-relaxed">{currentQuestion.question}</h2>
                        </div>

                        <div className="grid grid-cols-2 gap-4 w-full">
                            {currentQuestion.options.map((opt, idx) => {
                                let btnClass = "bg-white dark:bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10 border-gray-200 dark:border-white/10"; // Default
                                if (selectedOption === idx) btnClass = "bg-somali-blue text-white ring-4 ring-blue-400/50 border-transparent shadow-[0_0_15px_rgba(59,130,246,0.5)]"; // Selected
                                
                                if (showFeedback) {
                                    if (idx === showFeedback.answer) btnClass = "bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.5)] border-transparent";
                                    else if (idx === selectedOption && !showFeedback.correct) btnClass = "bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)] border-transparent";
                                    else btnClass = "bg-gray-100 dark:bg-black/30 text-gray-400 dark:text-gray-500 border-transparent";
                                }

                                return (
                                    <button
                                        key={idx}
                                        disabled={!isMyTurn || selectedOption !== null}
                                        onClick={() => handleOptionClick(idx)}
                                        className={`h-28 rounded-2xl font-bold text-lg border transition-all transform active:scale-95 shadow-md flex items-center justify-center p-2 backdrop-blur-sm ${btnClass} ${!isMyTurn ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {opt}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
                
                <div className="mt-8 text-center">
                    <div className={`inline-block px-4 py-2 rounded-full text-sm font-bold backdrop-blur-md border border-gray-200 dark:border-white/10 shadow-lg ${isMyTurn ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300' : 'bg-white dark:bg-white/10 text-gray-500 dark:text-gray-400'}`}>
                         {isMyTurn ? (
                             <span className="flex items-center gap-2"><div className="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full animate-ping"></div> IT'S YOUR TURN</span>
                         ) : (
                             <span className="flex items-center gap-2"><i className="fas fa-hourglass-half"></i> {opponentProfile.name} IS THINKING...</span>
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