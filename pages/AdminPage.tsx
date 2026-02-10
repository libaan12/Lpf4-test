
import React, { useState, useEffect } from 'react';
import { ref, push, set, get, remove, onValue, off, update } from 'firebase/database';
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
  const [pdfSource, setPdfSource] = useState<'link' | 'upload'>('link');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfExternalUrl, setPdfExternalUrl] = useState('');
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfSubject, setPdfSubject] = useState('');
  
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
              setStudyMaterials(Object.values(data));
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
      
      if (!pdfTitle || !pdfSubject) {
          showAlert("Missing Info", "Please provide a title and subject.", "warning");
          return;
      }

      setLoading(true);
      
      try {
          if (pdfSource === 'link') {
              if (!pdfExternalUrl.trim()) {
                  showAlert("Missing Info", "Please provide a valid PDF link.", "warning");
                  setLoading(false);
                  return;
              }
              const newRef = push(ref(db, 'studyMaterials'));
              await set(newRef, {
                  id: newRef.key,
                  fileName: pdfTitle,
                  subjectName: pdfSubject,
                  fileURL: pdfExternalUrl.trim(),
                  fileSize: "External",
                  uploadDate: Date.now()
              });
              
              setPdfExternalUrl('');
              setPdfTitle('');
              setPdfSubject('');
              showAlert("Success", "Resource Link Saved!", "success");
              setLoading(false);
          } else {
              if (!pdfFile) {
                  showAlert("Missing Info", "Please select a file to upload.", "warning");
                  setLoading(false);
                  return;
              }
              if (pdfFile.size > 5 * 1024 * 1024) { 
                  showAlert("Too Large", "File exceeds 5MB. Use 'Link' instead.", "error");
                  setLoading(false);
                  return;
              }

              const reader = new FileReader();
              reader.onload = async () => {
                  const base64Data = reader.result as string;
                  const newRef = push(ref(db, 'studyMaterials'));
                  await set(newRef, {
                      id: newRef.key,
                      fileName: pdfTitle,
                      subjectName: pdfSubject,
                      fileURL: base64Data,
                      fileSize: (pdfFile.size / (1024 * 1024)).toFixed(2) + ' MB',
                      uploadDate: Date.now()
                  });

                  setPdfFile(null);
                  setPdfTitle('');
                  setPdfSubject('');
                  showAlert("Success", "PDF Uploaded!", "success");
                  setLoading(false);
              };
              reader.readAsDataURL(pdfFile);
          }
      } catch(e) {
          console.error(e);
          showAlert("Error", "Action failed.", "error");
          setLoading(false);
      }
  };

  const handleDeletePdf = async (item: StudyMaterial) => {
      const confirm = await showConfirm("Delete PDF?", "This file will be permanently removed.");
      if (!confirm) return;
      try {
          await remove(ref(db, `studyMaterials/${item.id}`));
          showToast("PDF Deleted", "success");
      } catch(e) {
          showAlert("Error", "Failed to delete PDF.", "error");
      }
  };

  return (
    <div className="min-h-screen p-4 pb-20 pt-20 transition-colors max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-700/50 shadow-sm flex items-center justify-between px-4 py-3 transition-colors duration-300">
        <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-game-primary dark:hover:text-blue-400 transition-colors shadow-sm">
                <i className="fas fa-arrow-left"></i>
            </button>
            <h1 className="text-xl md:text-2xl font-black text-gray-800 dark:text-white uppercase tracking-tight">Admin Panel</h1>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
          <button 
            onClick={() => setActiveTab('quizzes')} 
            className={`flex-1 py-3 rounded-2xl font-black uppercase text-xs tracking-wider transition-all ${activeTab === 'quizzes' ? 'bg-game-primary text-white shadow-lg' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}
          >
            <i className="fas fa-list-ul mr-2"></i> Quiz Manager
          </button>
          <button 
            onClick={() => setActiveTab('pdfs')} 
            className={`flex-1 py-3 rounded-2xl font-black uppercase text-xs tracking-wider transition-all ${activeTab === 'pdfs' ? 'bg-game-primary text-white shadow-lg' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}
          >
            <i className="fas fa-file-pdf mr-2"></i> PDF Manager
          </button>
      </div>

      {activeTab === 'quizzes' ? (
        <div className="grid gap-6 animate__animated animate__fadeIn">
            <Card className="border-l-8 border-game-primary">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-bold text-gray-900 dark:text-gray-200 uppercase tracking-wide">Subject</label>
                        <div className="flex gap-2">
                             {selectedSubject && (
                                <button onClick={handleDeleteSubject} className="text-[10px] uppercase font-bold text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded transition-colors">Delete</button>
                             )}
                            <button onClick={() => setModalType('subject')} className="text-[10px] uppercase font-bold text-game-primary hover:text-blue-600 bg-blue-50 dark:bg-blue-500/10 px-2 py-1 rounded transition-colors">+ New</button>
                        </div>
                    </div>
                    <div className="relative">
                        <select 
                            value={selectedSubject} 
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            className="w-full p-3 bg-slate-100 text-gray-900 dark:bg-slate-900 dark:text-white border-2 border-slate-200 dark:border-slate-700 rounded-xl appearance-none font-bold focus:ring-4 focus:ring-game-primary/20 focus:border-game-primary transition-all cursor-pointer"
                        >
                            <option value="">Select Subject</option>
                            {subjects.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                        <i className="fas fa-chevron-down absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-400"></i>
                    </div>
                </div>

                <div className={`${!selectedSubject ? 'opacity-50 pointer-events-none' : ''}`}>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-bold text-gray-900 dark:text-gray-200 uppercase tracking-wide">Chapter</label>
                        <div className="flex gap-2">
                             {selectedChapter && (
                                <button onClick={handleDeleteChapter} className="text-[10px] uppercase font-bold text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded transition-colors">Delete</button>
                             )}
                            <button onClick={() => setModalType('chapter')} className="text-[10px] uppercase font-bold text-game-primary hover:text-blue-600 bg-blue-50 dark:bg-blue-500/10 px-2 py-1 rounded transition-colors">+ New</button>
                        </div>
                    </div>
                    <div className="relative">
                        <select 
                            value={selectedChapter} 
                            onChange={(e) => setSelectedChapter(e.target.value)}
                            className="w-full p-3 bg-slate-100 text-gray-900 dark:bg-slate-900 dark:text-white border-2 border-slate-200 dark:border-slate-700 rounded-xl appearance-none font-bold focus:ring-4 focus:ring-game-primary/20 focus:border-game-primary transition-all cursor-pointer"
                            disabled={!selectedSubject || chapters.length === 0}
                        >
                            {chapters.length === 0 && <option value="">No chapters</option>}
                            {chapters.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <i className="fas fa-chevron-down absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-400"></i>
                    </div>
                </div>
            </div>
        </Card>

        <Card className={`${!selectedChapter ? 'opacity-50 pointer-events-none grayscale' : ''} transition-all`}>
          <div className="flex items-center justify-between mb-6 border-b border-gray-100 dark:border-gray-700 pb-4 flex-wrap gap-3">
            <h2 className="text-lg md:text-xl font-bold dark:text-white flex items-center gap-2">
                <i className={`fas ${inputMode === 'manual' ? 'fa-plus' : inputMode === 'parser' ? 'fa-magic' : 'fa-file-excel'} text-game-primary`}></i>
                {inputMode === 'manual' ? 'Add Question' : inputMode === 'parser' ? 'Text Parser' : 'Bulk Upload'}
            </h2>
            <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1 gap-1">
                <button onClick={() => setInputMode('manual')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${inputMode === 'manual' ? 'bg-white dark:bg-gray-700 shadow text-game-primary dark:text-white' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>Manual</button>
                <button onClick={() => setInputMode('parser')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${inputMode === 'parser' ? 'bg-white dark:bg-gray-700 shadow text-purple-600 dark:text-purple-300' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>Parser</button>
                <button onClick={() => setInputMode('bulk')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${inputMode === 'bulk' ? 'bg-white dark:bg-gray-700 shadow text-green-600 dark:text-green-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>Excel</button>
            </div>
          </div>
          
          {inputMode === 'manual' && (
            <form onSubmit={handleAddQuestion} className="space-y-4">
                <Input label="Question Text" value={questionText} onChange={(e) => setQuestionText(e.target.value)} placeholder="Type question here..." />
                
                <div>
                    <label className="block text-xs font-bold mb-2 text-gray-500 dark:text-gray-400 uppercase tracking-wide">Options</label>
                    <div className="space-y-3">
                        {options.map((opt, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <div 
                                    className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold cursor-pointer transition-all border-2 ${idx === correctAnswer ? 'bg-green-50 border-green-600 text-white shadow-lg scale-105' : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`} 
                                    onClick={() => setCorrectAnswer(idx)}
                                >
                                    {String.fromCharCode(65 + idx)}
                                </div>
                                <div className="flex-1 relative">
                                    <input 
                                        className={`w-full p-3 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white border-2 rounded-xl transition-all font-medium focus:outline-none ${idx === correctAnswer ? 'border-green-500 dark:border-green-600 ring-2 ring-green-500/20' : 'border-slate-200 dark:border-slate-700 focus:border-game-primary'}`}
                                        value={opt}
                                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                                        placeholder={`Option ${idx + 1}`}
                                    />
                                    {options.length > 2 && (
                                        <button type="button" onClick={() => handleRemoveOption(idx)} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-300 hover:text-red-500 transition-colors">
                                            <i className="fas fa-times"></i>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    {options.length < 6 && (
                        <button type="button" onClick={handleAddOption} className="mt-4 text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-game-primary dark:text-blue-400 font-bold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors">
                            <i className="fas fa-plus"></i> Add Option
                        </button>
                    )}
                </div>
                <Button type="submit" fullWidth isLoading={loading} className="mt-2"><i className="fas fa-save mr-2"></i> Save Question</Button>
            </form>
          )}

          {inputMode === 'parser' && (
              <div className="space-y-4">
                  <textarea 
                    className="w-full h-48 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white focus:outline-none focus:border-purple-500 font-mono text-sm resize-none"
                    placeholder="1. Question text? a) Option 1 Answer: a"
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                  ></textarea>
                  <Button fullWidth onClick={handleTextParse} isLoading={loading} className="!bg-purple-600 hover:!bg-purple-700 text-white">
                      <i className="fas fa-magic mr-2"></i> Parse & Upload
                  </Button>
              </div>
          )}

          {inputMode === 'bulk' && (
             <div className="space-y-6">
                 <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                     <p className="text-xs text-blue-700 dark:text-blue-200/80 mb-3">Upload Excel with: Question, Option A, B, C, D, Correct (1-4).</p>
                     <button onClick={handleDownloadTemplate} className="bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-300 px-3 py-2 rounded-lg font-bold text-xs shadow-sm border border-blue-100">
                        <i className="fas fa-download mr-1"></i> Template
                     </button>
                 </div>
                 <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-8 text-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors relative group">
                     <input type="file" accept=".xlsx, .xls" onChange={handleBulkUpload} disabled={loading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                     <i className="fas fa-file-excel text-5xl text-green-500 mb-3"></i>
                     <p className="font-bold dark:text-white">Drop Excel File Here</p>
                 </div>
             </div>
          )}
        </Card>

        <Card>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold dark:text-white">Question Bank</h2>
            <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded text-xs font-bold border border-slate-200 dark:border-slate-700">{questions.length} Items</span>
          </div>
          
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
            {questions.length === 0 ? (
                <div className="text-center py-16 opacity-50 font-bold">No questions yet</div>
            ) : (
                questions.map((q) => (
                <div key={q.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 relative group shadow-sm">
                    <button onClick={() => handleDeleteQuestion(q.id)} className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-red-50 text-red-400 hover:text-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><i className="fas fa-trash"></i></button>
                    <div className="pr-10"><p className="font-bold text-gray-800 dark:text-white text-sm mb-3">{q.question}</p></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {q.options.map((opt, i) => (
                        <div key={i} className={`p-2 rounded-lg border flex items-center gap-2 ${i === q.answer ? 'bg-green-50 border-green-200 text-green-700 font-bold' : 'bg-slate-50 border-slate-100 text-slate-700'}`}>
                           <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] ${i === q.answer ? 'bg-green-200 text-green-800' : 'bg-slate-200 text-slate-600'}`}>{String.fromCharCode(65 + i)}</span> 
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
      ) : (
        <div className="grid gap-6 animate__animated animate__fadeIn">
            {/* PDF UPLOAD CARD */}
            <Card>
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
                        <i className="fas fa-file-export text-game-primary"></i> Add Resource
                    </h2>
                    <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-1">
                        <button onClick={() => setPdfSource('link')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${pdfSource === 'link' ? 'bg-white dark:bg-gray-700 text-game-primary shadow-sm' : 'text-slate-500'}`}>Link</button>
                        <button onClick={() => setPdfSource('upload')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${pdfSource === 'upload' ? 'bg-white dark:bg-gray-700 text-game-primary shadow-sm' : 'text-slate-500'}`}>File</button>
                    </div>
                </div>
                <form onSubmit={handlePdfUpload} className="space-y-4">
                    <Input label="Display Title" value={pdfTitle} onChange={(e) => setPdfTitle(e.target.value)} placeholder="e.g. Chapter 1 Notes" />
                    
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 ml-1">Subject</label>
                        <select 
                            value={pdfSubject} 
                            onChange={(e) => setPdfSubject(e.target.value)}
                            className="w-full p-3 bg-slate-100 text-gray-900 dark:bg-slate-900 dark:text-white border-2 border-slate-200 dark:border-slate-700 rounded-xl font-bold cursor-pointer"
                        >
                            <option value="">Select Subject</option>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>

                    {pdfSource === 'link' ? (
                        <Input label="PDF URL (External Link)" value={pdfExternalUrl} onChange={(e) => setPdfExternalUrl(e.target.value)} placeholder="https://..." />
                    ) : (
                        <div>
                            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2 ml-1">PDF File (Max 5MB)</label>
                            <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-6 text-center hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors relative">
                                <input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                {pdfFile ? <div className="text-green-500 font-bold"><i className="fas fa-check-circle"></i> {pdfFile.name}</div> : <div className="text-gray-400 font-bold text-sm"><i className="fas fa-cloud-upload-alt text-2xl mb-1"></i><p>Select PDF File</p></div>}
                            </div>
                        </div>
                    )}

                    <Button type="submit" fullWidth isLoading={loading} disabled={!pdfTitle || !pdfSubject}>
                        <i className="fas fa-save mr-2"></i> Save Resource
                    </Button>
                </form>
            </Card>

            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold dark:text-white">Resources List</h2>
                </div>
                <div className="space-y-3">
                    {studyMaterials.length === 0 ? (
                        <div className="text-center py-10 opacity-50 font-bold">No resources added.</div>
                    ) : (
                        studyMaterials.map(item => {
                            const isExternal = item.fileSize === 'External';
                            return (
                                <div key={item.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-700 flex items-center justify-between shadow-sm">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${isExternal ? 'bg-blue-100 text-blue-500' : 'bg-red-100 text-red-500'}`}>
                                            <i className={`fas ${isExternal ? 'fa-link' : 'fa-file-pdf'}`}></i>
                                        </div>
                                        <div className="truncate">
                                            <h4 className="font-bold text-slate-800 dark:text-white text-sm truncate">{item.fileName}</h4>
                                            <div className="text-[10px] text-slate-500 font-bold uppercase">{item.fileSize}</div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleDeletePdf(item)} className="w-8 h-8 rounded-lg bg-slate-100 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"><i className="fas fa-trash text-xs"></i></button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </Card>
        </div>
      )}

      <Modal isOpen={!!modalType} title={`Create ${modalType === 'subject' ? 'Subject' : 'Chapter'}`}>
          <div className="space-y-4 pt-2">
              <Input label="Name" value={newItemName} onChange={(e) => { setNewItemName(e.target.value); if (!newItemId) setNewItemId(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')); }} autoFocus placeholder="e.g. Mathematics" />
              <Input label="ID (Auto-generated)" value={newItemId} onChange={(e) => setNewItemId(e.target.value)} placeholder="e.g. mathematics" />
              <div className="flex gap-3 pt-4">
                  <Button variant="outline" fullWidth onClick={() => setModalType(null)}>Cancel</Button>
                  <Button fullWidth onClick={handleCreateItem}>Create Item</Button>
              </div>
          </div>
      </Modal>
    </div>
  );
};
