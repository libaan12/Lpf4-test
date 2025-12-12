import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import { Button, Card } from '../components/UI';
import { playSound } from '../services/audioService';
import { Question, Subject, Chapter } from '../types';

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
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);

  // Game State
  const [loading, setLoading] = useState(true);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

  // 1. Fetch Subjects on Load
  useEffect(() => {
    const subRef = ref(db, 'subjects');
    const unsub = onValue(subRef, (snapshot) => {
        if (snapshot.exists()) {
            setSubjects(Object.values(snapshot.val()));
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
          setChapters(Object.values(snapshot.val()));
          setStep('chapter');
      } else {
          alert("No chapters found for this subject.");
      }
      setLoading(false);
  };

  // 3. Fetch Questions when Chapter Selected
  const handleSelectChapter = async (chap: Chapter) => {
      setLoading(true);
      playSound('click');
      setSelectedChapter(chap);

      const qRef = ref(db, `questions/${chap.id}`);
      const snapshot = await get(qRef);
      if (snapshot.exists()) {
          const qList = Object.values(snapshot.val()) as Question[];
          if (qList.length > 0) {
              setQuestions(qList);
              setStep('game');
          } else {
              alert("No questions in this chapter yet.");
          }
      } else {
          alert("No questions found.");
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
    return <div className="min-h-screen bg-somali-blue flex items-center justify-center text-white font-bold animate-pulse">Loading...</div>;
  }

  // STEP 1: Select Subject
  if (step === 'subject') {
      return (
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
              <div className="flex items-center gap-4 mb-6">
                  <button onClick={() => navigate('/')} className="text-gray-600 dark:text-gray-300"><i className="fas fa-arrow-left fa-lg"></i></button>
                  <h1 className="text-2xl font-bold dark:text-white">Select Subject</h1>
              </div>
              <div className="grid grid-cols-1 gap-4">
                  {subjects.length === 0 && <div className="text-gray-500 text-center mt-10">No subjects available.</div>}
                  {subjects.map(sub => (
                      <Card key={sub.id} className="cursor-pointer hover:scale-105 transition-transform border-l-4 border-somali-blue">
                          <div onClick={() => handleSelectSubject(sub)} className="flex justify-between items-center">
                              <span className="font-bold text-lg">{sub.name}</span>
                              <i className="fas fa-chevron-right text-gray-400"></i>
                          </div>
                      </Card>
                  ))}
              </div>
          </div>
      );
  }

  // STEP 2: Select Chapter
  if (step === 'chapter') {
      return (
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
              <div className="flex items-center gap-4 mb-6">
                  <button onClick={() => setStep('subject')} className="text-gray-600 dark:text-gray-300"><i className="fas fa-arrow-left fa-lg"></i></button>
                  <h1 className="text-2xl font-bold dark:text-white">{selectedSubject?.name}</h1>
              </div>
              <p className="mb-4 text-gray-500 dark:text-gray-400">Select a topic to start practicing:</p>
              <div className="grid grid-cols-1 gap-4">
                  {chapters.map(chap => (
                      <Card key={chap.id} className="cursor-pointer hover:scale-105 transition-transform border-l-4 border-green-500">
                          <div onClick={() => handleSelectChapter(chap)} className="flex justify-between items-center">
                              <span className="font-bold text-lg">{chap.name}</span>
                              <i className="fas fa-play text-green-500"></i>
                          </div>
                      </Card>
                  ))}
              </div>
          </div>
      );
  }

  // STEP 3: Game Interface
  const currentQ = questions[currentQIndex];

  return (
    <div className="min-h-screen bg-somali-blue p-6 flex flex-col items-center justify-center text-white">
      <div className="w-full max-w-md">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => setFinished(true)} className="text-white/80 hover:text-white">
            <i className="fas fa-times fa-lg"></i> Quit
          </button>
          <div className="font-bold">Q {currentQIndex + 1}/{questions.length}</div>
        </div>

        {finished ? (
          <Card className="text-center text-gray-800 animate__animated animate__zoomIn">
            <h2 className="text-3xl font-bold mb-4">Training Complete</h2>
            <div className="text-6xl mb-4">🎯</div>
            <p className="text-xl mb-6">You got <span className="text-somali-blue font-bold">{score}</span> out of {questions.length}</p>
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

             <div className="bg-white text-gray-900 rounded-2xl p-8 shadow-2xl text-center mb-6 min-h-[150px] flex items-center justify-center flex-col">
                 <span className="text-xs font-bold text-gray-400 uppercase mb-2 tracking-widest">{selectedChapter?.name}</span>
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