
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import { Button, Card } from '../components/UI';
import { playSound } from '../services/audioService';
import { showToast } from '../services/alert';
import { Question, Subject, Chapter } from '../types';

// Utility to shuffle array
const shuffleArray = <T,>(array: T[]): T[] => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
};

const SoloPage: React.FC = () => {
  const navigate = useNavigate();
  
  // State for Flow: 'subject' -> 'chapter' -> 'game'
  const [step, setStep] = useState<'subject' | 'chapter' | 'game'>('subject');
  
  // Data State
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  
  // Selection State
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string>('');

  // Game State
  const [loading, setLoading] = useState(true);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  // 1. Fetch Subjects on Load
  useEffect(() => {
    // Cache Check
    const cachedSubjects = localStorage.getItem('subjects_cache');
    if (cachedSubjects) setSubjects(JSON.parse(cachedSubjects));

    const subRef = ref(db, 'subjects');
    const unsub = onValue(subRef, (snapshot) => {
        if (snapshot.exists()) {
            const list = (Object.values(snapshot.val()) as Subject[]).filter(s => s && s.id && s.name);
            setSubjects(list);
            localStorage.setItem('subjects_cache', JSON.stringify(list));
        }
        setLoading(false);
    });
    return () => off(subRef);
  }, []);

  // 2. Fetch Chapters when Subject Selected
  const handleSelectSubject = async (sub: Subject) => {
      setLoading(true);
      playSound('click');
      setSelectedSubject(sub);
      
      const chapRef = ref(db, `chapters/${sub.id}`);
      const snapshot = await get(chapRef);
      if (snapshot.exists()) {
          const loadedChapters = Object.values(snapshot.val()) as Chapter[];
          
          // Add All Chapters Option
          const allOption: Chapter = {
              id: `ALL_${sub.id}`,
              name: 'All chapters',
              subjectId: sub.id
          };
          
          setChapters([allOption, ...loadedChapters]);
          setSelectedChapterId(allOption.id); // Default to All
          setStep('chapter');
      } else {
          showToast("No chapters found for this subject.", "info");
      }
      setLoading(false);
  };

  // 3. Start Game
  const handleStartGame = async () => {
      if (!selectedChapterId) return;
      setLoading(true);
      playSound('click');

      let loadedQ: Question[] = [];
      const cacheKey = `questions_cache_${selectedChapterId}`;

      // Check Cache First (skip for ALL_ mode for more randomness, or could cache that too but risky size)
      if (!selectedChapterId.startsWith('ALL_')) {
          const cached = localStorage.getItem(cacheKey);
          if(cached) {
              try { loadedQ = JSON.parse(cached); } catch(e){}
          }
      }

      if (loadedQ.length === 0) {
          if (selectedChapterId.startsWith('ALL_')) {
              // Fetch from ALL chapters
              const realChapters = chapters.filter(c => !c.id.startsWith('ALL_'));
              const promises = realChapters.map(c => get(ref(db, `questions/${c.id}`)));
              const snapshots = await Promise.all(promises);
              snapshots.forEach(snap => {
                  if (snap.exists()) {
                      loadedQ.push(...(Object.values(snap.val()) as Question[]));
                  }
              });
          } else {
              // Fetch specific chapter
              const qRef = ref(db, `questions/${selectedChapterId}`);
              const snapshot = await get(qRef);
              if (snapshot.exists()) {
                  loadedQ = Object.values(snapshot.val()) as Question[];
                  // Update Cache
                  localStorage.setItem(cacheKey, JSON.stringify(loadedQ));
              }
          }
      }

      if (loadedQ.length > 0) {
          // 1. Shuffle Questions
          let shuffledQ = shuffleArray(loadedQ);

          // 2. Shuffle Options for each question
          shuffledQ = shuffledQ.map(q => {
              const optionsWithIndex = q.options.map((opt, idx) => ({ 
                  text: opt, 
                  isCorrect: idx === q.answer 
              }));
              const shuffledOptions = shuffleArray(optionsWithIndex);
              return {
                  ...q,
                  options: shuffledOptions.map(o => o.text),
                  answer: shuffledOptions.findIndex(o => o.isCorrect)
              };
          });

          // 3. Random Limit (10-20)
          const randomLimit = Math.floor(Math.random() * 11) + 10;
          if (shuffledQ.length > randomLimit) {
              shuffledQ = shuffledQ.slice(0, randomLimit);
          }

          setQuestions(shuffledQ);
          setStep('game');
      } else {
          showToast("No questions found.", "warning");
      }
      setLoading(false);
  };

  const handleAnswer = (index: number) => {
    if (selected !== null) return;
    
    const currentQ = questions[currentQIndex];
    setSelected(index);
    if (index === currentQ.answer) {
      playSound('correct');
      setFeedback('correct');
      setScore(s => s + 1);
    } else {
      playSound('wrong');
      setFeedback('wrong');
    }

    setTimeout(() => {
      if (currentQIndex + 1 < questions.length) {
        setCurrentQIndex(currentQIndex + 1);
        setSelected(null);
        setFeedback(null);
      } else {
        setFinished(true);
        playSound('win');
      }
    }, 1200);
  };

  // --- Render Selection Screens ---

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-800 dark:text-white font-bold animate-pulse">Loading Content...</div>;
  }

  // STEP 1: Select Subject
  if (step === 'subject') {
      return (
          <div className="min-h-full p-4 pt-20 max-w-4xl mx-auto w-full">
              <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 shadow-sm flex items-center gap-4 px-4 py-3 transition-colors duration-300">
                  <button onClick={() => navigate('/')} className="text-gray-600 dark:text-gray-300 hover:text-game-primary dark:hover:text-blue-400 transition-colors">
                    <i className="fas fa-arrow-left fa-lg"></i>
                  </button>
                  <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">Select Subject</h1>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {subjects.length === 0 && <div className="text-gray-500 text-center mt-10">No subjects available.</div>}
                  {subjects.map(sub => (
                      <Card key={sub.id} className="cursor-pointer hover:scale-105 transition-transform border-l-4 border-game-primary group">
                          <div onClick={() => handleSelectSubject(sub)} className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-game-primary dark:text-indigo-300 group-hover:bg-game-primary group-hover:text-white transition-colors">
                                      <i className="fas fa-book"></i>
                                  </div>
                                  <span className="font-bold text-lg text-gray-900 dark:text-white">{sub.name}</span>
                              </div>
                              <i className="fas fa-chevron-right text-gray-400 group-hover:translate-x-1 transition-transform"></i>
                          </div>
                      </Card>
                  ))}
              </div>
              <div className="mt-8 text-center animate__animated animate__fadeInUp">
                  <p className="inline-block px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-900/20 text-game-primary dark:text-blue-300 text-xs font-bold border border-blue-100 dark:border-blue-800/50">
                      <i className="fas fa-bullhorn mr-2"></i> More subjects will be added soon!
                  </p>
              </div>
          </div>
      );
  }

  // STEP 2: Select Chapter (Dropdown)
  if (step === 'chapter') {
      return (
          <div className="min-h-full p-4 pt-20 max-w-4xl mx-auto w-full">
              <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 shadow-sm flex items-center gap-4 px-4 py-3 transition-colors duration-300">
                  <button onClick={() => setStep('subject')} className="text-gray-600 dark:text-gray-300 hover:text-game-primary dark:hover:text-blue-400 transition-colors">
                    <i className="fas fa-arrow-left fa-lg"></i>
                  </button>
                  <h1 className="text-xl md:text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{selectedSubject?.name}</h1>
              </div>
              
              <Card className="max-w-xl mx-auto">
                  <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600 dark:text-green-400">
                          <i className="fas fa-layer-group text-3xl"></i>
                      </div>
                      <h2 className="text-xl font-bold text-gray-900 dark:text-white">Select Topic</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Choose a chapter to begin your practice.</p>
                  </div>

                  <div className="mb-6">
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Chapter</label>
                      <div className="relative">
                          <select 
                            value={selectedChapterId} 
                            onChange={(e) => setSelectedChapterId(e.target.value)}
                            className="w-full p-4 bg-gray-50 dark:bg-gray-700 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-xl appearance-none font-bold text-gray-700 focus:outline-none focus:border-green-500"
                          >
                              {chapters.map(chap => (
                                  <option key={chap.id} value={chap.id}>{chap.name}</option>
                              ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-700 dark:text-gray-400">
                                <i className="fas fa-chevron-down"></i>
                          </div>
                      </div>
                  </div>

                  <Button fullWidth onClick={handleStartGame} disabled={!selectedChapterId}>
                      <i className="fas fa-play mr-2"></i> Start Practice
                  </Button>
              </Card>
          </div>
      );
  }

  // STEP 3: Game Interface
  const currentQ = questions[currentQIndex];

  return (
    <div className="min-h-full p-6 flex flex-col items-center justify-center text-slate-800 dark:text-white w-full h-full relative overflow-hidden">
      
      <div className="w-full max-w-md relative z-10 pt-20">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => setFinished(true)} className="text-slate-500 dark:text-slate-400 hover:text-red-500 transition-colors bg-white/50 dark:bg-black/20 px-3 py-1 rounded-full text-sm font-bold backdrop-blur-sm border border-slate-200 dark:border-slate-700">
            <i className="fas fa-times mr-2"></i> Quit
          </button>
          <div className="font-bold bg-white/50 dark:bg-black/20 px-3 py-1 rounded-full text-sm backdrop-blur-sm border border-slate-200 dark:border-slate-700">Q {currentQIndex + 1}/{questions.length}</div>
        </div>

        {finished ? (
          <Card className="text-center animate__animated animate__zoomIn !bg-white/95 dark:!bg-slate-800/95 backdrop-blur-xl">
            <h2 className="text-3xl font-black mb-4 text-gray-900 dark:text-white uppercase italic tracking-tight">Training Complete</h2>
            <div className="text-7xl mb-6 animate__animated animate__tada animate__delay-1s">🎯</div>
            <p className="text-xl mb-8 text-gray-800 dark:text-gray-200 font-medium">You scored <span className="text-game-primary dark:text-blue-400 font-black text-3xl">{score}</span> / {questions.length}</p>
            <div className="space-y-3">
                <Button fullWidth onClick={() => navigate('/')}>Back to Home</Button>
                <Button fullWidth variant="secondary" onClick={() => {
                    setFinished(false);
                    setCurrentQIndex(0);
                    setScore(0);
                    setSelected(null);
                }}>Try Again</Button>
            </div>
          </Card>
        ) : (
          <>
             {/* Progress Bar */}
             <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 mb-8 backdrop-blur-sm overflow-hidden">
                <div className="bg-game-primary h-2.5 rounded-full transition-all duration-500 ease-out shadow-lg" style={{ width: `${((currentQIndex)/questions.length)*100}%` }}></div>
             </div>

             {/* Question Card */}
             <div className="bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-[1.5rem] p-6 shadow-2xl text-center mb-6 min-h-[140px] flex items-center justify-center flex-col transition-colors border-2 border-slate-100 dark:border-slate-700 animate__animated animate__fadeIn relative">
                 <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-game-primary to-purple-600"></div>
                 <span className="text-[10px] font-black text-gray-400 uppercase mb-2 tracking-[0.2em]">
                     {selectedSubject?.name}
                 </span>
                 <h2 className="text-lg md:text-xl font-bold leading-relaxed drop-shadow-sm">{currentQ.question}</h2>
             </div>

             {/* Options Grid */}
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                 {currentQ.options.map((opt, idx) => {
                    let btnClasses = "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-game-primary";
                    let circleClasses = "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400";

                    if (selected !== null) {
                        if (idx === currentQ.answer) {
                             btnClasses = "bg-green-500 border-green-600 text-white shadow-lg scale-[1.02]";
                             circleClasses = "bg-white/20 text-white";
                        } else if (idx === selected) {
                             btnClasses = "bg-red-500 border-red-600 text-white opacity-90";
                             circleClasses = "bg-white/20 text-white";
                        } else {
                             btnClasses = "bg-slate-50 dark:bg-slate-900 border-transparent text-slate-400 grayscale opacity-50";
                        }
                    }

                    return (
                        <button
                            key={idx}
                            onClick={() => handleAnswer(idx)}
                            className={`
                                relative min-h-[4rem] h-auto py-3 px-4 rounded-xl font-bold text-base md:text-lg text-left
                                border-2 transition-all duration-200 transform
                                flex items-center gap-3 shadow-sm
                                ${btnClasses}
                            `}
                        >
                             <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shrink-0 transition-colors ${circleClasses}`}>
                                {String.fromCharCode(65 + idx)}
                            </div>
                            <span className="leading-tight">{opt}</span>
                            
                            {selected !== null && idx === currentQ.answer && (
                                <i className="fas fa-check-circle absolute right-4 text-white text-xl animate__animated animate__zoomIn"></i>
                            )}
                             {selected !== null && idx === selected && idx !== currentQ.answer && (
                                <i className="fas fa-times-circle absolute right-4 text-white text-xl animate__animated animate__zoomIn"></i>
                            )}
                        </button>
                    )
                 })}
             </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SoloPage;
