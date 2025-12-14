import React, { useState, useEffect } from 'react';
import { ref, push, set, get, remove, onValue, off, update } from 'firebase/database';
import { db } from '../firebase';
import { Button, Input, Card, Modal } from '../components/UI';
import { Question, Subject, Chapter } from '../types';
import { useNavigate } from 'react-router-dom';
import { read, utils, writeFile } from 'xlsx';
import Swal from 'sweetalert2';
import { GoogleGenAI } from "@google/genai";

const SCRAPER_API_KEY = "AIzaSyChoJ18ekOxW4nNnWHRJMCwdbgetSFcbFg";

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
  const [inputMode, setInputMode] = useState<'manual' | 'bulk' | 'ai'>('manual');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '', '']); 
  const [correctAnswer, setCorrectAnswer] = useState(0);
  const [loading, setLoading] = useState(false);

  // AI Scraper State
  const [aiRawText, setAiRawText] = useState('');

  // Modals
  const [modalType, setModalType] = useState<'subject' | 'chapter' | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemId, setNewItemId] = useState('');

  const fireAlert = (title: string, text: string, icon: 'success' | 'error' | 'warning' | 'info') => {
      const isDark = document.documentElement.classList.contains('dark');
      return Swal.fire({
          title,
          text,
          icon,
          timer: 3000,
          timerProgressBar: true,
          showCloseButton: true,
          background: isDark ? '#1e293b' : '#fff',
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
          background: isDark ? '#1e293b' : '#fff',
          color: isDark ? '#fff' : '#000',
      });
  };

  // 1. Fetch Subjects
  useEffect(() => {
    const subRef = ref(db, 'subjects');
    const unsub = onValue(subRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
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
      if (correctAnswer === index) {
          setCorrectAnswer(0); 
      } else if (correctAnswer > index) {
          setCorrectAnswer(correctAnswer - 1); 
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
      const rows = data.slice(1);
      
      const updates: any = {};
      let count = 0;

      rows.forEach((row) => {
        if (!row || row.length < 3) return; 
        
        const question = row[0];
        const possibleOptions = [row[1], row[2], row[3], row[4]];
        const validOptions = possibleOptions.filter(o => o !== undefined && o !== null && String(o).trim() !== '').map(String);
        
        let answerVal = row[5];
        let answerIdx = parseInt(answerVal);
        
        if (!question || validOptions.length < 2) return;
        if (isNaN(answerIdx) || answerIdx < 1 || answerIdx > validOptions.length) {
            answerIdx = 1; 
        }
        
        const newRefKey = push(ref(db, `questions/${selectedChapter}`)).key;
        if (newRefKey) {
            updates[`questions/${selectedChapter}/${newRefKey}`] = {
                question: String(question),
                options: validOptions,
                answer: answerIdx - 1, 
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
          fireAlert("Warning", "No valid questions found in file.", "warning");
      }

    } catch (error) {
      console.error(error);
      fireAlert("Error", "Error parsing file.", "error");
    } finally {
        setLoading(false);
        e.target.value = '';
    }
  };

  const handleAiScrape = async () => {
    if (!aiRawText.trim() || !selectedChapter) {
        fireAlert("Missing Info", "Please provide the text and ensure a chapter is selected.", "warning");
        return;
    }

    setLoading(true);
    try {
        const genAI = new GoogleGenAI({ apiKey: SCRAPER_API_KEY });
        const systemPrompt = `
        You are a smart quiz parser. Extract multiple choice questions from the user's text.
        Output MUST be a valid JSON array of objects with keys: "question", "options" (array of strings), "answer" (0-based index number).
        If answer is letter c=a, map to 0.
        `;

        const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: aiRawText,
            config: {
                systemInstruction: systemPrompt,
                responseMimeType: "application/json"
            }
        });

        const jsonStr = response.text || "[]";
        const parsedQuestions = JSON.parse(jsonStr);

        if (!Array.isArray(parsedQuestions) || parsedQuestions.length === 0) {
             throw new Error("Failed to parse valid questions.");
        }

        const updates: any = {};
        let count = 0;
        
        parsedQuestions.forEach((q: any) => {
            if (q.question && Array.isArray(q.options) && typeof q.answer === 'number') {
                 const newRefKey = push(ref(db, `questions/${selectedChapter}`)).key;
                 if (newRefKey) {
                    updates[`questions/${selectedChapter}/${newRefKey}`] = {
                        question: q.question,
                        options: q.options,
                        answer: q.answer,
                        subject: selectedChapter,
                        createdAt: Date.now()
                    };
                    count++;
                 }
            }
        });

        if (count > 0) {
            await update(ref(db), updates);
            setAiRawText('');
            fireAlert("Success", `AI successfully extracted and added ${count} questions!`, "success");
            fetchQuestions();
        } else {
            fireAlert("Warning", "AI response valid but no questions could be formatted.", "warning");
        }

    } catch (e) {
        console.error(e);
        fireAlert("AI Error", "Failed to process text.", "error");
    } finally {
        setLoading(false);
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
      }
  };

  const handleDeleteSubject = async () => {
    if (!selectedSubject) return;
    const result = await fireConfirm("Delete Subject?", "This will permanently delete the Subject and all its Chapters!");
    if(!result.isConfirmed) return;
    
    setLoading(true);
    try {
        const updates: any = {};
        updates[`subjects/${selectedSubject}`] = null;
        updates[`chapters/${selectedSubject}`] = null;
        await update(ref(db), updates);
        setSelectedSubject('');
        setSelectedChapter('');
        fireAlert("Deleted", "Subject has been deleted.", "success");
    } catch(e) {
        fireAlert("Error", "Error deleting subject.", "error");
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteChapter = async () => {
    if (!selectedChapter) return;
    const result = await fireConfirm("Delete Chapter?", "All questions in this chapter will be deleted.");
    if(!result.isConfirmed) return;
    setLoading(true);
    try {
        const updates: any = {};
        updates[`chapters/${selectedSubject}/${selectedChapter}`] = null;
        updates[`questions/${selectedChapter}`] = null;
        await update(ref(db), updates);
        setSelectedChapter('');
        fireAlert("Deleted", "Chapter has been deleted.", "success");
    } catch(e) {
        fireAlert("Error", "Error deleting chapter.", "error");
    } finally {
         setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-4 pb-24 transition-colors max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-md -mx-4 px-4 py-3 mb-6 border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm flex items-center justify-between transition-colors">
        <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="text-gray-600 dark:text-gray-300 hover:text-somali-blue dark:hover:text-blue-400 transition-colors">
                <i className="fas fa-arrow-left fa-lg"></i>
            </button>
            <h1 className="text-2xl font-bold dark:text-white">Admin Panel</h1>
        </div>
      </div>

      <div className="grid gap-6">
        <Card className="border-l-8 border-somali-blue">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Subject</label>
                        <div className="flex gap-2">
                             {selectedSubject && (
                                <button onClick={handleDeleteSubject} className="text-xs text-red-500 font-bold hover:text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">Delete</button>
                             )}
                            <button onClick={() => setModalType('subject')} className="text-xs text-somali-blue font-bold hover:underline bg-blue-50 dark:bg-blue-500/10 px-2 py-1 rounded">+ New</button>
                        </div>
                    </div>
                    <div className="relative">
                        <select 
                            value={selectedSubject} 
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            className="w-full p-3 bg-gray-100 dark:bg-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-xl appearance-none font-bold focus:ring-2 focus:ring-somali-blue"
                        >
                            <option value="">Select Subject</option>
                            {subjects.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <i className="fas fa-chevron-down absolute right-4 top-4 pointer-events-none text-gray-500"></i>
                    </div>
                </div>

                <div className={`${!selectedSubject ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Chapter</label>
                        <div className="flex gap-2">
                             {selectedChapter && (
                                <button onClick={handleDeleteChapter} className="text-xs text-red-500 font-bold hover:text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">Delete</button>
                             )}
                            <button onClick={() => setModalType('chapter')} className="text-xs text-somali-blue font-bold hover:underline bg-blue-50 dark:bg-blue-500/10 px-2 py-1 rounded">+ New</button>
                        </div>
                    </div>
                    <div className="relative">
                        <select 
                            value={selectedChapter} 
                            onChange={(e) => setSelectedChapter(e.target.value)}
                            className="w-full p-3 bg-gray-100 dark:bg-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-xl appearance-none font-bold focus:ring-2 focus:ring-somali-blue"
                            disabled={!selectedSubject || chapters.length === 0}
                        >
                            {chapters.length === 0 && <option value="">No chapters created</option>}
                            {chapters.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <i className="fas fa-chevron-down absolute right-4 top-4 pointer-events-none text-gray-500"></i>
                    </div>
                </div>
            </div>
        </Card>

        <Card className={`${!selectedChapter ? 'opacity-50 pointer-events-none grayscale' : ''} transition-all`}>
          <div className="flex items-center justify-between mb-6 border-b border-gray-100 dark:border-gray-700 pb-4 flex-wrap gap-2">
            <h2 className="text-xl font-bold dark:text-white">
                {inputMode === 'manual' ? 'Add Question' : inputMode === 'ai' ? 'AI Scraper' : 'Bulk Upload'}
            </h2>
            <div className="flex bg-gray-100 dark:bg-gray-900 rounded-lg p-1">
                <button 
                    onClick={() => setInputMode('manual')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${inputMode === 'manual' ? 'bg-white dark:bg-gray-700 shadow text-somali-blue dark:text-white' : 'text-gray-400'}`}
                >Manual</button>
                <button 
                    onClick={() => setInputMode('ai')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${inputMode === 'ai' ? 'bg-white dark:bg-gray-700 shadow text-purple-600 dark:text-purple-300' : 'text-gray-400'}`}
                ><i className="fas fa-magic mr-1"></i>AI</button>
                <button 
                    onClick={() => setInputMode('bulk')}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${inputMode === 'bulk' ? 'bg-white dark:bg-gray-700 shadow text-green-600 dark:text-green-400' : 'text-gray-400'}`}
                >Excel</button>
            </div>
          </div>
          
          {inputMode === 'manual' && (
            <form onSubmit={handleAddQuestion}>
                <Input label="Question" value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Question text..." />
                <div className="mb-4">
                <label className="block text-sm font-bold mb-2 text-gray-700 dark:text-gray-300">Options</label>
                <div className="space-y-3">
                    {options.map((opt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                        <div 
                            className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold cursor-pointer transition-all ${idx === correctAnswer ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300'}`} 
                            onClick={() => setCorrectAnswer(idx)}
                        >{String.fromCharCode(65 + idx)}</div>
                        <input 
                            className={`flex-1 p-2 bg-white dark:bg-gray-900 dark:text-white border-2 rounded-lg transition-colors ${idx === correctAnswer ? 'border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-700'}`}
                            value={opt}
                            onChange={(e) => handleOptionChange(idx, e.target.value)}
                            placeholder={`Option ${idx + 1}`}
                        />
                        <button type="button" onClick={() => handleRemoveOption(idx)} className="text-gray-400 hover:text-red-500 p-2"><i className="fas fa-times"></i></button>
                        </div>
                    ))}
                </div>
                {options.length < 6 && (
                    <button type="button" onClick={handleAddOption} className="mt-3 text-sm text-somali-blue dark:text-blue-400 font-bold hover:underline flex items-center gap-1"><i className="fas fa-plus-circle"></i> Add Option</button>
                )}
                </div>
                <Button type="submit" fullWidth isLoading={loading}><i className="fas fa-plus mr-2"></i> Upload Question</Button>
            </form>
          )}

          {inputMode === 'ai' && (
              <div className="space-y-4">
                  <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-xl border border-purple-100 dark:border-purple-800/50">
                     <h3 className="font-bold text-purple-800 dark:text-purple-300 mb-2"><i className="fas fa-robot mr-2"></i>AI Scraper</h3>
                     <p className="text-sm text-purple-700 dark:text-purple-300/80">Paste text like: "Question? a) ... c=a"</p>
                  </div>
                  <textarea 
                    className="w-full h-48 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
                    placeholder="Paste text here..."
                    value={aiRawText}
                    onChange={(e) => setAiRawText(e.target.value)}
                  ></textarea>
                  <Button fullWidth onClick={handleAiScrape} isLoading={loading} className="!bg-purple-600 hover:!bg-purple-700 text-white shadow-purple-500/30">
                      <i className="fas fa-magic mr-2"></i> Parse & Upload
                  </Button>
              </div>
          )}

          {inputMode === 'bulk' && (
             <div className="space-y-6">
                 <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                     <h3 className="font-bold text-blue-800 dark:text-blue-300 mb-2">Instructions</h3>
                     <p className="text-sm text-blue-700 dark:text-blue-200/80">Upload an Excel file using the template.</p>
                     <button onClick={handleDownloadTemplate} className="mt-4 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-300 px-4 py-2 rounded-lg font-bold text-sm shadow-sm border border-blue-100 dark:border-gray-700">Download Template</button>
                 </div>
                 <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative">
                     <input type="file" accept=".xlsx, .xls" onChange={handleBulkUpload} disabled={loading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                     <i className="fas fa-file-excel text-4xl text-green-500 mb-3"></i>
                     <p className="font-bold dark:text-white">Upload Excel</p>
                     {loading && <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center rounded-xl"><i className="fas fa-spinner fa-spin text-2xl text-somali-blue"></i></div>}
                 </div>
             </div>
          )}
        </Card>

        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold dark:text-white">Questions</h2>
            <div className="flex items-center gap-2">
                 <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded text-xs font-bold">{questions.length}</span>
                 <button onClick={fetchQuestions} className="text-somali-blue dark:text-blue-400"><i className="fas fa-sync"></i></button>
            </div>
          </div>
          
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {questions.length === 0 ? (
                <div className="text-center py-12 text-gray-400 italic">No questions found.</div>
            ) : (
                questions.map((q) => (
                <div key={q.id} className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50 relative group">
                    <button onClick={() => handleDeleteQuestion(q.id)} className="absolute top-3 right-3 text-gray-300 hover:text-red-500 p-2"><i className="fas fa-trash"></i></button>
                    <p className="font-bold mb-3 pr-8 dark:text-white">{q.question}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                    {q.options.map((opt, i) => (
                        <div key={i} className={`p-2 rounded border flex items-center gap-2 ${i === q.answer ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}>
                           <span className="font-bold">{String.fromCharCode(65 + i)}.</span> {opt}
                        </div>
                    ))}
                    </div>
                </div>
                ))
            )}
          </div>
        </Card>
      </div>

      <Modal isOpen={!!modalType} title={`Create ${modalType === 'subject' ? 'Subject' : 'Chapter'}`}>
          <div className="space-y-4">
              <Input label="Name" value={newItemName} onChange={(e) => { setNewItemName(e.target.value); if (!newItemId) setNewItemId(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')); }} autoFocus />
              <Input label="ID" value={newItemId} onChange={(e) => setNewItemId(e.target.value)} />
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