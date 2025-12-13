import React, { useState, useEffect } from 'react';
import { ref, push, set, get, remove, onValue, off, update } from 'firebase/database';
import { db } from '../firebase';
import { Button, Input, Card, Modal } from '../components/UI';
import { Question, Subject, Chapter } from '../types';
import { useNavigate } from 'react-router-dom';
import { read, utils, writeFile } from 'xlsx';
import Swal from 'sweetalert2';

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
  const [inputMode, setInputMode] = useState<'manual' | 'bulk'>('manual');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '', '']); // Dynamic array
  const [correctAnswer, setCorrectAnswer] = useState(0);
  const [loading, setLoading] = useState(false);

  // Modals
  const [modalType, setModalType] = useState<'subject' | 'chapter' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemId, setNewItemId] = useState('');

  // Helper for consistent alert styling
  const fireAlert = (title: string, text: string, icon: 'success' | 'error' | 'warning' | 'info') => {
      const isDark = document.documentElement.classList.contains('dark');
      return Swal.fire({
          title,
          text,
          icon,
          timer: 3000,
          timerProgressBar: true,
          showCloseButton: true,
          background: isDark ? '#1f2937' : '#fff',
          color: isDark ? '#fff' : '#000',
      });
  };

  const fireConfirm = (title: string, text: string) => {
      const isDark = document.documentElement.classList.contains('dark');
      return Swal.fire({
          title,
          text,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d33',
          cancelButtonColor: '#3085d6',
          confirmButtonText: 'Yes, delete it!',
          background: isDark ? '#1f2937' : '#fff',
          color: isDark ? '#fff' : '#000',
      });
  };

  // 1. Fetch Subjects
  useEffect(() => {
    const subRef = ref(db, 'subjects');
    const unsub = onValue(subRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            // Filter out empty or invalid subjects
            const list = (Object.values(data) as Subject[]).filter(s => s && s.id && s.name);
            setSubjects(list);
        } else {
            setSubjects([]);
        }
    });
    return () => off(subRef);
  }, []);

  // 2. Fetch Chapters when Subject changes
  useEffect(() => {
    if (!selectedSubject) {
        setChapters([]);
        setSelectedChapter('');
        return;
    }
    
    const chapRef = ref(db, `chapters/${selectedSubject}`);
    const unsub = onValue(chapRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const list = Object.values(data) as Chapter[];
            setChapters(list);
            if (list.length > 0) {
                // Keep selected if valid, else select first
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
          fireAlert("Error", "A question must have at least 2 options.", "error");
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
        fireAlert("Missing Info", "Please create and select a Chapter first.", "warning");
        return;
    }
    if (options.some(opt => !opt.trim()) || !questionText.trim()) {
      fireAlert("Missing Info", "Please fill in all fields (Question and Options).", "warning");
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
      fireAlert("Success", "Question added successfully!", "success");
    } catch (error) {
      console.error("Error adding question:", error);
      fireAlert("Error", "Failed to add question.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const ws = utils.json_to_sheet([
        { 
            "Question": "What is 2 + 2?", 
            "Option A": "3", 
            "Option B": "4", 
            "Option C": "5", 
            "Option D": "6", 
            "Correct Answer (1-4)": 2 
        },
        { 
            "Question": "Capital of Somalia?", 
            "Option A": "Mogadishu", 
            "Option B": "Hargeisa", 
            "Option C": "Kismayo", 
            "Option D": "Baidoa", 
            "Correct Answer (1-4)": 1 
        }
    ]);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Template");
    writeFile(wb, "quiz_template.xlsx");
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChapter) return;

    setLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = read(arrayBuffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data: any[][] = utils.sheet_to_json(ws, { header: 1 });

      // Remove header row
      const rows = data.slice(1);
      
      const updates: any = {};
      let count = 0;

      rows.forEach((row) => {
        // Expected structure roughly: [Question, Opt1, Opt2, Opt3, Opt4, AnswerIndex(1-4)]
        if (!row || row.length < 3) return; 
        
        const question = row[0];
        const possibleOptions = [row[1], row[2], row[3], row[4]];
        const validOptions = possibleOptions.filter(o => o !== undefined && o !== null && String(o).trim() !== '').map(String);
        
        let answerVal = row[5];
        let answerIdx = parseInt(answerVal);
        
        if (!question || validOptions.length < 2) return;
        
        // Adjust 1-based to 0-based
        if (isNaN(answerIdx) || answerIdx < 1 || answerIdx > validOptions.length) {
            answerIdx = 1; 
        }
        
        const newRefKey = push(ref(db, `questions/${selectedChapter}`)).key;
        if (newRefKey) {
            updates[`questions/${selectedChapter}/${newRefKey}`] = {
                question: String(question),
                options: validOptions,
                answer: answerIdx - 1, // Store as 0-based
                subject: selectedChapter,
                createdAt: Date.now()
            };
            count++;
        }
      });

      if (count > 0) {
          await update(ref(db), updates);
          fireAlert("Success", `Successfully uploaded ${count} questions!`, "success");
          fetchQuestions();
      } else {
          fireAlert("Warning", "No valid questions found in file. Please use the template.", "warning");
      }

    } catch (error) {
      console.error(error);
      fireAlert("Error", "Error parsing file. Ensure it is a valid Excel file.", "error");
    } finally {
        setLoading(false);
        e.target.value = '';
    }
  };

  const handleDeleteQuestion = async (id: string | number) => {
    const result = await fireConfirm("Delete Question?", "You won't be able to revert this!");
    if(!result.isConfirmed) return;

    try {
      await remove(ref(db, `questions/${selectedChapter}/${id}`));
      fetchQuestions();
      fireAlert("Deleted", "Question has been deleted.", "success");
    } catch(e) {
      console.error(e);
      fireAlert("Error", "Failed to delete question.", "error");
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
          fireAlert("Success", "Item created successfully!", "success");
      } catch (e) {
          fireAlert("Error", "Error creating item", "error");
          console.error(e);
      }
  };

  const handleDeleteSubject = async () => {
    if (!selectedSubject) return;
    
    const result = await fireConfirm("Delete Subject?", "This will permanently delete the Subject, all its Chapters, and Questions!");
    if(!result.isConfirmed) return;
    
    setLoading(true);
    try {
        const chaptersRef = ref(db, `chapters/${selectedSubject}`);
        const snap = await get(chaptersRef);
        
        const updates: any = {};
        updates[`subjects/${selectedSubject}`] = null;
        updates[`chapters/${selectedSubject}`] = null;

        if (snap.exists()) {
             const chaps = snap.val();
             Object.keys(chaps).forEach(chapId => {
                 updates[`questions/${chapId}`] = null;
                 updates[`queue/${chapId}`] = null;
             });
        }
        
        await update(ref(db), updates);
        
        setSelectedSubject('');
        setSelectedChapter('');
        fireAlert("Deleted", "Subject has been deleted.", "success");
    } catch(e) {
        console.error(e);
        fireAlert("Error", "Error deleting subject.", "error");
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteChapter = async () => {
    if (!selectedChapter || !selectedSubject) return;
    
    const result = await fireConfirm("Delete Chapter?", "All questions in this chapter will be deleted.");
    if(!result.isConfirmed) return;

    setLoading(true);
    try {
        const updates: any = {};
        updates[`chapters/${selectedSubject}/${selectedChapter}`] = null;
        updates[`questions/${selectedChapter}`] = null;
        updates[`queue/${selectedChapter}`] = null;

        await update(ref(db), updates);
        setSelectedChapter('');
        fireAlert("Deleted", "Chapter has been deleted.", "success");
    } catch(e) {
        console.error(e);
        fireAlert("Error", "Error deleting chapter.", "error");
    } finally {
         setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-6 pb-24 transition-colors">
      {/* Fixed Header */}
      <div className="sticky top-0 z-30 bg-gray-100/95 dark:bg-gray-900/95 backdrop-blur-md -mx-6 px-6 py-4 mb-6 border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm flex items-center justify-between transition-colors">
        <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="text-gray-600 dark:text-gray-300 hover:text-somali-blue dark:hover:text-blue-400 transition-colors">
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
                        <div className="flex gap-2">
                             {selectedSubject && (
                                <button onClick={handleDeleteSubject} className="text-xs text-red-500 font-bold hover:text-red-600 transition-colors bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                                    <i className="fas fa-trash mr-1"></i>Delete
                                </button>
                             )}
                            <button onClick={() => setModalType('subject')} className="text-xs text-somali-blue font-bold hover:underline bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                                + New
                            </button>
                        </div>
                    </div>
                    <div className="relative">
                        <select 
                            value={selectedSubject} 
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            className="w-full p-3 bg-gray-50 dark:bg-gray-700 dark:text-white border-2 border-gray-200 dark:border-gray-600 rounded-xl appearance-none font-bold text-gray-700"
                        >
                            <option value="">Select Subject</option>
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
                        <div className="flex gap-2">
                             {selectedChapter && (
                                <button onClick={handleDeleteChapter} className="text-xs text-red-500 font-bold hover:text-red-600 transition-colors bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                                    <i className="fas fa-trash mr-1"></i>Delete
                                </button>
                             )}
                            <button onClick={() => setModalType('chapter')} className="text-xs text-somali-blue font-bold hover:underline bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">
                                + New
                            </button>
                        </div>
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

        {/* Add Question Card */}
        <Card className={`${!selectedChapter ? 'opacity-50 pointer-events-none grayscale' : ''} transition-all`}>
          <div className="flex items-center justify-between mb-6 border-b border-gray-100 dark:border-gray-700 pb-4">
            <h2 className="text-xl font-bold dark:text-white">
                {inputMode === 'manual' ? 'Add Single Question' : 'Bulk Upload'}
            </h2>
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button 
                    onClick={() => setInputMode('manual')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${inputMode === 'manual' ? 'bg-white dark:bg-gray-600 shadow text-somali-blue' : 'text-gray-400'}`}
                >
                    Manual
                </button>
                <button 
                    onClick={() => setInputMode('bulk')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${inputMode === 'bulk' ? 'bg-white dark:bg-gray-600 shadow text-somali-blue' : 'text-gray-400'}`}
                >
                    Excel Upload
                </button>
            </div>
          </div>
          
          {inputMode === 'manual' ? (
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
          ) : (
             <div className="space-y-6">
                 <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                     <h3 className="font-bold text-blue-800 dark:text-blue-200 mb-2">Instructions</h3>
                     <ul className="text-sm text-blue-700 dark:text-blue-300 list-disc list-inside space-y-1">
                         <li>Download the template file.</li>
                         <li>Fill in the Questions, Options (A, B, C, D) and Correct Answer (1-4).</li>
                         <li>Do not change the header row.</li>
                         <li>Upload the file below.</li>
                     </ul>
                     <button 
                        onClick={handleDownloadTemplate}
                        className="mt-4 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-300 px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:shadow transition-shadow border border-blue-100 dark:border-gray-600"
                     >
                         <i className="fas fa-download mr-2"></i> Download Template
                     </button>
                 </div>

                 <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative">
                     <input 
                        type="file" 
                        accept=".xlsx, .xls"
                        onChange={handleBulkUpload}
                        disabled={loading}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                     />
                     <div className="pointer-events-none">
                         <i className="fas fa-file-excel text-4xl text-green-500 mb-3"></i>
                         <p className="font-bold text-gray-700 dark:text-gray-300">Click to Upload Excel File</p>
                         <p className="text-xs text-gray-400 mt-1">.xlsx or .xls</p>
                     </div>
                     {loading && (
                         <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center rounded-xl">
                             <i className="fas fa-spinner fa-spin text-2xl text-somali-blue"></i>
                         </div>
                     )}
                 </div>
             </div>
          )}
        </Card>

        {/* Existing Questions List */}
        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold dark:text-white">Existing Questions</h2>
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