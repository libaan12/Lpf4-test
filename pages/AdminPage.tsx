import React, { useState, useEffect } from 'react';
import { ref, push, set, get, remove, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import { Button, Input, Card, Modal } from '../components/UI';
import { Question, Subject, Chapter } from '../types';
import { useNavigate } from 'react-router-dom';

const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  
  // Selection State
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');

  // Data State
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  
  // Form State
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '', '']); // Dynamic array
  const [correctAnswer, setCorrectAnswer] = useState(0);
  const [loading, setLoading] = useState(false);

  // Modals
  const [modalType, setModalType] = useState<'subject' | 'chapter' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemId, setNewItemId] = useState('');

  // 1. Fetch Subjects
  useEffect(() => {
    const subRef = ref(db, 'subjects');
    const unsub = onValue(subRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const list = Object.values(data) as Subject[];
            setSubjects(list);
            // Default select first if none selected
            if (!selectedSubject && list.length > 0) {
                setSelectedSubject(list[0].id);
            }
        } else {
            // Seed initial subject
            const initSub = { id: 'math', name: 'Mathematics' };
            set(ref(db, 'subjects/math'), initSub);
        }
    });
    return () => off(subRef);
  }, []); // Run once on mount

  // 2. Fetch Chapters when Subject changes
  useEffect(() => {
    if (!selectedSubject) {
        setChapters([]);
        return;
    }
    
    const chapRef = ref(db, `chapters/${selectedSubject}`);
    const unsub = onValue(chapRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const list = Object.values(data) as Chapter[];
            setChapters(list);
            if (list.length > 0) {
                if (!list.find(c => c.id === selectedChapter)) {
                    setSelectedChapter(list[0].id);
                }
            } else {
                setSelectedChapter('');
            }
        } else {
            setChapters([]);
            setSelectedChapter('');
        }
    });
    return () => off(chapRef);
  }, [selectedSubject]);

  // 3. Fetch Questions when Chapter changes
  useEffect(() => {
      fetchQuestions();
  }, [selectedChapter]);

  const fetchQuestions = async () => {
    if (!selectedChapter) {
        setQuestions([]);
        return;
    }
    const qRef = ref(db, `questions/${selectedChapter}`);
    const snapshot = await get(qRef);
    if (snapshot.exists()) {
      const data = snapshot.val();
      const list = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
      setQuestions(list);
    } else {
      setQuestions([]);
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  const handleAddOption = () => {
      if(options.length >= 6) return; // Max 6
      setOptions([...options, '']);
  };

  const handleRemoveOption = (index: number) => {
      if (options.length <= 2) {
          alert("A question must have at least 2 options.");
          return;
      }
      
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
      
      // Adjust correct answer index if necessary
      if (correctAnswer === index) {
          setCorrectAnswer(0); // Reset to first if deleted was correct
      } else if (correctAnswer > index) {
          setCorrectAnswer(correctAnswer - 1); // Shift down
      }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChapter) {
        alert("Please create and select a Chapter first.");
        return;
    }
    if (options.some(opt => !opt.trim()) || !questionText.trim()) {
      alert("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      const questionsRef = ref(db, `questions/${selectedChapter}`);
      const newQRef = push(questionsRef);
      
      await set(newQRef, {
        question: questionText,
        options,
        answer: correctAnswer,
        subject: selectedChapter,
        createdAt: Date.now()
      });

      // Reset form
      setQuestionText('');
      setOptions(['', '', '', '']);
      setCorrectAnswer(0);
      fetchQuestions();
      alert('Question added successfully!');
    } catch (error) {
      console.error("Error adding question:", error);
      alert("Failed to add question");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteQuestion = async (id: string | number) => {
    if(!window.confirm("Are you sure you want to delete this question?")) return;
    try {
      await remove(ref(db, `questions/${selectedChapter}/${id}`));
      fetchQuestions();
    } catch(e) {
      console.error(e);
    }
  };

  const handleCreateItem = async () => {
      if (!newItemName.trim() || !newItemId.trim()) return;
      const cleanId = newItemId.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      
      try {
          if (modalType === 'subject') {
              await set(ref(db, `subjects/${cleanId}`), {
                  id: cleanId,
                  name: newItemName
              });
              setSelectedSubject(cleanId);
          } else if (modalType === 'chapter') {
              const fullChapterId = `${selectedSubject}_${cleanId}`;
              await set(ref(db, `chapters/${selectedSubject}/${fullChapterId}`), {
                  id: fullChapterId,
                  name: newItemName,
                  subjectId: selectedSubject
              });
              setSelectedChapter(fullChapterId);
          }
          
          setNewItemName('');
          setNewItemId('');
          setModalType(null);
      } catch (e) {
          alert("Error creating item");
          console.error(e);
      }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6 pb-24 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="text-gray-600 dark:text-gray-300">
                <i className="fas fa-arrow-left fa-lg"></i>
            </button>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Admin Panel</h1>
        </div>
      </div>

      <div className="grid gap-6">
        
        {/* Management Controls */}
        <Card className="border-l-8 border-somali-blue">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Subject Selector */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Subject</label>
                        <button onClick={() => setModalType('subject')} className="text-xs text-somali-blue font-bold hover:underline">
                            + New Subject
                        </button>
                    </div>
                    <div className="relative">
                        <select 
                            value={selectedSubject} 
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            className="w-full p-3 bg-gray-50 dark:bg-gray-700 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-xl appearance-none font-bold text-gray-700"
                        >
                            {subjects.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-700 dark:text-gray-400">
                            <i className="fas fa-chevron-down text-sm"></i>
                        </div>
                    </div>
                </div>

                {/* Chapter Selector */}
                <div className={`${!selectedSubject ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Chapter</label>
                        <button onClick={() => setModalType('chapter')} className="text-xs text-somali-blue font-bold hover:underline">
                            + New Chapter
                        </button>
                    </div>
                    <div className="relative">
                        <select 
                            value={selectedChapter} 
                            onChange={(e) => setSelectedChapter(e.target.value)}
                            className="w-full p-3 bg-gray-50 dark:bg-gray-700 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-xl appearance-none font-bold text-gray-700"
                            disabled={!selectedSubject || chapters.length === 0}
                        >
                            {chapters.length === 0 && <option value="">No chapters created</option>}
                            {chapters.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-700 dark:text-gray-400">
                            <i className="fas fa-chevron-down text-sm"></i>
                        </div>
                    </div>
                </div>
            </div>
        </Card>

        {/* Add Question Form */}
        <Card className={`${!selectedChapter ? 'opacity-50 pointer-events-none grayscale' : ''} transition-all`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">
                Add Question
            </h2>
            <span className="text-xs text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{selectedChapter}</span>
          </div>
          
          <form onSubmit={handleAddQuestion}>
            <Input 
              label="Question"
              value={questionText} 
              onChange={(e) => setQuestionText(e.target.value)} 
              placeholder="e.g., What is the capital of Somalia?"
            />

            <div className="mb-4">
              <label className="block text-sm font-bold mb-2 text-gray-700 dark:text-gray-300">Options</label>
              <div className="space-y-3">
                {options.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                    <div 
                        className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold transition-colors cursor-pointer ${idx === correctAnswer ? 'bg-green-500 text-white shadow-lg scale-110' : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 hover:bg-gray-300'}`} 
                        onClick={() => setCorrectAnswer(idx)}
                        title="Mark as correct answer"
                    >
                        {String.fromCharCode(65 + idx)}
                    </div>
                    <input 
                        className={`flex-1 p-2 border-2 rounded-lg transition-colors bg-white dark:bg-gray-700 dark:text-white ${idx === correctAnswer ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-600'}`}
                        value={opt}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        placeholder={`Option ${idx + 1}`}
                    />
                    <button 
                        type="button" 
                        onClick={() => handleRemoveOption(idx)}
                        className="text-gray-400 hover:text-red-500 p-2"
                        disabled={options.length <= 2}
                        title="Remove Option"
                    >
                        <i className="fas fa-times"></i>
                    </button>
                    </div>
                ))}
              </div>
              
              {options.length < 6 && (
                  <button 
                    type="button" 
                    onClick={handleAddOption}
                    className="mt-3 text-sm text-somali-blue font-bold hover:underline flex items-center gap-1"
                  >
                    <i className="fas fa-plus-circle"></i> Add Option
                  </button>
              )}
            </div>

            <Button type="submit" fullWidth isLoading={loading}>
              <i className="fas fa-plus mr-2"></i> Upload Question
            </Button>
          </form>
        </Card>

        {/* Existing Questions List */}
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Existing Questions</h2>
            <div className="flex items-center gap-2">
                 <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded text-xs font-bold">{questions.length}</span>
                 <button onClick={fetchQuestions} className="text-somali-blue hover:rotate-180 transition-transform"><i className="fas fa-sync"></i></button>
            </div>
          </div>
          
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
            {questions.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50">
                    <p className="text-gray-400 mb-1">No questions found in this chapter.</p>
                </div>
            ) : (
                questions.map((q) => (
                <div key={q.id} className="bg-white dark:bg-gray-700 p-4 rounded-xl border border-gray-100 dark:border-gray-600 shadow-sm relative group hover:shadow-md transition-shadow">
                    <button 
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="absolute top-3 right-3 text-gray-300 hover:text-red-500 p-2 transition-colors z-10"
                        title="Delete"
                    >
                        <i className="fas fa-trash"></i>
                    </button>
                    <p className="font-bold mb-3 pr-8 text-gray-800 dark:text-white text-lg">{q.question}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {q.options.map((opt, i) => (
                        <div key={i} className={`p-2 px-3 rounded-lg border flex items-center gap-2 ${i === q.answer ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300 font-bold' : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`}>
                           <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] ${i === q.answer ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-600'}`}>{String.fromCharCode(65 + i)}</span>
                           {opt}
                        </div>
                    ))}
                    </div>
                </div>
                ))
            )}
          </div>
        </Card>
      </div>

      {/* Creation Modal */}
      <Modal isOpen={!!modalType} title={`Create New ${modalType === 'subject' ? 'Subject' : 'Chapter'}`}>
          <div className="space-y-4">
              {modalType === 'chapter' && (
                  <div className="bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 p-3 rounded-lg text-sm mb-4">
                      Adding to: <strong>{subjects.find(s => s.id === selectedSubject)?.name}</strong>
                  </div>
              )}
              
              <Input 
                label="Name" 
                placeholder={`e.g. ${modalType === 'subject' ? 'Physics' : 'Kinematics'}`}
                value={newItemName}
                onChange={(e) => {
                    setNewItemName(e.target.value);
                    if (!newItemId) {
                        setNewItemId(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
                    }
                }}
                autoFocus
              />
              <Input 
                label="Unique ID (Slug)" 
                placeholder={`e.g. ${modalType === 'subject' ? 'physics' : 'kinematics'}`}
                value={newItemId}
                onChange={(e) => setNewItemId(e.target.value)}
              />
              <div className="flex gap-2 pt-2">
                  <Button variant="secondary" fullWidth onClick={() => setModalType(null)}>Cancel</Button>
                  <Button fullWidth onClick={handleCreateItem}>Create</Button>
              </div>
          </div>
      </Modal>
    </div>
  );
};

export default AdminPage;