import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import { Button, Card } from '../components/UI';
import { playSound } from '../services/audioService';
import { Question, Subject, Chapter } from '../types';
import Swal from 'sweetalert2';

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

  const showToast = (msg: string, icon: 'info'|'warning'|'error') => {
      const isDark = document.documentElement.classList.contains('dark');
      Swal.fire({
          icon,
          title: msg,
          toast: true,
          position: 'top',
          showConfirmButton: false,
          timer: 3000,
          background: isDark ? '#1f2937' : '#fff',
          color: isDark ? '#fff' : '#000',
      });
  };

  // 2. Fetch Chapters when Subject Selected
  const handleSelectSubject = async (sub: Subject) => {
      setLoading(true);
      playSound('click');
      setSelectedSubject(sub);
      
      const chapRef = ref(db, `chapters/${sub.id}`);
      const snapshot = await get(chapRef);
      if (snapshot.exists()) {
          const loadedChapters = Object.values(snapshot.val()) as Chapter[];
          setChapters(loadedChapters);
          if (loadedChapters.length > 0) {
              setSelectedChapterId(loadedChapters[0].id); // Default to first
          }
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

      const qRef = ref(db, `questions/${selectedChapterId}`);
      const snapshot = await get(qRef);
      if (snapshot.exists()) {
          const qList = Object.values(snapshot.val()) as Question[];
          if (qList.length > 0) {
              setQuestions(qList);
              setStep('game');
          } else {
              showToast("No questions in this chapter yet.", "warning");
          }
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
    return <div className="min-h-screen bg-somali-blue flex items-center justify-center text-white font-bold animate-pulse">Loading Content...</div>;
  }

  // STEP 1: Select Subject
  if (step === 'subject') {
      return (
          <div className="min-h-full bg-gray-50 dark:bg-gray-900 p-4 max-w-4xl mx-auto w-full">
              <div className="sticky top-0 z-30 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-md -mx-4 px-4 py-3 mb-6 border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm flex items-center gap-4 transition-colors">
                  <button onClick={() => navigate('/')} className="text-gray-600 dark:text-gray-300 hover:text-somali-blue dark:hover:text-blue-400 transition-colors">
                    <i className="fas fa-arrow-left fa-lg"></i>
                  </button>
                  <h1 className="text-2xl font-bold dark:text-white">Select Subject</h1>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {subjects.length === 0 && <div className="text-gray-500 text-center mt-10">No subjects available.</div>}
                  {subjects.map(sub => (
                      <Card key={sub.id} className="cursor-pointer hover:scale-105 transition-transform border-l-4 border-somali-blue group">
                          <div onClick={() => handleSelectSubject(sub)} className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-somali-blue dark:text-blue-300 group-hover:bg-somali-blue group-hover:text-white transition-colors">
                                      <i className="fas fa-book"></i>
                                  </div>
                                  <span className="font-bold text-lg dark:text-white">{sub.name}</span>
                              </div>
                              <i className="fas fa-chevron-right text-gray-400 group-hover:translate-x-1 transition-transform"></i>
                          </div>
                      </Card>
                  ))}
              </div>
          </div>
      );
  }

  // STEP 2: Select Chapter (Dropdown)
  if (step === 'chapter') {
      return (
          <div className="min-h-full bg-gray-50 dark:bg-gray-900 p-4 max-w-4xl mx-auto w-full">
              <div className="sticky top-0 z-30 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-md -mx-4 px-4 py-3 mb-6 border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm flex items-center gap-4 transition-colors">
                  <button onClick={() => setStep('subject')} className="text-gray-600 dark:text-gray-300 hover:text-somali-blue dark:hover:text-blue-400 transition-colors">
                    <i className="fas fa-arrow-left fa-lg"></i>
                  </button>
                  <h1 className="text-2xl font-bold dark:text-white">{selectedSubject?.name}</h1>
              </div>
              
              <Card className="max-w-xl mx-auto">
                  <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600 dark:text-green-400">
                          <i className="fas fa-layer-group text-3xl"></i>
                      </div>
                      <h2 className="text-xl font-bold dark:text-white">Select Topic</h2>
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
    <div className="min-h-full bg-somali-blue p-6 flex flex-col items-center justify-center text-white w-full h-full">
      <div className="w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => setFinished(true)} className="text-white/80 hover:text-white">
            <i className="fas fa-times fa-lg"></i> Quit
          </button>
          <div className="font-bold">Q {currentQIndex + 1}/{questions.length}</div>
        </div>

        {finished ? (
          // Fixed text color here by removing text-gray-800
          <Card className="text-center animate__animated animate__zoomIn">
            <h2 className="text-3xl font-bold mb-4">Training Complete</h2>
            <div className="text-6xl mb-4">🎯</div>
            <p className="text-xl mb-6">You got <span className="text-somali-blue dark:text-blue-400 font-bold">{score}</span> out of {questions.length}</p>
            <Button fullWidth onClick={() => navigate('/')}>Back to Home</Button>
            <Button fullWidth variant="secondary" className="mt-3" onClick={() => {
                setFinished(false);
                setCurrentQIndex(0);
                setScore(0);
                setSelected(null);
            }}>Try Again</Button>
          </Card>
        ) : (
          <>
             {/* Progress Bar */}
             <div className="w-full bg-blue-800 rounded-full h-2 mb-8">
                <div className="bg-white h-2 rounded-full transition-all duration-300" style={{ width: `${((currentQIndex)/questions.length)*100}%` }}></div>
             </div>

             {/* Updated Question Card to be compatible with dark mode preference */}
             <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl p-8 shadow-2xl text-center mb-6 min-h-[150px] flex items-center justify-center flex-col transition-colors">
                 <span className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-widest">{selectedChapterId && chapters.find(c => c.id === selectedChapterId)?.name}</span>
                 <h2 className="text-xl font-bold">{currentQ.question}</h2>
             </div>

             <div className="space-y-3">
                 {currentQ.options.map((opt, idx) => {
                    let bg = "bg-white/20 text-white hover:bg-white/30 border border-white/30";
                    if (selected !== null) {
                        if (idx === currentQ.answer) bg = "bg-green-500 border-green-500";
                        else if (idx === selected) bg = "bg-red-500 border-red-500";
                        else bg = "bg-white/10 opacity-50";
                    }

                    return (
                        <button
                            key={idx}
                            onClick={() => handleAnswer(idx)}
                            className={`w-full py-4 rounded-xl font-bold transition-all ${bg}`}
                        >
                            {opt}
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