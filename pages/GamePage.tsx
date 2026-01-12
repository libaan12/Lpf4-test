import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, get, serverTimestamp, off, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { MatchState, Question, MatchReaction, UserProfile } from '../types';
import { Avatar, Button, Card, Modal } from '../components/UI';
import { playSound } from '../services/audioService';
import { showToast, showAlert } from '../services/alert';
import confetti from 'canvas-confetti';

interface ReactionDisplay {
  id: number;
  senderId: string;
  value: string;
}

const GamePage: React.FC = () => {
  const { matchId } = useParams();
  const { user } = useContext(UserContext);
  const navigate = useNavigate();

  const [match, setMatch] = useState<MatchState | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Game Play State
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showResult, setShowResult] = useState(false);
  
  // Reactions
  const [activeReactions, setActiveReactions] = useState<ReactionDisplay[]>([]);
  const reactionCounter = useRef(0);
  const [emojis, setEmojis] = useState<{id: string, value: string}[]>([]);
  const [messages, setMessages] = useState<{id: string, value: string}[]>([]);
  const [showReactions, setShowReactions] = useState(false);
  
  // Opponent Info
  const [opponent, setOpponent] = useState<UserProfile | null>(null);

  // Refs for logic
  const matchRef = useRef<MatchState | null>(null);

  useEffect(() => {
    if (!matchId || !user) return;
    
    // 1. Subscribe to Match
    const mRef = ref(db, `matches/${matchId}`);
    const unsubMatch = onValue(mRef, (snapshot) => {
        if (!snapshot.exists()) {
            navigate('/');
            return;
        }
        const val = snapshot.val() as MatchState;
        setMatch(val);
        matchRef.current = val;

        // Check Winner
        if (val.status === 'completed' || val.winner) {
            if (val.winner === user.uid) playSound('win');
        }
    });

    // 2. Fetch Reactions Config
    get(ref(db, 'settings/reactions')).then(snap => {
        if (snap.exists()) {
            const val = snap.val();
            if (val.emojis) setEmojis(Object.entries(val.emojis).map(([k, v]) => ({id: k, value: v as string})));
            if (val.messages) setMessages(Object.entries(val.messages).map(([k, v]) => ({id: k, value: v as string})));
        } else {
            // Defaults
            setEmojis(['😂','😡','👏','😱','🥲','🔥','🏆','🤯'].map((v, i) => ({id: String(i), value: v})));
            setMessages(['Good luck!', 'Nice!', 'Oops!', 'Hurry up!'].map((v, i) => ({id: String(i), value: v})));
        }
    });

    return () => {
        off(mRef);
        unsubMatch();
    };
  }, [matchId, user, navigate]);

  // Effect to handle reaction updates specifically
  useEffect(() => {
      if (match?.lastReaction) {
          // If the reaction is recent (within last 3 seconds)
           if (match.lastReaction.timestamp > Date.now() - 3000) {
               triggerReactionAnimation(match.lastReaction);
           }
      }
  }, [match?.lastReaction]);

  // Effect to load questions once subject is known
  useEffect(() => {
      if (match && match.subject && questions.length === 0) {
          const loadQuestions = async () => {
              let qList: Question[] = [];
              const qRef = ref(db, `questions/${match.subject}`);
              const snap = await get(qRef);
              if (snap.exists()) {
                  const data = snap.val();
                  qList = Object.keys(data).map(k => ({id: k, ...data[k]}));
              }

              // Shuffle
              qList = qList.sort(() => 0.5 - Math.random());
              // Limit
              if (match.questionLimit && qList.length > match.questionLimit) {
                  qList = qList.slice(0, match.questionLimit);
              }
              setQuestions(qList);
              setLoading(false);
          };
          loadQuestions();
      }
  }, [match?.subject]);

  // Effect to identify opponent
  useEffect(() => {
      if (match && user) {
          const oppId = Object.keys(match.players).find(uid => uid !== user.uid);
          if (oppId) {
             const pData = match.players[oppId];
             setOpponent({
                 uid: oppId,
                 name: pData.name,
                 avatar: pData.avatar,
                 points: 0, // Points are in match.scores
                 isOnline: pData.status === 'online'
             } as UserProfile);
          }
      }
  }, [match, user]);

  const triggerReactionAnimation = (reaction: MatchReaction) => {
    const id = ++reactionCounter.current;
    setActiveReactions(prev => {
        // Clear previous reaction from this specific user so the new one replaces it instantly
        const others = prev.filter(r => r.senderId !== reaction.senderId);
        return [...others, { id, senderId: reaction.senderId, value: reaction.value }];
    });
    playSound('reaction');
    setTimeout(() => {
        setActiveReactions(prev => prev.filter(r => r.id !== id));
    }, 4000);
  };

  const sendReaction = (value: string) => {
      if (!matchId || !user) return;
      const reaction: MatchReaction = {
          senderId: user.uid,
          value,
          timestamp: Date.now()
      };
      update(ref(db, `matches/${matchId}`), { lastReaction: reaction });
      setShowReactions(false);
      // Trigger locally immediately for responsiveness
      triggerReactionAnimation(reaction);
  };

  const handleAnswer = async (index: number) => {
      if (hasAnswered || !match || !user || !matchId) return;
      
      const currentQ = questions[match.currentQ];
      if (!currentQ) return;

      const correct = index === currentQ.answer;
      setSelectedAnswer(index);
      setIsCorrect(correct);
      setHasAnswered(true);

      if (correct) {
          playSound('correct');
      } else {
          playSound('wrong');
      }

      await runTransaction(ref(db, `matches/${matchId}`), (currentMatch) => {
          if (currentMatch) {
              if (correct) {
                  if (!currentMatch.scores) currentMatch.scores = {};
                  currentMatch.scores[user.uid] = (currentMatch.scores[user.uid] || 0) + 1;
              }
              
              currentMatch.answersCount = (currentMatch.answersCount || 0) + 1;
              
              // Assuming 2 players for now.
              if (currentMatch.answersCount >= 2) {
                  currentMatch.answersCount = 0;
                  currentMatch.currentQ = (currentMatch.currentQ || 0) + 1;
                  
                  if (currentMatch.currentQ >= (questions.length || 10)) {
                      currentMatch.status = 'completed';
                      const pIds = Object.keys(currentMatch.players);
                      const s1 = currentMatch.scores[pIds[0]] || 0;
                      const s2 = currentMatch.scores[pIds[1]] || 0;
                      if (s1 > s2) currentMatch.winner = pIds[0];
                      else if (s2 > s1) currentMatch.winner = pIds[1];
                      else currentMatch.winner = 'draw';
                  }
              }
          }
          return currentMatch;
      });
  };
  
  useEffect(() => {
      if (match) {
          // Reset when question changes
          setHasAnswered(false);
          setSelectedAnswer(null);
          setIsCorrect(null);
      }
  }, [match?.currentQ]);

  if (match?.status === 'completed' || match?.winner) {
      const myScore = match.scores?.[user?.uid || ''] || 0;
      const oppScore = opponent ? (match.scores?.[opponent.uid] || 0) : 0;
      const won = match.winner === user?.uid;
      const draw = match.winner === 'draw';

      if (won && !showResult) {
          confetti();
          setShowResult(true);
      }

      return (
          <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
              <Card className="text-center p-8 animate__animated animate__zoomIn w-full max-w-lg">
                  <h1 className="text-4xl font-black mb-4 uppercase italic text-game-primary">
                      {won ? 'Victory!' : draw ? 'Draw!' : 'Defeat'}
                  </h1>
                  <div className="flex justify-center items-center gap-8 mb-8">
                      <div className="flex flex-col items-center">
                          <Avatar src={user?.photoURL || undefined} seed={user?.uid} size="lg" className="border-4 border-game-primary" />
                          <span className="font-bold mt-2 text-xl text-slate-800 dark:text-white">{myScore}</span>
                      </div>
                      <div className="text-2xl font-black text-slate-300">VS</div>
                      <div className="flex flex-col items-center">
                          <Avatar src={opponent?.avatar} seed={opponent?.uid} size="lg" className="border-4 border-red-500" />
                          <span className="font-bold mt-2 text-xl text-slate-800 dark:text-white">{oppScore}</span>
                      </div>
                  </div>
                  <Button fullWidth onClick={() => navigate('/')}>Return Home</Button>
              </Card>
          </div>
      );
  }

  if (loading || !match) {
      return <div className="min-h-screen flex items-center justify-center font-bold animate-pulse text-slate-500">Loading Arena...</div>;
  }

  const currentQ = questions[match.currentQ];
  
  if (!currentQ) {
       return (
           <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white">
               <h2 className="text-2xl font-bold mb-2">Next Round</h2>
               <p className="text-slate-500">Preparing next question...</p>
           </div>
       );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-slate-50 dark:bg-slate-900">
        
        {/* Header */}
        <div className="px-4 py-4 flex justify-between items-center bg-white dark:bg-slate-800 shadow-sm z-10">
            <div className="flex items-center gap-3">
                <Avatar src={user?.photoURL || undefined} seed={user?.uid} size="sm" className="border-2 border-game-primary" />
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-400">YOU</span>
                    <span className="text-xl font-black text-game-primary">{match.scores?.[user?.uid || ''] || 0}</span>
                </div>
            </div>

            <div className="flex flex-col items-center">
                <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-500 dark:text-slate-300">
                    ROUND {match.currentQ + 1} / {questions.length}
                </span>
            </div>

            <div className="flex items-center gap-3 text-right">
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-400">{opponent?.name || 'Opponent'}</span>
                    <span className="text-xl font-black text-red-500">{match.scores?.[opponent?.uid || ''] || 0}</span>
                </div>
                <Avatar src={opponent?.avatar} seed={opponent?.uid} size="sm" className="border-2 border-red-500" />
            </div>
        </div>

        {/* Game Area */}
        <div className="flex-1 p-4 flex flex-col justify-center max-w-2xl mx-auto w-full relative">
            
            {/* Reaction Bubbles */}
            {activeReactions.map(r => (
                 <div 
                    key={r.id} 
                    className={`absolute bottom-24 ${r.senderId === user?.uid ? 'right-4' : 'left-4'} animate__animated animate__bounceInUp z-50 pointer-events-none`}
                 >
                     <div className="text-4xl filter drop-shadow-lg">{r.value}</div>
                 </div>
            ))}

            <Card className="mb-6 min-h-[160px] flex items-center justify-center text-center p-6 border-2 border-slate-100 dark:border-slate-700 !bg-white/80 dark:!bg-slate-800/80 backdrop-blur-xl shadow-xl">
                 <h2 className="text-xl md:text-2xl font-bold text-slate-800 dark:text-white leading-relaxed">
                     {currentQ.question}
                 </h2>
            </Card>

            <div className="grid grid-cols-1 gap-3">
                {currentQ.options.map((opt, idx) => {
                    let statusClass = "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200";
                    if (hasAnswered) {
                        if (idx === currentQ.answer) statusClass = "bg-green-500 text-white border-green-600";
                        else if (idx === selectedAnswer) statusClass = "bg-red-500 text-white border-red-600";
                        else statusClass = "opacity-50";
                    }

                    return (
                        <button
                            key={idx}
                            disabled={hasAnswered}
                            onClick={() => handleAnswer(idx)}
                            className={`p-4 rounded-xl border-2 font-bold text-left shadow-sm transition-all transform active:scale-[0.98] ${statusClass}`}
                        >
                            <span className="inline-block w-6 h-6 rounded bg-black/10 text-center text-xs leading-6 mr-3">{String.fromCharCode(65+idx)}</span>
                            {opt}
                        </button>
                    )
                })}
            </div>
            
            {hasAnswered && (
                <div className="text-center mt-4 text-slate-400 font-bold text-sm animate-pulse">
                    Waiting for opponent...
                </div>
            )}
        </div>

        {/* Footer: Reactions Trigger */}
        <div className="p-4 flex justify-center pb-8">
            <button 
                onClick={() => setShowReactions(!showReactions)}
                className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 text-2xl flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
            >
                😎
            </button>
        </div>

        {/* Reaction Picker */}
        {showReactions && (
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl p-4 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 animate__animated animate__slideInUp z-50">
                <div className="grid grid-cols-4 gap-4 mb-4">
                    {emojis.map(e => (
                        <button key={e.id} onClick={() => sendReaction(e.value)} className="text-3xl hover:scale-125 transition-transform">{e.value}</button>
                    ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    {messages.map(m => (
                        <button key={m.id} onClick={() => sendReaction(m.value)} className="bg-slate-100 dark:bg-slate-700 py-2 rounded-lg text-xs font-bold truncate hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300">{m.value}</button>
                    ))}
                </div>
                <button onClick={() => setShowReactions(false)} className="absolute -top-3 -right-3 w-8 h-8 bg-red-500 text-white rounded-full text-xs shadow-md"><i className="fas fa-times"></i></button>
            </div>
        )}
    </div>
  );
};

export default GamePage;
