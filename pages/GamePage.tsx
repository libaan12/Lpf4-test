import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, onDisconnect, get, set } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../App';
import { POINTS_PER_QUESTION } from '../constants';
import { MatchState, Question } from '../types';
import { Avatar, Button, Modal } from '../components/UI';
import { playSound } from '../services/audioService';
import confetti from 'canvas-confetti';

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
  
  // Refs for processing turns to avoid loops
  const processingRef = useRef(false);

  useEffect(() => {
    if (!matchId || !user) return;

    const matchRef = ref(db, `matches/${matchId}`);
    const userMatchRef = ref(db, `users/${user.uid}/activeMatch`);

    // Setup Disconnect handler
    onDisconnect(matchRef).update({ 
        status: 'completed', 
        winner: 'disconnect' 
    });

    const unsubscribe = onValue(matchRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        // Match cancelled or doesn't exist
        set(userMatchRef, null);
        navigate('/');
        return;
      }
      
      setMatch(data);

      // Load Questions if not loaded
      // data.subject holds the Chapter ID in the new system
      if (questions.length === 0 && data.subject) {
          const qRef = ref(db, `questions/${data.subject}`);
          const qSnap = await get(qRef);
          if (qSnap.exists()) {
              const loadedQ = Object.values(qSnap.val()) as Question[];
              setQuestions(loadedQ);
          } else {
              // Handle case where questions are missing/deleted for a chapter
              console.error("No questions found for chapter: " + data.subject);
          }
      }

      // Fetch Opponent Profile Once
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

      // Handle Game End
      if (data.status === 'completed') {
        if (data.winner && data.winner !== 'draw' && data.winner !== 'disconnect') {
             if (data.winner === user.uid) {
                 playSound('win');
                 confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
             } else {
                 playSound('wrong'); // Defeat sound
             }
        }
      }
    });

    return () => {
      unsubscribe();
      onDisconnect(matchRef).cancel();
    };
  }, [matchId, user, navigate]); // Removed opponentProfile from deps

  // Handle Logic
  const currentQuestion = match && questions.length > 0 ? questions[match.currentQ] : null;
  const isMyTurn = match?.turn === user?.uid;
  const isGameOver = match?.status === 'completed';

  const handleOptionClick = async (index: number) => {
    if (!match || !user || !isMyTurn || selectedOption !== null || processingRef.current || !currentQuestion) return;
    
    // Blind Answer Phase
    setSelectedOption(index);
    playSound('click');
    processingRef.current = true;

    // Simulate "Blind" delay
    setTimeout(async () => {
        // Show Feedback Phase
        const isCorrect = index === currentQuestion.answer;
        if (isCorrect) playSound('correct');
        else playSound('wrong');

        setShowFeedback({ correct: isCorrect, answer: currentQuestion.answer });

        // Update DB Phase (Wait another second so user sees feedback)
        setTimeout(async () => {
            const nextQ = match.currentQ + 1;
            const newScores = { ...match.scores };
            if (isCorrect) {
                newScores[user.uid] += POINTS_PER_QUESTION;
            }

            const opponentUid = Object.keys(match.scores).find(uid => uid !== user.uid) || '';
            const nextTurn = opponentUid;

            // Check End Condition
            if (nextQ >= questions.length) {
               // Determine winner
               let winner = 'draw';
               if (newScores[user.uid] > newScores[opponentUid]) winner = user.uid;
               if (newScores[opponentUid] > newScores[user.uid]) winner = opponentUid;

               // Update Stats
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

            // Reset Local State
            setSelectedOption(null);
            setShowFeedback(null);
            processingRef.current = false;
        }, 1500);
    }, 1000);
  };

  const handleLeave = async () => {
      if(!user || !matchId) return;
      await set(ref(db, `users/${user.uid}/activeMatch`), null);
      navigate('/');
  };

  const handleSurrender = async () => {
    if(!matchId || !user || !opponentProfile) return;
    
    // Simple confirm
    if (window.confirm("Are you sure you want to surrender? You will lose this match.")) {
        // Update match to completed, set winner to opponent
        await update(ref(db, `matches/${matchId}`), {
            status: 'completed',
            winner: opponentProfile.uid
        });
        // Remove my active match status
        await set(ref(db, `users/${user.uid}/activeMatch`), null);
        navigate('/');
    }
  };

  if (!match || !opponentProfile || (!currentQuestion && !isGameOver)) {
    return <div className="min-h-screen flex items-center justify-center bg-somali-blue text-white animate-pulse">
        {match && questions.length === 0 ? "Loading Questions..." : "Initializing Battle..."}
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-800 flex flex-col text-white relative overflow-hidden">
      {/* HUD */}
      <div className="flex justify-between items-center p-4 bg-gray-900 shadow-md z-10">
        <div className={`flex flex-col items-center transition-all ${isMyTurn ? 'scale-110 opacity-100' : 'opacity-60 scale-90'}`}>
           <Avatar src={profile?.avatar} seed={user!.uid} size="sm" className={isMyTurn ? 'ring-2 ring-green-400' : ''} />
           <span className="font-bold text-xs mt-1">You</span>
           <span className="text-yellow-400 font-mono text-lg">{match.scores[user!.uid]}</span>
        </div>
        
        <div className="flex flex-col items-center">
            <div className="font-bold text-gray-500 mb-1">VS</div>
            {!isGameOver && (
                <button 
                    onClick={handleSurrender} 
                    className="text-xs bg-red-900/50 hover:bg-red-800 text-red-300 px-3 py-1 rounded-full border border-red-800 transition-colors"
                >
                    <i className="fas fa-flag mr-1"></i> Exit
                </button>
            )}
        </div>

        <div className={`flex flex-col items-center transition-all ${!isMyTurn ? 'scale-110 opacity-100' : 'opacity-60 scale-90'}`}>
           <Avatar src={opponentProfile.avatar} seed={opponentProfile.uid} size="sm" className={!isMyTurn ? 'ring-2 ring-red-400 animate-pulse' : ''} />
           <span className="font-bold text-xs mt-1 truncate max-w-[60px]">{opponentProfile.name}</span>
           <span className="text-yellow-400 font-mono text-lg">{match.scores[opponentProfile.uid]}</span>
        </div>
      </div>

      {/* Game Area */}
      <div className="flex-1 flex flex-col p-6 items-center justify-center z-10">
        {isGameOver ? (
           <div className="text-center animate__animated animate__zoomIn">
               <h2 className="text-4xl font-bold mb-4">
                   {match.winner === user!.uid ? 'VICTORY!' : match.winner === 'draw' ? 'DRAW!' : 'DEFEAT'}
               </h2>
               <div className="text-6xl mb-8">
                   {match.winner === user!.uid ? '🏆' : match.winner === 'draw' ? '🤝' : '💀'}
               </div>
               <Button onClick={handleLeave} variant={match.winner === user!.uid ? 'primary' : 'secondary'}>Return Home</Button>
           </div>
        ) : (
            <>
                {currentQuestion && (
                    <>
                        <div className="bg-white text-gray-900 rounded-2xl p-6 shadow-2xl w-full text-center mb-8 min-h-[160px] flex items-center justify-center flex-col relative">
                            <span className="absolute top-2 right-4 text-xs font-bold text-gray-300">Q{match.currentQ + 1}</span>
                            <h2 className="text-2xl font-bold">{currentQuestion.question}</h2>
                        </div>

                        <div className="grid grid-cols-2 gap-4 w-full">
                            {currentQuestion.options.map((opt, idx) => {
                                let btnClass = "bg-white text-gray-800 hover:bg-gray-100";
                                if (selectedOption === idx) btnClass = "bg-somali-blue text-white ring-4 ring-blue-300"; // Blind select
                                
                                // Feedback Override
                                if (showFeedback) {
                                    if (idx === showFeedback.answer) btnClass = "bg-green-500 text-white";
                                    else if (idx === selectedOption && !showFeedback.correct) btnClass = "bg-red-500 text-white";
                                    else btnClass = "bg-gray-300 text-gray-500";
                                }

                                return (
                                    <button
                                        key={idx}
                                        disabled={!isMyTurn || selectedOption !== null}
                                        onClick={() => handleOptionClick(idx)}
                                        className={`h-24 rounded-xl font-bold text-lg shadow-lg transition-all transform active:scale-95 ${btnClass} ${!isMyTurn ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {opt}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
                
                <div className="mt-8 text-center text-sm font-bold text-gray-400">
                    {isMyTurn ? "IT'S YOUR TURN!" : `${opponentProfile.name} is thinking...`}
                </div>
            </>
        )}
      </div>
      
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
           <i className="fas fa-question text-9xl absolute top-20 left-10 text-white animate-spin-slow"></i>
           <i className="fas fa-shapes text-8xl absolute bottom-20 right-10 text-white animate-bounce"></i>
      </div>
    </div>
  );
};

export default GamePage;