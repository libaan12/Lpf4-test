
import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, onDisconnect, get, set, remove, serverTimestamp, push, onChildAdded, off, query, limitToLast } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { POINTS_PER_QUESTION } from '../constants';
import { MatchState, Question, Chapter, UserProfile, MatchReaction } from '../types';
import { Avatar, Button, Card, Modal } from '../components/UI';
import { playSound } from '../services/audioService';
import { showToast, showConfirm } from '../services/alert';
import confetti from 'canvas-confetti';
import Swal from 'sweetalert2';

const DEFAULT_EMOJIS = ['😂', '😡', '👏', '😱', '🥲', '🔥', '🏆', '🤯'];
const DEFAULT_MESSAGES = ['Nasiib wacan!', 'Aad u fiican', 'Iska jir!', 'Hala soo baxo!', 'Mahadsanid'];

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
  const [playersMap, setPlayersMap] = useState<Record<string, UserProfile>>({});
  const [isSpectator, setIsSpectator] = useState(false);

  // Gameplay State
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState<{correct: boolean, answer: number} | null>(null);
  const [timer, setTimer] = useState(0); // For 4P response time tracking
  
  // Animation State
  const [showIntro, setShowIntro] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);
  const [introShownOnce, setIntroShownOnce] = useState(false);
  const [showTurnAlert, setShowTurnAlert] = useState(false);
  const winnerAnimationPlayed = useRef(false);
  
  // Reaction States
  const [showReactionMenu, setShowReactionMenu] = useState(false);
  const [activeReactions, setActiveReactions] = useState<{id: number, senderId: string, value: string}[]>([]);
  const reactionCounter = useRef(0);
  
  // Dynamic Reactions
  const [reactionEmojis, setReactionEmojis] = useState<string[]>(DEFAULT_EMOJIS);
  const [reactionMessages, setReactionMessages] = useState<string[]>(DEFAULT_MESSAGES);

  const [isLoadingError, setIsLoadingError] = useState(false);
  const processingRef = useRef(false);
  const questionsLoadedRef = useRef(false);
  const timerStartRef = useRef<number>(0);

  // --- SYNC MATCH & PLAYERS ---
  useEffect(() => {
    if (!matchId || !user) return;
    winnerAnimationPlayed.current = false;

    const matchRef = ref(db, `matches/${matchId}`);
    const unsubscribe = onValue(matchRef, async (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        if (!profile?.isSupport) set(ref(db, `users/${user.uid}/activeMatch`), null);
        navigate(profile?.isSupport ? '/support' : '/');
        return;
      }
      
      setMatch(data);

      // Determine Role & Fetch Missing Profiles
      const pIds = Object.keys(data.players || {});
      const userIsPlayer = pIds.includes(user.uid);
      
      if (!userIsPlayer && !profile?.isSupport) { navigate('/'); return; }
      if (!userIsPlayer && profile?.isSupport) setIsSpectator(true);

      // Batch Fetch Player Profiles if not already loaded
      pIds.forEach(async (pid) => {
          if (!playersMap[pid]) {
              const snap = await get(ref(db, `users/${pid}`));
              if (snap.exists()) {
                  setPlayersMap(prev => ({...prev, [pid]: { uid: pid, ...snap.val() }}));
              }
          }
      });

      // Check Winner (Once only)
      if (data.status === 'completed' && !winnerAnimationPlayed.current) {
          winnerAnimationPlayed.current = true;
          playSound('win'); 
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } }); 
      }
    });

    return () => { unsubscribe(); };
  }, [matchId, user]); 

  // --- REACTION LISTENER ---
  useEffect(() => {
      if (!matchId) return;
      const reactionsRef = query(ref(db, `matches/${matchId}/reactions`), limitToLast(3));
      const unsub = onChildAdded(reactionsRef, (snapshot) => {
          const data = snapshot.val();
          if (!data || data.senderId === user?.uid) return;
          if (Date.now() - data.timestamp < 5000) triggerReactionAnimation(data);
      });
      return () => off(reactionsRef);
  }, [matchId, user?.uid]);

  const triggerReactionAnimation = (reaction: MatchReaction) => {
    const id = ++reactionCounter.current;
    setActiveReactions(prev => [...(prev.length > 5 ? prev.slice(1) : prev), { id, senderId: reaction.senderId, value: reaction.value }]);
    playSound('reaction');
    setTimeout(() => setActiveReactions(prev => prev.filter(r => r.id !== id)), 4000);
  };

  const sendReaction = async (val: string) => {
      if (!user || !matchId) return;
      setShowReactionMenu(false);
      playSound('click'); 
      const reaction: MatchReaction = { senderId: user.uid, value: val, timestamp: Date.now() };
      triggerReactionAnimation(reaction);
      await push(ref(db, `matches/${matchId}/reactions`), reaction);
  };

  // --- PRESENCE ---
  useEffect(() => {
      if (!matchId || !user || isSpectator) return;
      const connectedRef = ref(db, ".info/connected");
      const unsubscribeConnected = onValue(connectedRef, (snap) => {
          if (snap.val() === true) {
              const myStatusRef = ref(db, `matches/${matchId}/players/${user.uid}`);
              onDisconnect(myStatusRef).update({ status: 'offline', lastSeen: serverTimestamp() })
                  .then(() => update(myStatusRef, { status: 'online', lastSeen: serverTimestamp() }));
          }
      });
      return () => unsubscribeConnected();
  }, [matchId, user, isSpectator]);

  // --- LOAD QUESTIONS ---
  useEffect(() => {
      if (!match || !match.subject || questions.length > 0 || questionsLoadedRef.current) return;
      loadQuestions();
  }, [match?.subject, match?.matchId]);

  const loadQuestions = async () => {
      if (!match) return;
      questionsLoadedRef.current = true;
      setIsLoadingError(false);
      let loadedQ: Question[] = [];
      const cacheKey = `questions_cache_${match.subject}`;
      const cachedData = localStorage.getItem(cacheKey);
      
      try {
        if (match.subjectTitle) setSubjectName(match.subjectTitle);

        if (match.subject.startsWith('ALL_')) {
            const subjectId = match.subject.replace('ALL_', '');
            const chaptersSnap = await get(ref(db, `chapters/${subjectId}`));
            if (chaptersSnap.exists()) {
                const chapters = Object.values(chaptersSnap.val() || {}) as Chapter[];
                const snaps = await Promise.all(chapters.map(c => get(ref(db, `questions/${c.id}`))));
                snaps.forEach(s => {
                    if (s.exists()) {
                        const data = s.val();
                        loadedQ.push(...Object.keys(data).map(key => ({ ...data[key], id: key })));
                    }
                });
            }
        } else {
            if (cachedData) try { loadedQ = JSON.parse(cachedData); } catch(e) {}
            if (loadedQ.length === 0) {
                const snap = await get(ref(db, `questions/${match.subject}`));
                if(snap.exists()) {
                    const data = snap.val();
                    loadedQ = Object.keys(data).map(key => ({ ...data[key], id: key }));
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
            setQuestions(shuffledQ.slice(0, match.questionLimit || 10));
        } else {
            setIsLoadingError(true);
            questionsLoadedRef.current = false;
        }
      } catch(e) {
          setIsLoadingError(true);
          questionsLoadedRef.current = false;
      }
  };

  // --- GAME START SEQUENCER ---
  useEffect(() => {
      // Intro Condition: Questions loaded, not spectator, start of game
      if (!introShownOnce && questions.length > 0 && match && match.currentQ === 0 && !isSpectator) {
          // For 4P, we don't wait for turn, we wait for questions
          setShowIntro(true);
          setIntroShownOnce(true);
          playSound('click');
      }
  }, [questions.length, match?.matchId, introShownOnce, isSpectator]);

  useEffect(() => {
      if (showIntro) {
          const timer = setTimeout(() => { setShowIntro(false); startCountdown(); }, 3500); 
          return () => clearTimeout(timer);
      }
  }, [showIntro]);

  const startCountdown = () => {
      setShowCountdown(true);
      setCountdownValue(3);
      playSound('tick'); 
      const interval = setInterval(() => {
          setCountdownValue(prev => {
              if (prev === 1) {
                  clearInterval(interval);
                  playSound('fight'); 
                  setTimeout(() => {
                      setShowCountdown(false);
                      // Start Timer for Question 1
                      timerStartRef.current = Date.now();
                  }, 1000);
                  return 0; 
              }
              playSound('tick');
              return prev - 1;
          });
      }, 1000);
  };

  // --- 1v1 TURN LOGIC ---
  useEffect(() => {
      if (match?.mode !== '4p' && match?.turn === user?.uid && !match.winner && !isSpectator && !showIntro && !showCountdown) {
          setShowTurnAlert(true);
          playSound('turn');
          const timer = setTimeout(() => setShowTurnAlert(false), 2000);
          return () => clearTimeout(timer);
      } else {
          setShowTurnAlert(false);
      }
  }, [match?.turn, user?.uid, isSpectator, showIntro, showCountdown]);

  // --- RESET STATE ON NEW QUESTION ---
  useEffect(() => {
      if (match?.currentQ !== undefined) {
          setSelectedOption(null);
          setShowFeedback(null);
          processingRef.current = false;
          timerStartRef.current = Date.now();
      }
  }, [match?.currentQ]);

  // --- 1v1 ANSWER HANDLER ---
  const handleOptionClick1v1 = async (index: number) => {
    if (isSpectator || !match || !user || match.turn !== user.uid || selectedOption !== null || processingRef.current) return;
    const currentQuestion = questions[match.currentQ];
    if (!currentQuestion) return;

    processingRef.current = true;
    setSelectedOption(index);
    playSound('click');

    const isCorrect = index === currentQuestion.answer;
    isCorrect ? playSound('correct') : playSound('wrong');
    setShowFeedback({ correct: isCorrect, answer: currentQuestion.answer });

    setTimeout(async () => {
        const currentScores = match.scores || {};
        const oppUid = Object.keys(currentScores).find(uid => uid !== user.uid) || '';
        const newScores = { ...currentScores };
        if (isCorrect) newScores[user.uid] = (newScores[user.uid] || 0) + POINTS_PER_QUESTION;

        const currentAnswers = match.answersCount || 0;
        let nextQ = match.currentQ;
        let nextAnswersCount = currentAnswers + 1;
        
        if (nextAnswersCount >= 2) {
            // Both answered
            if (match.currentQ >= questions.length - 1) {
                // Game Over
                finishMatch(newScores);
                return;
            }
            nextQ++;
            nextAnswersCount = 0;
        }

        await update(ref(db, `matches/${matchId}`), { 
            scores: newScores, currentQ: nextQ, turn: oppUid, answersCount: nextAnswersCount 
        });
    }, 1000); 
  };

  // --- 4P ANSWER HANDLER ---
  const handleOptionClick4P = async (index: number) => {
      if (isSpectator || !match || !user || selectedOption !== null || processingRef.current) return;
      const currentQuestion = questions[match.currentQ];
      if (!currentQuestion) return;

      processingRef.current = true;
      setSelectedOption(index);
      playSound('click');

      const isCorrect = index === currentQuestion.answer;
      isCorrect ? playSound('correct') : playSound('wrong');
      setShowFeedback({ correct: isCorrect, answer: currentQuestion.answer });

      // Calculate Response Time (ms)
      const responseTime = Date.now() - timerStartRef.current;

      setTimeout(async () => {
          const updates: any = {};
          
          // 1. Update Personal Score & Time
          if (isCorrect) {
              const myScore = (match.scores?.[user.uid] || 0) + POINTS_PER_QUESTION;
              updates[`scores/${user.uid}`] = myScore;
          }
          const myTotalTime = (match.totalResponseTime?.[user.uid] || 0) + responseTime;
          updates[`totalResponseTime/${user.uid}`] = myTotalTime;

          // 2. Mark as Answered for this Question
          updates[`currentAnswers/${user.uid}`] = true;

          await update(ref(db, `matches/${matchId}`), updates);

          // 3. Check if Everyone Answered (Host Only to avoid race conditions, or Transaction)
          // We'll rely on a transaction to safely increment Q or check player count
          // Simplified: The client checks if they are the last one.
          const players = Object.keys(match.players || {});
          const answers = { ...(match.currentAnswers || {}), [user.uid]: true };
          
          // Filter active players (ignore left/offline players logic could be added here)
          const activePlayersCount = players.length; 
          const answerCount = Object.keys(answers).length;

          if (answerCount >= activePlayersCount) {
              if (match.currentQ >= questions.length - 1) {
                  // Finish Match
                  finishMatch4P();
              } else {
                  // Next Question
                  await update(ref(db, `matches/${matchId}`), {
                      currentQ: match.currentQ + 1,
                      currentAnswers: null
                  });
              }
          }
      }, 1000);
  };

  const finishMatch = async (finalScores: Record<string, number>) => {
        if (!match || !user) return;
        let winner = 'draw';
        const pIds = Object.keys(finalScores);
        if (finalScores[pIds[0]] > finalScores[pIds[1]]) winner = pIds[0];
        else if (finalScores[pIds[1]] > finalScores[pIds[0]]) winner = pIds[1];

        // Update User Profiles
        for (const uid of pIds) {
            const currentPts = (await get(ref(db, `users/${uid}/points`))).val() || 0;
            await update(ref(db, `users/${uid}`), { points: currentPts + finalScores[uid], activeMatch: null });
        }
        await update(ref(db, `matches/${matchId}`), { scores: finalScores, status: 'completed', winner });
  };

  const finishMatch4P = async () => {
      // Calculate ranks based on Score -> Time
      if (!match) return;
      const players = Object.keys(match.players || {});
      
      const ranked = players.sort((a, b) => {
          const scoreA = match.scores?.[a] || 0;
          const scoreB = match.scores?.[b] || 0;
          if (scoreB !== scoreA) return scoreB - scoreA;
          
          const timeA = match.totalResponseTime?.[a] || 0;
          const timeB = match.totalResponseTime?.[b] || 0;
          return timeA - timeB; // Lower time is better
      });

      const winner = ranked[0];
      
      // Award Points
      for (const uid of players) {
          const currentPts = (await get(ref(db, `users/${uid}/points`))).val() || 0;
          const earned = (match.scores?.[uid] || 0);
          await update(ref(db, `users/${uid}`), { points: currentPts + earned, activeMatch: null });
      }

      await update(ref(db, `matches/${matchId}`), { status: 'completed', winner });
  };

  const handleLeave = async () => {
      if(!user || !matchId) return;
      if (isSpectator) { navigate('/support'); return; }
      
      // If 4P host leaves, might want to kill room, but let's just mark user activeMatch null
      await set(ref(db, `users/${user.uid}/activeMatch`), null);
      navigate('/');
  };

  // --- RENDER HELPERS ---
  const render1v1Layout = () => {
      // (This is the existing layout logic, slightly refactored)
      const pIds = Object.keys(match!.players || {});
      const leftUid = user?.uid || pIds[0];
      const rightUid = pIds.find(id => id !== leftUid) || pIds[1] || 'ghost';
      const leftP = playersMap[leftUid] || { name: 'You', avatar: '', uid: leftUid, points: 0 };
      const rightP = playersMap[rightUid] || { name: 'Opponent', avatar: '', uid: rightUid, points: 0 };
      const leftScore = match!.scores?.[leftUid] || 0;
      const rightScore = match!.scores?.[rightUid] || 0;
      const activeLeft = match!.turn === leftUid;
      const activeRight = match!.turn === rightUid;

      return (
          <>
            {/* Header Scoreboard */}
            <div className="fixed top-0 left-0 right-0 z-50 p-3 pointer-events-none">
                <div className="max-w-4xl mx-auto bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/40 dark:border-slate-700/50 p-2 md:p-3 flex items-center justify-between pointer-events-auto transition-all duration-300">
                    {/* Me */}
                    <div className={`flex items-center gap-3 transition-all ${activeLeft ? 'scale-100 opacity-100' : 'scale-95 opacity-80 grayscale-[0.3]'}`}>
                        <div className={`p-[3px] rounded-full relative z-10 ${activeLeft ? 'bg-gradient-to-r from-orange-500 to-yellow-500 shadow-glow' : 'bg-slate-200 dark:bg-slate-700'}`}>
                            <Avatar src={leftP.avatar} seed={leftP.uid} size="md" className="border-2 border-white dark:border-slate-800" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-base font-black text-slate-900 dark:text-white leading-tight">You</span>
                            <span className="text-lg font-black text-slate-700 dark:text-slate-300 leading-none flex items-center gap-1"><i className="fas fa-bolt text-orange-500 text-xs"></i> {leftScore}</span>
                        </div>
                    </div>
                    
                    {/* VS */}
                    <div className="flex flex-col items-center">
                        <div className="text-xl font-black text-slate-300 dark:text-slate-700 italic">VS</div>
                        <div className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[9px] font-black">{match!.currentQ + 1}/{questions.length}</div>
                    </div>

                    {/* Opponent */}
                    <div className={`flex flex-row-reverse items-center gap-3 transition-all ${activeRight ? 'scale-100 opacity-100' : 'scale-95 opacity-80 grayscale-[0.3]'}`}>
                        <div className={`p-[3px] rounded-full relative z-10 ${activeRight ? 'bg-gradient-to-r from-blue-500 to-indigo-500 shadow-glow' : 'bg-slate-200 dark:bg-slate-700'}`}>
                            <Avatar src={rightP.avatar} seed={rightP.uid} size="md" className="border-2 border-white dark:border-slate-800" />
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-base font-black text-slate-900 dark:text-white leading-tight truncate w-20 text-right">{rightP.name}</span>
                            <span className="text-lg font-black text-slate-700 dark:text-slate-300 leading-none flex items-center gap-1">{rightScore} <i className="fas fa-bolt text-blue-500 text-xs"></i></span>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* 1v1 Options Grid */}
            <div className="relative w-full grid grid-cols-1 gap-3 mt-6">
                 {questions[match!.currentQ].options.map((opt, idx) => {
                    let bgClass = "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200";
                    if (match!.turn !== user?.uid && !isSpectator) bgClass = "bg-slate-50 dark:bg-slate-800/50 border-transparent text-slate-400 blur-[2px] opacity-60 grayscale pointer-events-none";
                    
                    if (showFeedback) {
                        if (idx === showFeedback.answer) bgClass = "bg-green-500 text-white border-green-500 shadow-glow scale-[1.02]";
                        else if (selectedOption === idx) bgClass = "bg-red-500 text-white border-red-500 shadow-glow scale-[1.02]";
                        else bgClass = "opacity-50 grayscale blur-[1px] scale-95";
                    }

                    return (
                        <button key={idx} disabled={match!.turn !== user?.uid || selectedOption !== null} onClick={() => handleOptionClick1v1(idx)} 
                            className={`w-full p-4 rounded-2xl text-left transition-all duration-200 flex items-center gap-4 border-2 shadow-sm ${bgClass}`}
                        >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0 bg-slate-50 dark:bg-slate-700 text-slate-400 ${showFeedback ? 'bg-white/20 text-white' : ''}`}>
                                {String.fromCharCode(65 + idx)}
                            </div>
                            <span className="font-bold text-base leading-tight flex-1">{opt}</span>
                        </button>
                    );
                })}
            </div>
          </>
      );
  };

  const render4PLayout = () => {
      // 4P layout logic
      const allPIds = Object.keys(match!.players || {});
      const opponents = allPIds.filter(id => id !== user?.uid);
      const myScore = match!.scores?.[user!.uid] || 0;

      return (
          <div className="flex flex-col h-full w-full">
              {/* Top Opponents Bar */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                  {opponents.map(uid => {
                      const p = playersMap[uid] || { name: 'Player', avatar: '', uid };
                      const score = match!.scores?.[uid] || 0;
                      const hasAnswered = match!.currentAnswers?.[uid];
                      
                      return (
                          <div key={uid} className="flex flex-col items-center bg-white/50 dark:bg-slate-800/50 rounded-xl p-2 backdrop-blur-sm border border-white/20 relative">
                              <div className="relative">
                                  <Avatar src={p.avatar} size="sm" className="mb-1" />
                                  {hasAnswered && <div className="absolute -bottom-1 -right-1 bg-green-500 text-white w-4 h-4 rounded-full flex items-center justify-center text-[8px] border border-white"><i className="fas fa-check"></i></div>}
                              </div>
                              <span className="text-[10px] font-bold text-slate-800 dark:text-white truncate w-full text-center">{p.name}</span>
                              <span className="text-xs font-black text-game-primary">{score}</span>
                          </div>
                      );
                  })}
              </div>

              {/* My Status Bar */}
              <div className="flex items-center justify-between bg-slate-900 text-white rounded-2xl p-3 mb-6 shadow-lg">
                  <div className="flex items-center gap-3">
                      <Avatar src={profile?.avatar} seed={user?.uid} size="sm" className="border-2 border-white" />
                      <div>
                          <div className="text-xs font-bold opacity-80">MY SCORE</div>
                          <div className="text-xl font-black text-yellow-400">{myScore}</div>
                      </div>
                  </div>
                  <div className="text-right">
                      <div className="text-xs font-bold opacity-80">QUESTION</div>
                      <div className="text-xl font-black">{match!.currentQ + 1} <span className="text-sm opacity-50">/ {questions.length}</span></div>
                  </div>
              </div>

              {/* Question Card */}
              <div className={`relative w-full bg-slate-100 dark:bg-slate-800 rounded-[1.5rem] p-6 shadow-xl mb-4 min-h-[140px] flex flex-col items-center justify-center text-center border-t-4 border-purple-500`}>
                 <h2 className="relative z-10 text-lg md:text-xl font-black text-[#2c3e50] dark:text-white leading-snug drop-shadow-sm">
                    {questions[match!.currentQ]?.question}
                 </h2>
              </div>

              {/* Options */}
              <div className="grid grid-cols-2 gap-3">
                  {questions[match!.currentQ]?.options.map((opt, idx) => {
                      let bgClass = "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-purple-500";
                      
                      if (showFeedback) {
                          if (idx === showFeedback.answer) bgClass = "bg-green-500 text-white border-green-500 scale-105 shadow-lg";
                          else if (selectedOption === idx) bgClass = "bg-red-500 text-white border-red-500 scale-95 opacity-80";
                          else bgClass = "opacity-40 grayscale scale-95";
                      } else if (selectedOption !== null) {
                          bgClass = "opacity-50 pointer-events-none"; // Waiting for others
                      }

                      return (
                          <button key={idx} disabled={selectedOption !== null} onClick={() => handleOptionClick4P(idx)} 
                              className={`p-3 rounded-xl font-bold text-sm text-left border-2 transition-all duration-200 h-24 flex items-center justify-center text-center shadow-sm ${bgClass}`}
                          >
                              {opt}
                          </button>
                      );
                  })}
              </div>
              
              {/* Waiting Indicator if I answered */}
              {selectedOption !== null && !showFeedback && (
                  <div className="mt-4 text-center text-xs font-bold text-slate-400 animate-pulse uppercase tracking-widest">
                      Waiting for opponents...
                  </div>
              )}
          </div>
      );
  };

  const renderPodium = () => {
      const players = Object.keys(match!.players || {});
      const ranked = players.sort((a, b) => {
          const scoreA = match!.scores?.[a] || 0;
          const scoreB = match!.scores?.[b] || 0;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return (match!.totalResponseTime?.[a] || 0) - (match!.totalResponseTime?.[b] || 0);
      });

      return (
          <div className="w-full max-w-lg animate__animated animate__zoomIn">
              <Card className="!p-0 overflow-hidden border-none shadow-[0_20px_50px_rgba(0,0,0,0.2)] bg-white dark:bg-slate-800 rounded-[2.5rem]">
                  <div className="bg-gradient-to-br from-purple-600 to-indigo-900 p-8 text-center relative overflow-hidden">
                      <div className="relative z-10">
                          <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter mb-2">SQUAD RANKING</h1>
                          <p className="text-purple-200 text-xs font-bold uppercase tracking-widest">Final Standings</p>
                      </div>
                  </div>
                  
                  <div className="p-6">
                      <div className="flex justify-center items-end gap-4 mb-8 h-48">
                          {/* 2nd Place */}
                          {ranked[1] && (
                              <div className="flex flex-col items-center animate__animated animate__fadeInUp animate__delay-1s">
                                  <Avatar src={playersMap[ranked[1]]?.avatar} size="md" className="border-4 border-slate-300 mb-2" />
                                  <div className="bg-slate-200 dark:bg-slate-700 w-20 h-24 rounded-t-lg flex flex-col items-center justify-end pb-2">
                                      <span className="text-2xl font-black text-slate-400">2</span>
                                  </div>
                                  <span className="font-bold text-xs mt-1 truncate w-20 text-center">{playersMap[ranked[1]]?.name}</span>
                                  <span className="text-[10px] font-black text-slate-400">{match!.scores?.[ranked[1]] || 0} PTS</span>
                              </div>
                          )}
                          
                          {/* 1st Place */}
                          {ranked[0] && (
                              <div className="flex flex-col items-center z-10 animate__animated animate__fadeInUp">
                                  <div className="relative">
                                      <i className="fas fa-crown text-yellow-400 text-3xl absolute -top-6 left-1/2 -translate-x-1/2 animate-bounce"></i>
                                      <Avatar src={playersMap[ranked[0]]?.avatar} size="lg" className="border-4 border-yellow-400 mb-2" />
                                  </div>
                                  <div className="bg-yellow-100 dark:bg-yellow-900/50 w-24 h-32 rounded-t-lg flex flex-col items-center justify-end pb-2 border-t-4 border-yellow-400">
                                      <span className="text-4xl font-black text-yellow-500">1</span>
                                  </div>
                                  <span className="font-bold text-sm mt-1 truncate w-24 text-center text-game-primary">{playersMap[ranked[0]]?.name}</span>
                                  <span className="text-xs font-black text-slate-800 dark:text-white">{match!.scores?.[ranked[0]] || 0} PTS</span>
                              </div>
                          )}

                          {/* 3rd Place */}
                          {ranked[2] && (
                              <div className="flex flex-col items-center animate__animated animate__fadeInUp animate__delay-2s">
                                  <Avatar src={playersMap[ranked[2]]?.avatar} size="md" className="border-4 border-orange-300 mb-2" />
                                  <div className="bg-orange-50 dark:bg-orange-900/30 w-20 h-16 rounded-t-lg flex flex-col items-center justify-end pb-2">
                                      <span className="text-2xl font-black text-orange-400">3</span>
                                  </div>
                                  <span className="font-bold text-xs mt-1 truncate w-20 text-center">{playersMap[ranked[2]]?.name}</span>
                                  <span className="text-[10px] font-black text-slate-400">{match!.scores?.[ranked[2]] || 0} PTS</span>
                              </div>
                          )}
                      </div>

                      <Button onClick={handleLeave} size="lg" fullWidth className="py-4 shadow-xl !rounded-2xl">
                          CONTINUE
                      </Button>
                  </div>
              </Card>
          </div>
      );
  };

  // --- MAIN RENDER ---
  if (!match || !user || isLoadingError || (!questions.length && !match.winner && !showIntro && !showCountdown && !isSpectator)) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-bold">{isLoadingError ? "Error Loading" : "Loading Arena..."}</div>;
  }

  const isGameOver = match.status === 'completed';
  const is4P = match.mode === '4p';

  return (
    <div className="min-h-screen relative flex flex-col font-sans overflow-y-auto transition-colors pt-4 pb-20">
      
      {/* Intro Animation */}
      {showIntro && !isSpectator && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900">
              <div className="text-center animate__animated animate__zoomIn">
                  <h1 className="text-6xl font-black text-white italic tracking-tighter mb-4">{is4P ? 'SQUAD BATTLE' : 'DUEL START'}</h1>
                  <div className="flex justify-center gap-4">
                      {Object.keys(match.players).slice(0,4).map((uid, i) => (
                          <Avatar key={uid} src={playersMap[uid]?.avatar} size="lg" className="border-4 border-white animate__animated animate__fadeInUp" style={{animationDelay: `${i*0.2}s`}} />
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* Countdown */}
      {showCountdown && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="text-[150px] font-black text-white drop-shadow-lg animate__animated animate__zoomIn animate__faster key={countdownValue}">
                  {countdownValue === 0 ? 'GO!' : countdownValue}
              </div>
          </div>
      )}

      {/* Turn Alert (1v1) */}
      {showTurnAlert && !is4P && (
        <div className="fixed top-24 left-0 right-0 z-[70] flex justify-center pointer-events-none">
            <div className="animate-turn-alert bg-gradient-to-r from-orange-500 to-red-600 text-white px-8 py-3 rounded-full shadow-lg border-4 border-white flex items-center gap-3">
                <i className="fas fa-bolt text-yellow-300 animate-pulse text-xl"></i>
                <span className="font-black text-xl uppercase tracking-widest italic">Your Turn!</span>
            </div>
        </div>
      )}

      {/* Reactions Overlay */}
      {activeReactions.map(r => (
          <div key={r.id} className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[100] animate__animated animate__bounceIn" style={{ marginLeft: `${(Math.random()-0.5)*200}px`, marginTop: `${(Math.random()-0.5)*200}px` }}>
              <div className="text-6xl drop-shadow-lg">{r.value}</div>
          </div>
      ))}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-3xl mx-auto z-10">
          {isGameOver ? (
              is4P ? renderPodium() : (
                  /* Existing 1v1 Result Card reused or refactored here, omitted for brevity, using simple fallback for now or existing implementation if needed */
                  <Card className="text-center p-10">
                      <h1 className="text-4xl font-black mb-4">{match.winner === user.uid ? 'VICTORY' : 'DEFEAT'}</h1>
                      <Button onClick={handleLeave}>Continue</Button>
                  </Card>
              )
          ) : (
              is4P ? render4PLayout() : render1v1Layout()
          )}
      </div>

      {/* Controls (Reaction / PTT) */}
      {!isGameOver && !showIntro && !showCountdown && (
          <div className="fixed bottom-6 w-full px-6 flex justify-between items-end pointer-events-none">
               <button onClick={() => setShowReactionMenu(!showReactionMenu)} className="w-14 h-14 rounded-full bg-white shadow-xl border-4 border-orange-500 text-2xl flex items-center justify-center pointer-events-auto hover:scale-110 transition-transform">
                   <i className="fas fa-smile text-orange-500"></i>
               </button>
               
               {/* Reaction Menu */}
               {showReactionMenu && (
                   <div className="absolute bottom-24 left-6 bg-white rounded-3xl p-4 shadow-2xl border-2 border-slate-100 pointer-events-auto w-64 animate__animated animate__bounceIn">
                       <div className="grid grid-cols-4 gap-2 mb-3">
                           {reactionEmojis.map(e => <button key={e} onClick={() => sendReaction(e)} className="text-2xl hover:scale-125 transition-transform">{e}</button>)}
                       </div>
                       <div className="space-y-2">
                           {reactionMessages.map(m => <button key={m} onClick={() => sendReaction(m)} className="w-full text-left text-xs font-bold bg-slate-100 p-2 rounded-lg hover:bg-orange-100">{m}</button>)}
                       </div>
                   </div>
               )}
          </div>
      )}
    </div>
  );
};

export default GamePage;
