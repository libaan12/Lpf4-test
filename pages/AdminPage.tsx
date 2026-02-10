import React, { useState, useEffect } from 'react';
// Fixed: Added serverTimestamp to firebase/database imports
import { ref, push, set, get, remove, onValue, off, update, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { Button, Input, Card, Modal } from '../components/UI';
import { Question, Subject, Chapter, StudyMaterial } from '../types';
import { useNavigate } from 'react-router-dom';
import { read, utils, writeFile } from 'xlsx';
import { showAlert, showConfirm, showToast } from '../services/alert';

export const AdminPage: React.FC = () => {
  const navigate = useNavigate();
  
  // View State
  const [activeTab, setActiveTab] = useState<'quizzes' | 'pdfs'>('quizzes');

  // Selection State
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');

  // Data State
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [studyMaterials, setStudyMaterials] = useState<StudyMaterial[]>([]);
  
  // Quiz Form State
  const [inputMode, setInputMode] = useState<'manual' | 'bulk' | 'parser'>('manual');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '', '']); 
  const [correctAnswer, setCorrectAnswer] = useState(0);
  
  // PDF Upload Form State
  const [pdfExternalUrl, setPdfExternalUrl] = useState('');
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfSubject, setPdfSubject] = useState('');
  const [pdfCategory, setPdfCategory] = useState<'exams' | 'subjects'>('subjects');
  
  const [loading, setLoading] = useState(false);

  // Text Parser State
  const [rawText, setRawText] = useState('');

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

  // 4. Fetch Study Materials
  useEffect(() => {
      const matRef = ref(db, 'studyMaterials');
      const unsub = onValue(matRef, (snapshot) => {
          if (snapshot.exists()) {
              const data = snapshot.val();
              const list = Object.keys(data).map(k => ({ ...data[k], id: k }));
              setStudyMaterials(list);
          } else {
              setStudyMaterials([]);
          }
      });
      return () => off(matRef);
  }, []);

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
      if(options.length >= 6) return; 
      setOptions([...options, '']);
  };

  const handleRemoveOption = (index: number) => {
      if (options.length <= 2) {
          showAlert("Error", "A question must have at least 2 options.", "error");
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
        showAlert("Missing Info", "Please create and select a Chapter first.", "warning");
        return;
    }
    if (options.some(opt => !opt.trim()) || !questionText.trim()) {
      showAlert("Missing Info", "Please fill in all fields (Question and Options).", "warning");
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
      showAlert("Success", "Question added successfully!", "success");
    } catch (error) {
      console.error("Error adding question:", error);
      showAlert("Error", "Failed to add question.", "error");
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
          showAlert("Success", `Successfully uploaded ${count} questions!`, "success");
          fetchQuestions();
      } else {
          showAlert("Warning", "No valid questions found in file.", "warning");
      }

    } catch (error) {
      console.error(error);
      showAlert("Error", "Error parsing file.", "error");
    } finally {
        setLoading(false);
        e.target.value = '';
    }
  };

  const handleTextParse = async () => {
    if (!rawText.trim() || !selectedChapter) {
        showAlert("Missing Info", "Please paste text in the correct format.", "warning");
        return;
    }

    setLoading(true);
    try {
        const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
        const parsedQuestions: any[] = [];
        let currentQ: any = null;

        lines.forEach(line => {
            const questionMatch = line.match(/^(\d+)[\.\)]\s+(.+)/);
            if (questionMatch) {
                if (currentQ && currentQ.options.length >= 2) {
                    parsedQuestions.push(currentQ);
                }
                currentQ = {
                    question: questionMatch[2],
                    options: [],
                    answer: 0 
                };
                return;
            }

            const optionMatch = line.match(/^([a-dA-D])[\.\)]\s+(.+)/);
            if (currentQ && optionMatch) {
                currentQ.options.push(optionMatch[2]);
                return;
            }

            const answerMatch = line.match(/^(?:Answer|Ans|Correct)\s*[:\-]?\s*([a-dA-D])/i);
            if (currentQ && answerMatch) {
                const charCode = answerMatch[1].toLowerCase().charCodeAt(0);
                currentQ.answer = Math.max(0, charCode - 97);
                return;
            }
        });

        if (currentQ && currentQ.options.length >= 2) {
            parsedQuestions.push(currentQ);
        }

        if (parsedQuestions.length === 0) {
             throw new Error("No questions found. Check format.");
        }

        const updates: any = {};
        let count = 0;
        
        parsedQuestions.forEach((q) => {
             const newRefKey = push(ref(db, `questions/${selectedChapter}`)).key;
             if (newRefKey) {
                updates[`questions/${selectedChapter}/${newRefKey}`] = {
                    question: q.question,
                    options: q.options,
                    answer: Math.min(q.answer, q.options.length - 1),
                    subject: selectedChapter,
                    createdAt: Date.now()
                };
                count++;
             }
        });

        if (count > 0) {
            await update(ref(db), updates);
            setRawText('');
            showAlert("Success", `Parsed and added ${count} questions!`, "success");
            fetchQuestions();
        } else {
            showAlert("Warning", "Text parsed but no valid questions created.", "warning");
        }

    } catch (e) {
        console.error(e);
        showAlert("Parser Error", "Failed to parse text.", "error");
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteQuestion = async (id: string | number) => {
    const isConfirmed = await showConfirm("Delete Question?", "You won't be able to revert this!");
    if(!isConfirmed) return;
    try {
      await remove(ref(db, `questions/${selectedChapter}/${id}`));
      fetchQuestions();
      showAlert("Deleted", "Question has been deleted.", "success");
    } catch(e) {
      console.error(e);
      showAlert("Error", "Failed to delete question.", "error");
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
          showAlert("Success", "Item created successfully!", "success");
      } catch (e) {
          showAlert("Error", "Error creating item", "error");
      }
  };

  const handleDeleteSubject = async () => {
    if (!selectedSubject) return;
    const isConfirmed = await showConfirm("Delete Subject?", "This will permanently delete the Subject and all its Chapters!");
    if(!isConfirmed) return;
    
    setLoading(true);
    try {
        const updates: any = {};
        updates[`subjects/${selectedSubject}`] = null;
        updates[`chapters/${selectedSubject}`] = null;
        await update(ref(db), updates);
        setSelectedSubject('');
        setSelectedChapter('');
        showAlert("Deleted", "Subject has been deleted.", "success");
    } catch(e) {
        showAlert("Error", "Error deleting subject.", "error");
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteChapter = async () => {
    if (!selectedChapter) return;
    const isConfirmed = await showConfirm("Delete Chapter?", "All questions in this chapter will be deleted.");
    if(!isConfirmed) return;
    setLoading(true);
    try {
        const updates: any = {};
        updates[`chapters/${selectedSubject}/${selectedChapter}`] = null;
        updates[`questions/${selectedChapter}`] = null;
        await update(ref(db), updates);
        setSelectedChapter('');
        showAlert("Deleted", "Chapter has been deleted.", "success");
    } catch(e) {
        showAlert("Error", "Error deleting chapter.", "error");
    } finally {
         setLoading(false);
    }
  };

  const handlePdfUpload = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (!pdfTitle || !pdfSubject || !pdfExternalUrl.trim()) {
          showAlert("Missing Info", "Please provide a title, subject, and URL.", "warning");
          return;
      }

      setLoading(true);
      
      try {
          const newRef = push(ref(db, 'studyMaterials'));
          await set(newRef, {
              id: newRef.key,
              fileName: pdfTitle.trim(),
              subjectName: pdfSubject.trim(),
              category: pdfCategory,
              fileURL: pdfExternalUrl.trim(),
              fileSize: "Cloud Link",
              // Fixed: Using serverTimestamp() which is now imported
              uploadDate: serverTimestamp()
          });
          
          setPdfExternalUrl('');
          setPdfTitle('');
          setPdfSubject('');
          showAlert("Success", "Resource deployed successfully!", "success");
      } catch(e) {
          console.error(e);
          showAlert("Error", "Deployment failed.", "error");
      } finally {
          setLoading(false);
      }
  };

  const handleDeletePdf = async (item: StudyMaterial) => {
      const confirm = await showConfirm("Delete Resource?", "This will permanently remove it from the Library.");
      if (!confirm) return;
      try {
          await remove(ref(db, `studyMaterials/${item.id}`));
          showToast("Deleted", "success");
      } catch(e) {
          showAlert("Error", "Failed to delete PDF.", "error");
      }
  };

  return (
    <div className="min-h-screen bg-[#050b14] text-white p-4 pb-24 pt-20 transition-colors max-w-4xl mx-auto w-full relative">
      
      {/* Background Ambient Effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-[0.03]"></div>
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-900/10 rounded-full blur-[128px] animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-900/10 rounded-full blur-[128px] animate-pulse delay-1000"></div>
          <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-[linear-gradient(to_bottom,transparent_0%,#0f172a_100%),linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] [transform:perspective(500px)_rotateX(60deg)_translateY(100px)] opacity-30 origin-bottom"></div>
      </div>

      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#0f172a]/80 backdrop-blur-xl border-b border-white/5 shadow-xl flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-cyan-400 transition-colors shadow-lg active:scale-90">
                <i className="fas fa-arrow-left"></i>
            </button>
            <h1 className="text-xl md:text-2xl font-black text-white uppercase italic tracking-tighter">Command Center</h1>
        </div>
        <div className="bg-slate-800/50 px-3 py-1 rounded-full border border-white/5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-[10px] font-black uppercase text-slate-400">Live Sync</span>
        </div>
      </div>

      <div className="relative z-10">
          <div className="flex bg-[#1e293b]/50 backdrop-blur-md rounded-2xl p-1 gap-1 mb-6 border border-white/5 shadow-inner">
              <button 
                onClick={() => setActiveTab('quizzes')} 
                className={`flex-1 py-3.5 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${activeTab === 'quizzes' ? 'bg-game-primary text-white shadow-[0_0_20px_rgba(249,115,22,0.3)] border-b-4 border-game-primaryDark' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <i className="fas fa-database mr-2"></i> Quiz Bank
              </button>
              <button 
                onClick={() => setActiveTab('pdfs')} 
                className={`flex-1 py-3.5 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${activeTab === 'pdfs' ? 'bg-game-primary text-white shadow-[0_0_20px_rgba(249,115,22,0.3)] border-b-4 border-game-primaryDark' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <i className="fas fa-file-pdf mr-2"></i> Library
              </button>
          </div>

          {activeTab === 'quizzes' ? (
            <div className="space-y-6 animate__animated animate__fadeIn">
                {/* Selector Section */}
                <Card className="!bg-[#0f172a]/40 border-2 border-slate-800 backdrop-blur-md rounded-[2.5rem] !p-6 shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-game-primary opacity-50"></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Current Subject</label>
                                <div className="flex gap-2">
                                     {selectedSubject && (
                                        <button onClick={handleDeleteSubject} className="text-[10px] font-black text-red-500 bg-red-900/10 px-2.5 py-1 rounded-lg border border-red-500/20 active:scale-95 transition-all">DELETE</button>
                                     )}
                                    <button onClick={() => setModalType('subject')} className="text-[10px] font-black text-game-primary bg-game-primary/10 px-2.5 py-1 rounded-lg border border-game-primary/20 active:scale-95 transition-all">+ NEW</button>
                                </div>
                            </div>
                            <div className="relative">
                                <select 
                                    value={selectedSubject} 
                                    onChange={(e) => setSelectedSubject(e.target.value)}
                                    className="w-full p-4 bg-[#050b14]/50 text-white border-2 border-slate-800 rounded-2xl appearance-none font-bold focus:border-game-primary transition-all cursor-pointer shadow-inner"
                                >
                                    <option value="">-- Choose Subject --</option>
                                    {subjects.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                                <i className="fas fa-chevron-down absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-600"></i>
                            </div>
                        </div>

                        <div className={`${!selectedSubject ? 'opacity-30 pointer-events-none' : ''}`}>
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Specific Chapter</label>
                                <div className="flex gap-2">
                                     {selectedChapter && (
                                        <button onClick={handleDeleteChapter} className="text-[10px] font-black text-red-500 bg-red-900/10 px-2.5 py-1 rounded-lg border border-red-500/20 active:scale-95 transition-all">DELETE</button>
                                     )}
                                    <button onClick={() => setModalType('chapter')} className="text-[10px] font-black text-game-primary bg-game-primary/10 px-2.5 py-1 rounded-lg border border-game-primary/20 active:scale-95 transition-all">+ NEW</button>
                                </div>
                            </div>
                            <div className="relative">
                                <select 
                                    value={selectedChapter} 
                                    onChange={(e) => setSelectedChapter(e.target.value)}
                                    className="w-full p-4 bg-[#050b14]/50 text-white border-2 border-slate-800 rounded-2xl appearance-none font-bold focus:border-game-primary transition-all cursor-pointer shadow-inner"
                                    disabled={!selectedSubject || chapters.length === 0}
                                >
                                    {chapters.length === 0 && <option value="">No chapters available</option>}
                                    {chapters.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                                <i className="fas fa-chevron-down absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-600"></i>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Input Card */}
                <Card className={`!bg-[#0f172a]/40 border-2 border-slate-800 backdrop-blur-md rounded-[2.5rem] !p-8 shadow-2xl relative ${!selectedChapter ? 'opacity-30 pointer-events-none grayscale' : ''} transition-all`}>
                  <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
                    <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white flex items-center gap-3">
                        <i className={`fas ${inputMode === 'manual' ? 'fa-plus-circle' : inputMode === 'parser' ? 'fa-magic' : 'fa-file-excel'} text-game-primary`}></i>
                        {inputMode === 'manual' ? 'Manual Input' : inputMode === 'parser' ? 'Text Parser' : 'Excel Batch'}
                    </h2>
                    <div className="flex bg-slate-900 rounded-xl p-1 shadow-inner border border-white/5">
                        <button onClick={() => setInputMode('manual')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${inputMode === 'manual' ? 'bg-game-primary text-slate-900 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Manual</button>
                        <button onClick={() => setInputMode('parser')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${inputMode === 'parser' ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Parse</button>
                        <button onClick={() => setInputMode('bulk')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${inputMode === 'bulk' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Excel</button>
                    </div>
                  </div>
                  
                  {inputMode === 'manual' && (
                    <form onSubmit={handleAddQuestion} className="space-y-6">
                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Question Content</label>
                            <Input value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Type the question here..." className="!bg-[#050b14]/50 !border-slate-800 !text-white" />
                        </div>
                        
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Answer Options (Click letter to mark correct)</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {options.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-3 group">
                                        <button 
                                            type="button"
                                            className={`w-12 h-12 shrink-0 rounded-xl flex items-center justify-center font-black transition-all border-2 ${idx === correctAnswer ? 'bg-green-500 border-green-400 text-slate-900 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : 'bg-slate-800 border-slate-700 text-slate-500 hover:border-slate-500'}`} 
                                            onClick={() => setCorrectAnswer(idx)}
                                        >
                                            {String.fromCharCode(65 + idx)}
                                        </button>
                                        <div className="flex-1 relative">
                                            <input 
                                                className={`w-full p-4 bg-[#050b14]/50 text-white border-2 rounded-2xl transition-all font-bold focus:outline-none ${idx === correctAnswer ? 'border-green-500' : 'border-slate-800 focus:border-game-primary'}`}
                                                value={opt}
                                                onChange={(e) => handleOptionChange(idx, e.target.value)}
                                                placeholder={`Option ${idx + 1}`}
                                            />
                                            {options.length > 2 && (
                                                <button type="button" onClick={() => handleRemoveOption(idx)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-700 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                                                    <i className="fas fa-times-circle"></i>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {options.length < 6 && (
                                <button type="button" onClick={handleAddOption} className="text-[10px] font-black bg-slate-800/50 hover:bg-slate-800 text-game-primary uppercase tracking-[0.2em] px-5 py-3 rounded-xl border-2 border-dashed border-slate-700 transition-all active:scale-95">
                                    <i className="fas fa-plus-circle mr-1"></i> Add Option
                                </button>
                            )}
                        </div>
                        <Button type="submit" fullWidth isLoading={loading} className="!py-5 !text-lg !rounded-2xl">
                             UPLOAD QUESTION
                        </Button>
                    </form>
                  )}

                  {inputMode === 'parser' && (
                      <div className="space-y-4">
                          <div className="p-4 bg-purple-900/10 border border-purple-500/20 rounded-2xl text-[10px] font-bold text-purple-400 uppercase tracking-widest leading-relaxed">
                              Format: 1. Question? a) Op 1 b) Op 2 Ans: a
                          </div>
                          <textarea 
                            className="w-full h-48 p-5 rounded-2xl border-2 border-slate-800 bg-[#050b14]/50 text-white focus:outline-none focus:border-purple-500 font-mono text-sm resize-none shadow-inner"
                            placeholder="Paste your questions here..."
                            value={rawText}
                            onChange={(e) => setRawText(e.target.value)}
                          ></textarea>
                          <Button fullWidth onClick={handleTextParse} isLoading={loading} className="!bg-purple-600 hover:!bg-purple-700 !py-5 !rounded-2xl shadow-lg shadow-purple-500/20">
                              <i className="fas fa-magic mr-2"></i> DEPLOY PARSER
                          </Button>
                      </div>
                  )}

                  {inputMode === 'bulk' && (
                     <div className="space-y-6">
                         <div className="bg-green-900/10 border border-green-500/20 p-5 rounded-2xl flex justify-between items-center">
                             <div className="text-[10px] font-bold text-green-400 uppercase tracking-widest">Use official Excel layout for deployment</div>
                             <button onClick={handleDownloadTemplate} className="bg-white text-slate-950 px-4 py-2 rounded-xl font-black text-[10px] uppercase shadow-lg active:scale-90 transition-all">
                                <i className="fas fa-download mr-1"></i> Template
                             </button>
                         </div>
                         <div className="border-4 border-dashed border-slate-800 rounded-[2rem] p-12 text-center hover:bg-slate-800/20 hover:border-green-500/50 transition-all relative group cursor-pointer shadow-inner">
                             <input type="file" accept=".xlsx, .xls" onChange={handleBulkUpload} disabled={loading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                             <i className="fas fa-file-excel text-6xl text-green-500 mb-4 group-hover:scale-110 transition-transform"></i>
                             <p className="font-black text-white uppercase tracking-tighter text-xl">Drop Batch File</p>
                             <p className="text-slate-500 text-xs mt-2">Maximum 500 questions per batch</p>
                         </div>
                     </div>
                  )}
                </Card>

                {/* List Card */}
                <Card className="!bg-[#0f172a]/40 border-2 border-slate-800 backdrop-blur-md rounded-[2.5rem] !p-8 shadow-2xl">
                  <div className="flex justify-between items-center mb-8 border-b border-white/5 pb-4">
                    <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter flex items-center gap-3">
                        <i className="fas fa-list text-game-primary"></i> 
                        Sync History
                    </h2>
                    <span className="bg-slate-900 text-game-primary px-4 py-1.5 rounded-full text-[10px] font-black uppercase border border-game-primary/20">{questions.length} Questions</span>
                  </div>
                  
                  <div className="space-y-4 max-h-[600px] overflow-y-auto pr-3 custom-scrollbar">
                    {questions.length === 0 ? (
                        <div className="text-center py-24 opacity-30 flex flex-col items-center gap-4">
                            <i className="fas fa-database text-6xl"></i>
                            <p className="font-black uppercase tracking-[0.3em]">No Data Synced</p>
                        </div>
                    ) : (
                        questions.map((q, qidx) => (
                        <div key={q.id} className="bg-slate-900/60 p-6 rounded-[2rem] border border-slate-800 relative group hover:border-slate-600 transition-all shadow-xl">
                            <button onClick={() => handleDeleteQuestion(q.id)} className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-red-900/10 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg">
                                <i className="fas fa-trash-alt"></i>
                            </button>
                            <div className="flex items-start gap-4 mb-6">
                                <span className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center font-black text-slate-500 text-sm border border-white/5 shrink-0">#{qidx+1}</span>
                                <div className="pr-12"><p className="font-bold text-white text-lg leading-snug">{q.question}</p></div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            {q.options.map((opt, i) => (
                                <div key={i} className={`p-4 rounded-xl border-2 flex items-center gap-3 transition-colors ${i === q.answer ? 'bg-green-500/10 border-green-500 text-white font-black' : 'bg-slate-800/50 border-slate-700 text-slate-400'}`}>
                                   <span className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-black ${i === q.answer ? 'bg-green-500 text-slate-900' : 'bg-slate-700 text-slate-400'}`}>{String.fromCharCode(65 + i)}</span> 
                                   <span className="truncate">{opt}</span>
                                </div>
                            ))}
                            </div>
                        </div>
                        ))
                    )}
                  </div>
                </Card>
            </div>
          ) : (
            <div className="space-y-6 animate__animated animate__fadeIn">
                <Card className="!bg-[#0f172a]/40 border-2 border-slate-800 backdrop-blur-md rounded-[2.5rem] !p-8 shadow-2xl">
                    <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
                        <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white flex items-center gap-3">
                            <i className="fas fa-file-upload text-game-primary"></i> 
                            Deploy Resource
                        </h2>
                    </div>
                    <form onSubmit={handlePdfUpload} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Resource Label</label>
                                <Input value={pdfTitle} onChange={(e) => setPdfTitle(e.target.value)} placeholder="e.g. Physics Formula Sheet" className="!bg-[#050b14]/50 !border-slate-800 !text-white" />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Subject Name</label>
                                <select 
                                    value={pdfSubject} 
                                    onChange={(e) => setPdfSubject(e.target.value)}
                                    className="w-full p-4 bg-[#050b14]/50 text-white border-2 border-slate-800 rounded-2xl appearance-none font-bold focus:border-game-primary transition-all cursor-pointer shadow-inner"
                                >
                                    <option value="">Select Subject</option>
                                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Category</label>
                            <div className="flex gap-4">
                                <button 
                                    type="button"
                                    onClick={() => setPdfCategory('exams')}
                                    className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-widest border-2 transition-all ${pdfCategory === 'exams' ? 'bg-game-primary/10 border-game-primary text-game-primary' : 'bg-slate-800/50 border-slate-700 text-slate-500'}`}
                                >
                                    National Exams
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => setPdfCategory('subjects')}
                                    className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-widest border-2 transition-all ${pdfCategory === 'subjects' ? 'bg-game-primary/10 border-game-primary text-game-primary' : 'bg-slate-800/50 border-slate-700 text-slate-500'}`}
                                >
                                    Subject PDFs
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Direct Access URL (Catbox/Cloud)</label>
                            <Input value={pdfExternalUrl} onChange={(e) => setPdfExternalUrl(e.target.value)} placeholder="https://files.catbox.moe/xxxxxx.pdf" className="!bg-[#050b14]/50 !border-slate-800 !text-white" />
                        </div>

                        <Button type="submit" fullWidth isLoading={loading} disabled={!pdfTitle || !pdfSubject || !pdfExternalUrl} className="!py-5 !rounded-2xl shadow-xl">
                            <i className="fas fa-save mr-2"></i> DEPLOY TO LIBRARY
                        </Button>
                    </form>
                </Card>

                <Card className="!bg-[#0f172a]/40 border-2 border-slate-800 backdrop-blur-md rounded-[2.5rem] !p-8 shadow-2xl">
                    <h2 className="text-2xl font-black italic text-white uppercase tracking-tighter mb-8 flex items-center gap-3">
                        <i className="fas fa-book-open text-game-primary"></i> 
                        Live Resources
                    </h2>
                    <div className="space-y-4">
                        {studyMaterials.length === 0 ? (
                            <div className="text-center py-20 opacity-30 flex flex-col items-center gap-4">
                                <i className="fas fa-folder-open text-6xl"></i>
                                <p className="font-black uppercase tracking-[0.3em]">No Content Available</p>
                            </div>
                        ) : (
                            studyMaterials.map(item => (
                                <div key={item.id} className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 flex items-center justify-between shadow-xl group hover:border-slate-600 transition-all">
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl shadow-lg border border-white/5 bg-cyan-900/20 text-cyan-400`}>
                                            <i className={`fas fa-link`}></i>
                                        </div>
                                        <div className="truncate">
                                            <h4 className="font-black text-white text-base truncate uppercase">{item.fileName}</h4>
                                            <div className="flex gap-2 items-center mt-1">
                                                <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{item.subjectName}</span>
                                                <span className="text-slate-700">•</span>
                                                <span className="text-[9px] text-game-primary font-black uppercase">{item.category === 'exams' ? 'National Exam' : 'Subject PDF'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => handleDeletePdf(item)} className="w-10 h-10 rounded-xl bg-red-900/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-lg active:scale-90 border border-red-500/10">
                                        <i className="fas fa-trash text-sm"></i>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </Card>
            </div>
          )}
      </div>

      <Modal isOpen={!!modalType} title={`Add New ${modalType === 'subject' ? 'Subject' : 'Chapter'}`} onClose={() => setModalType(null)}>
          <div className="space-y-6 pt-4 pb-2">
              <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Display Label</label>
                  <Input 
                    value={newItemName} 
                    onChange={(e) => { setNewItemName(e.target.value); if (!newItemId) setNewItemId(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')); }} 
                    autoFocus 
                    placeholder="e.g. Mathematics" 
                    className="!bg-slate-800 !border-slate-700 !text-white"
                  />
              </div>
              <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Database Reference (Slug)</label>
                  <Input 
                    value={newItemId} 
                    onChange={(e) => setNewItemId(e.target.value)} 
                    placeholder="e.g. math_2026" 
                    className="!bg-slate-800 !border-slate-700 !text-white"
                  />
              </div>
              <div className="flex gap-4 pt-4">
                  <Button variant="outline" fullWidth onClick={() => setModalType(null)} className="!border-slate-700 !text-slate-400">Abort</Button>
                  <Button fullWidth onClick={handleCreateItem}>Commit Change</Button>
              </div>
          </div>
      </Modal>
    </div>
  );
};