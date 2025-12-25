import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, onDisconnect, get, set, remove } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { POINTS_PER_QUESTION } from '../constants';
import { MatchState, Question, Chapter } from '../types';
import { Avatar, Button, Card } from '../components/UI';
import { playSound } from '../services/audioService';
import { showConfirm } from '../services/alert';
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
  const [opponentProfile, setOpponentProfile] = useState<{name: string, avatar: string, uid: string} | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState<{correct: boolean, answer: number} | null>(null);
  const [pointsAwardedForDisconnect, setPointsAwardedForDisconnect] = useState(false);
  
  // Animation State
  const [showIntro, setShowIntro] = useState(false);
  
  const processingRef = useRef(false);

  useEffect(() => {
    if (!matchId || !user) return;
    const matchRef = ref(db, `matches/${matchId}`);
    onDisconnect(matchRef).update({ status: 'completed', winner: 'disconnect' });

    const unsubscribe = onValue(matchRef, async (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        set(ref(db, `users/${user.uid}/activeMatch`), null);
        navigate('/');
        return;
      }
      setMatch(data);

      if (questions.length === 0 && data.subject) {
          let loadedQ: Question[] = [];
          const cacheKey = `questions_cache_${data.subject}`;
          const cachedData = localStorage.getItem(cacheKey);
          
          if (data.subject.startsWith('ALL_')) {
              const subjectId = data.subject.replace('ALL_', '');
              const chapters = Object.values((await get(ref(db, `chapters/${subjectId}`))).val() || {}) as Chapter[];
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
          }
      }

      if (!opponentProfile) {
        const oppUid = Object.keys(data.scores).find(uid => uid !== user.uid);
        if (oppUid) {
             const oppSnap = await get(ref(db, `users/${oppUid}`));
             if (oppSnap.exists()) {
                 setOpponentProfile({ uid: oppUid, ...oppSnap.val() });
                 // Only show intro if it's the very start of the match
                 if (data.currentQ === 0) {
                     setShowIntro(true);
                     playSound('click'); // Or a better dramatic sound if available
                 }
             }
        }
      }

      if (data.status === 'completed' && data.winner) {
          if (data.winner === user.uid) { playSound('win'); confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } }); }
          else if (data.winner !== 'draw') playSound('wrong'); 
      }
    });

    return () => { unsubscribe(); onDisconnect(matchRef).cancel(); };
  }, [matchId, user, navigate]); 

  // Handle Intro Timeout
  useEffect(() => {
      if (showIntro && match && opponentProfile) {
          const timer = setTimeout(() => {
              setShowIntro(false);
          }, 3500); // 3.5 seconds duration
          return () => clearTimeout(timer);
      }
  }, [showIntro, match, opponentProfile]);

  const currentQuestion = match && questions.length > 0 ? questions[match.currentQ] : null;
  const isMyTurn = match?.turn === user?.uid;
  const isGameOver = match?.status === 'completed';

  useEffect(() => {
      if (isGameOver && match?.winner === 'disconnect' && !pointsAwardedForDisconnect && match.mode === 'auto' && questions.length > 0 && user) {
          setPointsAwardedForDisconnect(true);
          get(ref(db, `users/${user.uid}/points`)).then(s => update(ref(db, `users/${user.uid}`), { points: (s.val() || 0) + Math.floor(questions.length * POINTS_PER_QUESTION / 2) }));
      }
  }, [isGameOver, match, questions, user, pointsAwardedForDisconnect]);

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
            const nextQ = match.currentQ + 1;
            const newScores = { ...match.scores };
            if (isCorrect) newScores[user.uid] += POINTS_PER_QUESTION;

            const oppUid = Object.keys(match.scores).find(uid => uid !== user.uid) || '';
            
            if (nextQ >= questions.length) {
               let winner = 'draw';
               if (newScores[user.uid] > newScores[oppUid]) winner = user.uid;
               else if (newScores[oppUid] > newScores[user.uid]) winner = oppUid;

               const curPts = (await get(ref(db, `users/${user.uid}/points`))).val() || 0;
               await update(ref(db, `users/${user.uid}`), { points: curPts + newScores[user.uid], activeMatch: null });
               await update(ref(db, `matches/${matchId}`), { scores: newScores, status: 'completed', winner });
            } else {
                await update(ref(db, `matches/${matchId}`), { scores: newScores, currentQ: nextQ, turn: oppUid });
            }
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

  if (!match || !opponentProfile || (!currentQuestion && !isGameOver && !showIntro)) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-black text-2xl animate-pulse">CONNECTING...</div>;
  }

  return (
    <div className="min-h-screen relative flex flex-col font-sans bg-slate-100 dark:bg-slate-900 overflow-hidden">
      
      {/* VERSUS INTRO ANIMATION */}
      {showIntro && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 overflow-hidden">
              {/* Left Side (Player) */}
              <div className="absolute inset-y-0 left-0 w-1/2 bg-indigo-600 flex flex-col items-center justify-center animate__animated animate__slideInLeft">
                  <div className="relative z-10 scale-150">
                     <Avatar src={profile?.avatar} seed={user!.uid} size="xl" className="border-4 border-white shadow-2xl" />
                  </div>
                  <h2 className="mt-8 text-3xl font-black text-white uppercase italic tracking-widest drop-shadow-lg">{profile?.name}</h2>
              </div>

              {/* Right Side (Opponent) */}
              <div className="absolute inset-y-0 right-0 w-1/2 bg-red-600 flex flex-col items-center justify-center animate__animated animate__slideInRight">
                  <div className="relative z-10 scale-150">
                     <Avatar src={opponentProfile.avatar} seed={opponentProfile.uid} size="xl" className="border-4 border-white shadow-2xl" />
                  </div>
                  <h2 className="mt-8 text-3xl font-black text-white uppercase italic tracking-widest drop-shadow-lg">{opponentProfile.name}</h2>
              </div>

              {/* Center Effects */}
              <div className="absolute z-20 flex flex-col items-center justify-center">
                  <div className="relative animate-clash">
                      <h1 className="text-[120px] font-black italic text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 drop-shadow-[0_0_25px_rgba(234,179,8,0.8)] leading-none stroke-black" style={{ WebkitTextStroke: '4px black' }}>
                          VS
                      </h1>
                  </div>
                  <div className="mt-8 text-2xl font-black text-white uppercase tracking-[0.5em] animate__animated animate__fadeInUp animate__delay-1s">
                      Get Ready
                  </div>
              </div>
              
              {/* Lightning / Energy Effects (CSS gradients) */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none"></div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-2 bg-white rotate-45 blur-md opacity-50 animate-pulse"></div>
          </div>
      )}

      {/* HUD */}
      <div className="pt-4 px-4 pb-2 z-20">
         <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl p-3 flex justify-between items-center border-b-4 border-slate-200 dark:border-slate-700">
            {/* Me */}
            <div className={`flex items-center gap-3 transition-transform ${isMyTurn && !isGameOver ? 'scale-105' : 'scale-100 opacity-80'}`}>
                 <Avatar src={profile?.avatar} seed={user!.uid} size="sm" border={isMyTurn ? '3px solid #6366f1' : '3px solid transparent'} />
                 <div>
                     <div className="text-[10px] font-black uppercase text-slate-400">You</div>
                     <div className="text-2xl font-black text-game-primary leading-none">{match.scores[user!.uid]}</div>
                 </div>
            </div>
            
            <div className="flex flex-col items-center">
                 <div className="text-xl font-black text-slate-300 dark:text-slate-600 italic">VS</div>
                 <div className="text-xs font-bold text-slate-400">Q {match.currentQ + 1}/{questions.length}</div>
            </div>

            {/* Opponent */}
            <div className={`flex items-center gap-3 flex-row-reverse text-right transition-transform ${!isMyTurn && !isGameOver ? 'scale-105' : 'scale-100 opacity-80'}`}>
                 <Avatar src={opponentProfile.avatar} seed={opponentProfile.uid} size="sm" border={!isMyTurn ? '3px solid #ef4444' : '3px solid transparent'} />
                 <div>
                     <div className="text-[10px] font-black uppercase text-slate-400 truncate w-16">{opponentProfile.name}</div>
                     <div className="text-2xl font-black text-game-danger leading-none">{match.scores[opponentProfile.uid]}</div>
                 </div>
            </div>
         </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-3xl mx-auto z-10">
        {isGameOver ? (
           <Card className="text-center w-full animate__animated animate__zoomIn !p-10 border-t-8 border-game-primary">
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
               
               <div className="flex justify-center gap-12 mb-10">
                   <div className="text-center">
                       <Avatar src={profile?.avatar} size="lg" className="mx-auto mb-2" />
                       <div className="font-black text-xl">{match.scores[user!.uid]}</div>
                   </div>
                   <div className="text-center opacity-75">
                       <Avatar src={opponentProfile.avatar} size="lg" className="mx-auto mb-2 grayscale" />
                       <div className="font-black text-xl">{match.scores[opponentProfile.uid]}</div>
                   </div>
               </div>

               <Button onClick={handleLeave} size="lg" fullWidth>Return to Base</Button>
           </Card>
        ) : (
            <>
                <div className="w-full bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-[0_10px_0_rgba(0,0,0,0.1)] mb-6 text-center border-2 border-slate-100 dark:border-slate-700 min-h-[160px] flex items-center justify-center">
                    <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white leading-relaxed">
                        {currentQuestion && currentQuestion.question}
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    {currentQuestion && currentQuestion.options.map((opt, idx) => {
                        let btnStyle = "bg-white dark:bg-slate-800 border-b-4 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700";
                        if (selectedOption === idx) btnStyle = "bg-game-primary text-white border-b-4 border-game-primaryDark";
                        if (showFeedback) {
                            if (idx === showFeedback.answer) btnStyle = "bg-game-success text-white border-b-4 border-game-successDark";
                            else if (idx === selectedOption) btnStyle = "bg-game-danger text-white border-b-4 border-game-dangerDark";
                            else btnStyle = "opacity-40 grayscale";
                        }
                        
                        return (
                            <button
                                key={idx}
                                disabled={!isMyTurn || selectedOption !== null}
                                onClick={() => handleOptionClick(idx)}
                                className={`
                                    relative p-4 rounded-2xl font-bold text-lg text-left transition-all active:translate-y-1 active:border-b-0 active:mb-[4px] shadow-sm
                                    ${btnStyle} ${!isMyTurn ? 'cursor-not-allowed opacity-70' : ''}
                                `}
                            >
                                <span className="mr-3 opacity-60 font-black">{String.fromCharCode(65 + idx)}</span>
                                {opt}
                            </button>
                        );
                    })}
                </div>

                {!isMyTurn && (
                    <div className="mt-8 flex items-center gap-3 bg-white/80 dark:bg-slate-800/80 px-6 py-3 rounded-full shadow-lg backdrop-blur animate-pulse">
                        <div className="w-3 h-3 bg-game-danger rounded-full"></div>
                        <span className="font-bold text-slate-600 dark:text-slate-300 text-sm uppercase">Opponent Thinking...</span>
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default GamePage;