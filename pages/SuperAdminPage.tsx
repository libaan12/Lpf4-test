
import React, { useState, useEffect, useMemo, useContext } from 'react';
import { ref, update, onValue, off, set, remove, get, push, serverTimestamp, query, limitToLast, increment } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { UserProfile, Subject, Chapter, Question, MatchState, QuestionReport, LibraryViewLog, StudyMaterial } from '../types';
import { Button, Card, Input, Modal, Avatar, VerificationBadge } from '../components/UI';
import { showAlert, showToast, showConfirm, showPrompt } from '../services/alert';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../services/audioService';
import { read, utils, writeFile } from 'xlsx';

const formatRelativeTime = (timestamp: number | undefined) => {
    if (!timestamp) return 'Unknown';
    const now = Date.now();
    const diff = Math.floor((now - timestamp) / 1000); // seconds

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    
    return new Date(timestamp).toLocaleDateString();
};

const SuperAdminPage: React.FC = () => {
  const { profile: myProfile, loading: profileLoading } = useContext(UserContext);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [activeTab, setActiveTab] = useState<'home' | 'users' | 'quizzes' | 'arena' | 'reports' | 'visitors'>('home');
  const navigate = useNavigate();
  
  // UI State
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [visitorTab, setVisitorTab] = useState<'app' | 'library'>('app');

  // --- DATA STATES ---
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [matches, setMatches] = useState<MatchState[]>([]);
  const [reports, setReports] = useState<QuestionReport[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [libraryLogs, setLibraryLogs] = useState<LibraryViewLog[]>([]);
  
  // --- UI STATES ---
  const [searchTerm, setSearchTerm] = useState('');
  
  // Content Manager State
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [inputMode, setInputMode] = useState<'manual' | 'bulk' | 'parser'>('manual');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState<string[]>(['', '', '', '']); 
  const [correctAnswer, setCorrectAnswer] = useState(0);
  const [rawText, setRawText] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [modalType, setModalType] = useState<'subject' | 'chapter' | null>(null);
  
  // Report Handling State
  const [activeReport, setActiveReport] = useState<QuestionReport | null>(null);
  
  // User Management
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userPointsEdit, setUserPointsEdit] = useState<string>('');

  // --- AUTHENTICATION ---
  useEffect(() => {
      if (!profileLoading && myProfile?.roles?.superAdmin) {
          setIsAuthenticated(true);
      }
  }, [myProfile, profileLoading]);

  const checkPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1234') { 
        setIsAuthenticated(true); 
    } else {
        showAlert('Access Denied', 'Incorrect PIN', 'error');
    }
  };

  // --- DATA SYNC ---
  useEffect(() => {
    if (!isAuthenticated) return;

    const syncRefs = [
      { path: 'users', setter: (data: any) => setUsers(Object.keys(data || {}).map(k => ({ uid: k, ...data[k] }))) },
      { path: 'matches', setter: (data: any) => setMatches(Object.keys(data || {}).map(k => ({ ...data[k], matchId: k })).reverse()) },
      { path: 'reports', setter: (data: any) => setReports(Object.keys(data || {}).map(k => ({ ...data[k], id: k })).reverse()) },
      { path: 'subjects', setter: (data: any) => setSubjects(Object.values(data || {}).filter((s: any) => s && s.id && s.name) as Subject[]) },
    ];

    const unsubs = syncRefs.map(r => {
      const dbRef = ref(db, r.path);
      const listener = onValue(dbRef, (snap) => r.setter(snap.val()));
      return () => off(dbRef, 'value', listener);
    });

    const logsQuery = query(ref(db, 'analytics/libraryViews'), limitToLast(100));
    const logsUnsub = onValue(logsQuery, (snap) => {
        if (snap.exists()) {
            const data = snap.val();
            const logs = Object.keys(data).map(k => ({ id: k, ...data[k] })).reverse() as LibraryViewLog[];
            setLibraryLogs(logs);
        } else {
            setLibraryLogs([]);
        }
    });

    return () => {
        unsubs.forEach(fn => fn());
        logsUnsub();
    };
  }, [isAuthenticated]);

  // Load Chapters
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
            if (list.length > 0 && !list.find(c => c.id === selectedChapter)) {
                setSelectedChapter(list[0].id);
            }
        } else {
            setChapters([]);
            setSelectedChapter('');
        }
    });
    return () => off(chapRef);
  }, [selectedSubject]);

  // Load Questions
  useEffect(() => {
      if (!selectedChapter) {
          setQuestions([]);
          return;
      }
      const qRef = ref(db, `questions/${selectedChapter}`);
      const unsub = onValue(qRef, (snapshot) => {
          if (snapshot.exists()) {
              const data = snapshot.val();
              const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
              setQuestions(list);
          } else {
              setQuestions([]);
          }
      });
      return () => off(qRef);
  }, [selectedChapter]);

  // --- ACTIONS ---
  const toggleUserProp = async (uid: string, prop: string, current: any) => {
    try {
      await update(ref(db, `users/${uid}`), { [prop]: !current });
      showToast(`User ${prop} updated`);
    } catch(e) { showAlert("Error", "Action failed", "error"); }
  };

  const saveUserPoints = async () => {
      if (!selectedUser) return;
      const pts = parseInt(userPointsEdit);
      if (isNaN(pts)) return;
      await update(ref(db, `users/${selectedUser.uid}`), { points: pts });
      showToast("Points updated", "success");
  };

  const deleteUser = async (uid: string) => {
      if (await showConfirm("Delete User?", "This action is irreversible.", "Delete", "Cancel", "danger")) {
          await remove(ref(db, `users/${uid}`));
          setSelectedUser(null);
          showToast("User deleted", "success");
      }
  };

  const deleteReport = async (id: string) => {
      if (!await showConfirm("Dismiss Report?", "This will remove it from the list.")) return;
      await remove(ref(db, `reports/${id}`));
      showToast("Report dismissed");
  };

  const handleEditReport = async (report: QuestionReport) => {
      if (!report.chapterId || !report.questionId) {
          showAlert("Error", "Question reference missing", "error");
          return;
      }
      try {
          const qRef = ref(db, `questions/${report.chapterId}/${report.questionId}`);
          const snapshot = await get(qRef);
          if (snapshot.exists()) {
              setActiveReport(report);
              setEditingQuestion({ id: report.questionId, ...snapshot.val() });
          } else {
              showAlert("Error", "Question not found", "error");
          }
      } catch (e) {
          showAlert("Error", "Failed to load question", "error");
      }
  };

  const handleUpdateQuestion = async () => {
    if (!editingQuestion) return;
    const chapterId = activeReport ? activeReport.chapterId : editingQuestion.subject;
    const path = `questions/${chapterId}/${editingQuestion.id}`;
    
    try {
        await update(ref(db, path), {
            question: editingQuestion.question,
            options: editingQuestion.options,
            answer: editingQuestion.answer
        });

        if (activeReport && myProfile) {
            const reporterUid = activeReport.reporterUid;
            const participants = [myProfile.uid, reporterUid].sort();
            const chatId = `${participants[0]}_${participants[1]}`;
            const msgRef = push(ref(db, `chats/${chatId}/messages`));
            const msgId = msgRef.key!;
            const messageText = `✅ Report Resolved\n\nWe have reviewed your report regarding: "${activeReport.questionText.substring(0, 30)}..."\n\nThe question has been corrected. Thank you for making LP-F4 better!`;

            const updates: any = {};
            updates[`chats/${chatId}/messages/${msgId}`] = {
                id: msgId, sender: myProfile.uid, text: messageText, timestamp: serverTimestamp(), msgStatus: 'sent', type: 'text', chatId: chatId
            };
            updates[`chats/${chatId}/lastMessage`] = messageText;
            updates[`chats/${chatId}/lastTimestamp`] = serverTimestamp();
            updates[`chats/${chatId}/unread/${reporterUid}/count`] = increment(1);
            updates[`chats/${chatId}/participants/${myProfile.uid}`] = true;
            updates[`chats/${chatId}/participants/${reporterUid}`] = true;
            updates[`reports/${activeReport.id}`] = null;

            await update(ref(db), updates);
            showToast("Corrected & User Notified", "success");
            setActiveReport(null);
        } else {
            showToast("Question Updated", "success");
        }
        setEditingQuestion(null);
        playSound('correct');
    } catch (e) {
        showAlert("Error", "Failed to update question.", "error");
    }
  };

  const terminateMatch = async (matchId: string) => {
      const confirm = await showConfirm("Force End Match?", "This will immediately stop the game.");
      if (!confirm) return;
      try {
          await remove(ref(db, `matches/${matchId}`));
          showToast("Match Terminated", "success");
      } catch(e) { showToast("Failed", "error"); }
  };

  // --- CONTENT MANAGER LOGIC ---
  const handleCreateItem = async () => {
      if (!newItemName.trim()) return;
      const cleanId = newItemName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      try {
          if (modalType === 'subject') {
              await set(ref(db, `subjects/${cleanId}`), { id: cleanId, name: newItemName });
              setSelectedSubject(cleanId);
          } else if (modalType === 'chapter') {
              const fullChapterId = `${selectedSubject}_${cleanId}`;
              await set(ref(db, `chapters/${selectedSubject}/${fullChapterId}`), { id: fullChapterId, name: newItemName, subjectId: selectedSubject });
              setSelectedChapter(fullChapterId);
          }
          setNewItemName('');
          setModalType(null);
          showToast("Item created", "success");
      } catch (e) { showAlert("Error", "Create failed", "error"); }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedChapter) return;
      try {
          await push(ref(db, `questions/${selectedChapter}`), {
              question: questionText,
              options,
              answer: correctAnswer,
              subject: selectedChapter,
              createdAt: Date.now()
          });
          setQuestionText('');
          setOptions(['', '', '', '']);
          setCorrectAnswer(0);
          showToast("Question added", "success");
      } catch(e) { showAlert("Error", "Add failed", "error"); }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !selectedChapter) return;
      try {
          const buffer = await file.arrayBuffer();
          const wb = read(buffer, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data: any[][] = utils.sheet_to_json(ws, { header: 1 });
          const updates: any = {};
          let count = 0;
          data.slice(1).forEach(row => {
              if (row.length < 3) return;
              const qText = row[0];
              const opts = [row[1], row[2], row[3], row[4]].filter(o => o !== undefined).map(String);
              const ansIdx = parseInt(row[5]) - 1 || 0;
              const newKey = push(ref(db, `questions/${selectedChapter}`)).key;
              if (newKey) {
                  updates[`questions/${selectedChapter}/${newKey}`] = {
                      question: String(qText), options: opts, answer: ansIdx, subject: selectedChapter, createdAt: Date.now()
                  };
                  count++;
              }
          });
          if (count > 0) { await update(ref(db), updates); showToast(`Uploaded ${count} questions`, "success"); }
      } catch(e) { showAlert("Error", "Upload failed", "error"); }
      e.target.value = '';
  };

  const handleTextParse = async () => {
      if (!rawText.trim() || !selectedChapter) return;
      const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
      const updates: any = {};
      let count = 0;
      let currentQ: any = null;

      const saveCurrent = () => {
          if (currentQ && currentQ.options.length >= 2) {
              const newKey = push(ref(db, `questions/${selectedChapter}`)).key;
              if (newKey) {
                  updates[`questions/${selectedChapter}/${newKey}`] = {
                      question: currentQ.question, options: currentQ.options, answer: currentQ.answer, subject: selectedChapter, createdAt: Date.now()
                  };
                  count++;
              }
          }
      };

      lines.forEach(line => {
          const qMatch = line.match(/^(\d+)[\.\)]\s+(.+)/);
          if (qMatch) {
              saveCurrent();
              currentQ = { question: qMatch[2], options: [], answer: 0 };
              return;
          }
          const optMatch = line.match(/^([a-dA-D])[\.\)]\s+(.+)/);
          if (currentQ && optMatch) {
              currentQ.options.push(optMatch[2]);
              return;
          }
          const ansMatch = line.match(/^(?:Answer|Ans|Correct)\s*[:\-]?\s*([a-dA-D])/i);
          if (currentQ && ansMatch) {
              currentQ.answer = Math.max(0, ansMatch[1].toLowerCase().charCodeAt(0) - 97);
          }
      });
      saveCurrent();

      if (count > 0) { await update(ref(db), updates); setRawText(''); showToast(`Parsed ${count} questions`, "success"); }
      else showAlert("Error", "No valid questions found", "warning");
  };

  const handleDownloadTemplate = () => {
      const ws = utils.json_to_sheet([{ "Question": "Q1", "Option A": "A", "Option B": "B", "Option C": "C", "Option D": "D", "Correct Answer (1-4)": 1 }]);
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Template");
      writeFile(wb, "quiz_template.xlsx");
  };

  // --- UI HELPERS ---
  const getUserDetails = (uid: string) => users.find(u => u.uid === uid) || { uid, name: 'Unknown', avatar: '', points: 0, isVerified: false } as UserProfile;

  const SidebarItem = ({ id, icon, label, active }: { id: string, icon: string, label: string, active: boolean }) => (
      <button 
        onClick={() => { setActiveTab(id as any); setIsMobileMenuOpen(false); }}
        className={`w-full mb-2 rounded-2xl flex items-center transition-all duration-300 relative group overflow-hidden ${isSidebarExpanded ? 'px-4 py-3 gap-4' : 'justify-center py-3 w-12 h-12 mx-auto'} ${active ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/50'}`}
      >
          <i className={`fas ${icon} text-xl shrink-0`}></i>
          {isSidebarExpanded && <span className="font-bold text-sm uppercase tracking-wide whitespace-nowrap">{label}</span>}
          {active && <div className={`absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-cyan-400 rounded-r-full shadow-[0_0_10px_rgba(34,211,238,0.8)] ${isSidebarExpanded ? 'left-0' : '-left-1'}`}></div>}
      </button>
  );

  const StatCard = ({ title, value, sub, chartColor, icon }: { title: string, value: string, sub: string, chartColor: string, icon: string }) => (
      <div className="bg-[#1e293b]/50 backdrop-blur-md rounded-[2.5rem] p-6 relative overflow-hidden border border-white/5 shadow-xl group hover:border-white/10 transition-all hover:-translate-y-1">
          <div className={`absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity`}>
              <i className={`fas ${icon} text-6xl`} style={{color: chartColor}}></i>
          </div>
          <div className="relative z-10">
              <h3 className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">{title}</h3>
              <div className="text-4xl font-black text-white mb-2">{value}</div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/50 border border-white/10">
                  <span className="w-2 h-2 rounded-full" style={{backgroundColor: chartColor}}></span>
                  <span className="text-[10px] font-bold text-slate-300 uppercase">{sub}</span>
              </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1" style={{background: `linear-gradient(90deg, ${chartColor}22, ${chartColor})`}}></div>
      </div>
  );

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1120] p-6 font-sans">
        <div className="w-full max-w-sm bg-[#1e293b] border border-cyan-500/20 p-10 rounded-[2.5rem] shadow-[0_0_50px_rgba(34,211,238,0.1)] relative overflow-hidden text-center">
          <div className="w-20 h-20 bg-cyan-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-cyan-500/30 animate-pulse"><i className="fas fa-fingerprint text-4xl text-cyan-400"></i></div>
          <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-widest">System Locked</h1>
          <form onSubmit={checkPin}><input type="password" value={pin} onChange={e => setPin(e.target.value)} className="w-full bg-[#0b1120] border-2 border-slate-700 rounded-xl py-4 text-center text-2xl tracking-[0.5em] font-black text-cyan-400 focus:border-cyan-500 outline-none transition-all mb-6" placeholder="••••" autoFocus /><Button fullWidth className="bg-cyan-500 hover:bg-cyan-400 text-[#0b1120] font-black border-none py-4 rounded-xl">UNLOCK</Button></form>
        </div>
      </div>
    );
  }

  // Calculate Stats
  const activeMatches = matches.filter(m => m.status === 'active');
  const stats = {
      totalUsers: users.length,
      activeMatches: activeMatches.length,
      newUsers: users.filter(u => (u.createdAt || 0) > Date.now() - 86400000).length,
      reports: reports.length
  };

  // Calculate Library Stats
  const libraryStats = {
      totalViews: libraryLogs.length,
      uniqueReaders: new Set(libraryLogs.map(l => l.uid)).size,
      topResource: (() => {
          const counts: Record<string, number> = {};
          libraryLogs.forEach(l => { counts[l.fileName] = (counts[l.fileName] || 0) + 1; });
          return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
      })()
  };

  return (
    <div className="flex h-screen bg-[#0b1120] text-white font-sans overflow-hidden select-none">
        
        {/* Mobile Overlay */}
        {isMobileMenuOpen && <div className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>}

        {/* SIDEBAR */}
        <div className={`fixed inset-y-0 left-0 z-30 bg-[#0b1120] border-r border-slate-800 flex flex-col items-center py-8 transition-all duration-300 md:static md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'} ${isSidebarExpanded ? 'w-64' : 'w-20'}`}>
            <div className="flex items-center gap-3 mb-10 cursor-pointer px-2" onClick={() => navigate('/')}>
                <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0"><i className="fas fa-bolt text-xl text-white"></i></div>
                {isSidebarExpanded && <div className="overflow-hidden whitespace-nowrap animate__animated animate__fadeInLeft animate__faster"><h2 className="font-black text-lg tracking-tight">LP-ADMIN</h2><p className="text-[9px] text-cyan-500 font-bold uppercase tracking-[0.2em]">Console v2.0</p></div>}
            </div>
            
            <div className="flex-1 w-full px-3 flex flex-col gap-1 custom-scrollbar overflow-y-auto">
                <SidebarItem id="home" icon="fa-th-large" label="Dashboard" active={activeTab === 'home'} />
                <SidebarItem id="visitors" icon="fa-shoe-prints" label="Visitors & Logs" active={activeTab === 'visitors'} />
                <SidebarItem id="users" icon="fa-users" label="User Database" active={activeTab === 'users'} />
                <SidebarItem id="quizzes" icon="fa-layer-group" label="Content Mgr" active={activeTab === 'quizzes'} />
                <SidebarItem id="arena" icon="fa-gamepad" label="Live Arena" active={activeTab === 'arena'} />
                <SidebarItem id="reports" icon="fa-flag" label="Reports" active={activeTab === 'reports'} />
            </div>

            <div className="w-full px-4 flex flex-col gap-4 mt-4">
                <button onClick={() => setIsSidebarExpanded(!isSidebarExpanded)} className="w-full h-10 rounded-xl bg-slate-900 text-slate-500 hover:text-white hover:bg-slate-800 transition-all flex items-center justify-center border border-slate-800 hidden md:flex"><i className={`fas ${isSidebarExpanded ? 'fa-chevron-left' : 'fa-chevron-right'}`}></i></button>
                <button onClick={() => navigate('/')} className={`w-full h-10 rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center ${isSidebarExpanded ? 'justify-start px-4 gap-3' : 'justify-center'} transition-colors`}><i className="fas fa-sign-out-alt"></i>{isSidebarExpanded && <span className="text-xs font-bold uppercase">Exit Console</span>}</button>
            </div>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 flex flex-col relative overflow-hidden w-full bg-[#0b1120]">
            <header className="px-4 md:px-8 py-4 md:py-6 flex justify-between items-center border-b border-slate-800/50 bg-[#0b1120]/95 backdrop-blur-sm z-10">
                <div className="flex items-center gap-4">
                    <button onClick={() => { setIsMobileMenuOpen(true); setIsSidebarExpanded(true); }} className="md:hidden w-10 h-10 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center active:scale-95 transition-transform"><i className="fas fa-bars"></i></button>
                    <div><h1 className="text-xl md:text-2xl font-black text-white tracking-tight">SUPER ADMIN</h1><p className="text-[9px] font-black text-cyan-500 uppercase tracking-[0.3em]">Central Command</p></div>
                </div>
                <div className="flex items-center gap-4 md:gap-6">
                    <div className="relative cursor-pointer" onClick={() => setActiveTab('reports')}><i className="fas fa-bell text-slate-400 text-xl hover:text-white transition-colors"></i>{stats.reports > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_#ef4444]"></span>}</div>
                    <div className="flex items-center gap-3"><div className="text-right hidden sm:block"><div className="text-white font-bold text-sm">{myProfile?.name || 'Admin'}</div><div className="text-slate-500 text-[10px] uppercase font-black tracking-wider">Super Admin</div></div><div className="w-10 h-10 rounded-full bg-purple-500/20 border-2 border-purple-500 flex items-center justify-center overflow-hidden"><i className="fas fa-user-astronaut text-purple-400"></i></div></div>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar w-full">
                {activeTab === 'home' && (
                    <div className="max-w-7xl mx-auto space-y-8 animate__animated animate__fadeIn">
                        {/* Welcome Header */}
                        <div className="relative rounded-[2.5rem] overflow-hidden p-8 md:p-10 shadow-2xl">
                            <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-purple-600 opacity-90"></div>
                            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                                <div>
                                    <h2 className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tight">Welcome back, Admin</h2>
                                    <p className="text-indigo-200 font-bold max-w-md">System is running optimally. Check pending reports and live user activity.</p>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={() => setActiveTab('users')} className="bg-white text-indigo-600 px-6 py-3 rounded-xl font-black text-xs uppercase shadow-lg active:scale-95 transition-transform">Manage Users</button>
                                    <button onClick={() => setActiveTab('reports')} className="bg-indigo-900/30 text-white border border-white/20 px-6 py-3 rounded-xl font-black text-xs uppercase hover:bg-white/10 transition-colors">View Reports</button>
                                </div>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                            <StatCard title="Total Users" value={stats.totalUsers.toLocaleString()} sub="+12.5%" chartColor="#22d3ee" icon="fa-users" />
                            <StatCard title="Live Battles" value={stats.activeMatches.toString()} sub="Active" chartColor="#4ade80" icon="fa-gamepad" />
                            <StatCard title="New Recruits" value={stats.newUsers.toString()} sub="+24h" chartColor="#fb923c" icon="fa-user-plus" />
                            <StatCard title="Pending Reports" value={stats.reports.toString()} sub={stats.reports > 0 ? "Action Req" : "Clear"} chartColor="#f472b6" icon="fa-flag" />
                        </div>

                        {/* Recent Activity Mini-List */}
                        <div className="bg-[#1e293b]/50 backdrop-blur-md rounded-[2.5rem] border border-white/5 p-6 md:p-8">
                            <h3 className="font-black text-white uppercase tracking-widest text-sm mb-6 flex items-center gap-2"><i className="fas fa-history text-cyan-500"></i> Recent Signups</h3>
                            <div className="space-y-4">
                                {users.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5).map(u => (
                                    <div key={u.uid} className="flex items-center justify-between bg-slate-900/50 p-4 rounded-2xl border border-white/5">
                                        <div className="flex items-center gap-4">
                                            <Avatar src={u.avatar} seed={u.uid} size="sm" />
                                            <div>
                                                <div className="text-white font-bold text-sm">{u.name}</div>
                                                <div className="text-slate-500 text-xs font-mono">@{u.username || 'guest'}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-cyan-400 font-black text-xs">{formatRelativeTime(u.createdAt)}</div>
                                            <div className="text-slate-600 text-[10px] font-bold uppercase">Joined</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- USERS TAB --- */}
                {activeTab === 'users' && (
                    <div className="bg-[#1e293b] rounded-[2.5rem] p-4 md:p-8 border border-slate-700/50 min-h-[500px] animate__animated animate__fadeIn">
                        <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between items-center">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3"><i className="fas fa-users text-cyan-400"></i> User Database</h2>
                            <div className="relative w-full md:w-64"><i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i><input id="user-search" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full bg-[#0b1120] border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white text-sm font-bold focus:ring-2 focus:ring-cyan-500 outline-none" placeholder="Search users..." /></div>
                        </div>
                        <div className="space-y-3">
                            {users.filter(u => u.name?.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 50).map(u => (
                                <div key={u.uid} className="bg-[#0b1120] p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between group hover:border-cyan-500/30 border border-transparent transition-all gap-4">
                                    <div className="flex items-center gap-4">
                                        <Avatar src={u.avatar} seed={u.uid} size="sm" isVerified={u.isVerified} />
                                        <div>
                                            <div className="text-white font-bold text-sm flex items-center gap-2">{u.name}{u.banned && <span className="text-[8px] bg-red-500 px-1.5 rounded text-white uppercase font-black">Banned</span>}</div>
                                            <div className="text-slate-500 text-xs font-mono">@{u.username || 'guest'} • <span className="text-cyan-400">{u.points} PTS</span></div>
                                        </div>
                                    </div>
                                    <button onClick={() => { setSelectedUser(u); setUserPointsEdit(String(u.points)); }} className="bg-slate-800 hover:bg-cyan-500 hover:text-black text-cyan-400 px-4 py-2 rounded-xl text-xs font-black uppercase transition-colors w-full sm:w-auto">Manage</button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- ARENA TAB --- */}
                {activeTab === 'arena' && (
                    <div className="animate__animated animate__fadeIn space-y-6">
                        <div className="flex justify-between items-center mb-2 px-2">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                                <i className="fas fa-gamepad text-green-400"></i> Live Arena
                            </h2>
                            <div className="text-green-400 font-bold text-xs uppercase tracking-widest bg-green-900/20 px-3 py-1 rounded-full border border-green-500/20 animate-pulse">
                                {activeMatches.length} Matches In Progress
                            </div>
                        </div>
                        {activeMatches.length === 0 ? (
                            <div className="bg-[#1e293b] rounded-[2.5rem] p-10 text-center border border-slate-700/50">
                                <i className="fas fa-ghost text-4xl text-slate-600 mb-4"></i>
                                <p className="text-slate-500 font-bold text-sm uppercase tracking-wider">The arena is quiet.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {activeMatches.map(m => {
                                    const pIds = Object.keys(m.players || {});
                                    const p1 = m.players?.[pIds[0]];
                                    const p2 = m.players?.[pIds[1]];
                                    return (
                                        <div key={m.matchId} className="bg-[#1e293b] rounded-[2rem] p-5 border border-slate-700/50 shadow-lg relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 bg-green-500 text-black text-[10px] font-black px-3 py-1 rounded-bl-xl uppercase tracking-widest">Live</div>
                                            <div className="text-center mb-6 mt-2">
                                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{m.subjectTitle || 'Battle'}</div>
                                                <div className="text-white font-black text-xl">Q{m.currentQ + 1}</div>
                                            </div>
                                            <div className="flex justify-between items-center mb-6 px-2">
                                                <div className="text-center w-20">
                                                    <Avatar src={p1?.avatar} size="sm" className="mx-auto mb-2 border-2 border-slate-600" />
                                                    <div className="text-white font-bold text-xs truncate">{p1?.name}</div>
                                                    <div className="text-cyan-400 font-black text-lg">{m.scores?.[pIds[0]] || 0}</div>
                                                </div>
                                                <div className="text-slate-600 text-xl font-black italic">VS</div>
                                                <div className="text-center w-20">
                                                    <Avatar src={p2?.avatar} size="sm" className="mx-auto mb-2 border-2 border-slate-600" />
                                                    <div className="text-white font-bold text-xs truncate">{p2?.name}</div>
                                                    <div className="text-orange-400 font-black text-lg">{m.scores?.[pIds[1]] || 0}</div>
                                                </div>
                                            </div>
                                            <button onClick={() => terminateMatch(m.matchId)} className="w-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white py-3 rounded-xl font-black text-xs uppercase transition-all flex items-center justify-center gap-2 border border-red-500/20">
                                                <i className="fas fa-ban"></i> Terminate
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* --- VISITORS TAB (Redesigned) --- */}
                {activeTab === 'visitors' && (
                    <div className="animate__animated animate__fadeIn space-y-6">
                        {/* Sub-tab Navigation */}
                        <div className="flex bg-[#1e293b]/50 backdrop-blur-md rounded-2xl p-1 gap-1 mb-6 border border-white/5 shadow-inner max-w-md mx-auto">
                            <button
                                onClick={() => setVisitorTab('app')}
                                className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${visitorTab === 'app' ? 'bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <i className="fas fa-users mr-2"></i> App Activity
                            </button>
                            <button
                                onClick={() => setVisitorTab('library')}
                                className={`flex-1 py-3 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${visitorTab === 'library' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <i className="fas fa-book-reader mr-2"></i> Library Logs
                            </button>
                        </div>

                        {visitorTab === 'app' && (
                            <div className="space-y-6 animate__animated animate__fadeIn">
                                {/* Stats Row */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700/50 flex flex-col items-center justify-center relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-green-500/5 group-hover:bg-green-500/10 transition-colors"></div>
                                        <div className="text-3xl font-black text-white mb-1">{users.filter(u => u.isOnline).length}</div>
                                        <div className="text-[10px] font-black text-green-400 uppercase tracking-widest flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Online Now</div>
                                    </div>
                                    <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700/50 flex flex-col items-center justify-center relative overflow-hidden group">
                                         <div className="absolute inset-0 bg-cyan-500/5 group-hover:bg-cyan-500/10 transition-colors"></div>
                                        <div className="text-3xl font-black text-white mb-1">{users.filter(u => (u.lastSeen || 0) > Date.now() - 86400000).length}</div>
                                        <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Active Today</div>
                                    </div>
                                    <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700/50 flex flex-col items-center justify-center relative overflow-hidden group">
                                         <div className="absolute inset-0 bg-blue-500/5 group-hover:bg-blue-500/10 transition-colors"></div>
                                        <div className="text-3xl font-black text-white mb-1">{users.filter(u => (u.createdAt || 0) > Date.now() - 86400000).length}</div>
                                        <div className="text-[10px] font-black text-blue-400 uppercase tracking-widest">New Today</div>
                                    </div>
                                    <div className="bg-[#1e293b] p-4 rounded-2xl border border-slate-700/50 flex flex-col items-center justify-center relative overflow-hidden group">
                                         <div className="absolute inset-0 bg-purple-500/5 group-hover:bg-purple-500/10 transition-colors"></div>
                                        <div className="text-3xl font-black text-white mb-1">{users.filter(u => u.roles?.support).length}</div>
                                        <div className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Staff Online</div>
                                    </div>
                                </div>

                                {/* List */}
                                <div className="bg-[#1e293b] rounded-[2.5rem] border border-slate-700/50 overflow-hidden shadow-xl">
                                    <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-900/30">
                                        <h3 className="font-black text-white uppercase tracking-widest text-sm flex items-center gap-2"><i className="fas fa-clock text-cyan-500"></i> Recent Sessions</h3>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Live Feed</div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left table-auto">
                                            <thead className="bg-slate-900/50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                <tr>
                                                    <th className="py-4 pl-6 whitespace-nowrap">User</th>
                                                    <th className="py-4 whitespace-nowrap">Role</th>
                                                    <th className="py-4 whitespace-nowrap">Status</th>
                                                    <th className="py-4 text-right pr-6 whitespace-nowrap">Last Seen</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/50">
                                                {users.sort((a,b) => (b.lastSeen || 0) - (a.lastSeen || 0)).slice(0, 50).map(u => (
                                                    <tr key={u.uid} onClick={() => { setSelectedUser(u); setUserPointsEdit(String(u.points)); }} className="hover:bg-slate-800/30 transition-colors group cursor-pointer">
                                                        <td className="py-3 pl-6">
                                                            <div className="flex items-center gap-3">
                                                                <div className="relative">
                                                                    <Avatar src={u.avatar} seed={u.uid} size="sm" className="border border-slate-600" />
                                                                    {u.isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#1e293b]"></div>}
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-white text-sm flex items-center gap-1">{u.name} {u.isVerified && <VerificationBadge size="xs" className="text-blue-400" />}</div>
                                                                    <div className="text-xs text-slate-500 font-mono">@{u.username || 'guest'}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-3">
                                                            <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${u.roles?.superAdmin ? 'bg-purple-500/20 text-purple-400' : u.roles?.support ? 'bg-orange-500/20 text-orange-400' : 'bg-slate-800 text-slate-500'}`}>
                                                                {u.roles?.superAdmin ? 'Admin' : u.roles?.support ? 'Support' : 'User'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3">
                                                            {u.isOnline ? <span className="text-green-400 font-bold text-xs bg-green-900/10 px-2 py-1 rounded">Online</span> : <span className="text-slate-600 font-bold text-xs">Offline</span>}
                                                        </td>
                                                        <td className="py-3 text-right pr-6">
                                                            <div className="font-mono text-xs text-slate-400">{formatRelativeTime(u.lastSeen)}</div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {visitorTab === 'library' && (
                            <div className="space-y-6 animate__animated animate__fadeIn">
                                {/* Library Stats Row */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="bg-[#1e293b] p-5 rounded-2xl border border-slate-700/50 flex items-center justify-between group hover:border-indigo-500/30 transition-colors">
                                        <div>
                                            <div className="text-3xl font-black text-white mb-1">{libraryStats.totalViews}</div>
                                            <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Total File Views</div>
                                        </div>
                                        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                                            <i className="fas fa-eye text-xl"></i>
                                        </div>
                                    </div>
                                    <div className="bg-[#1e293b] p-5 rounded-2xl border border-slate-700/50 flex items-center justify-between group hover:border-pink-500/30 transition-colors">
                                        <div>
                                            <div className="text-3xl font-black text-white mb-1">{libraryStats.uniqueReaders}</div>
                                            <div className="text-[10px] font-black text-pink-400 uppercase tracking-widest">Unique Readers</div>
                                        </div>
                                        <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center text-pink-400">
                                            <i className="fas fa-user-check text-xl"></i>
                                        </div>
                                    </div>
                                    <div className="bg-[#1e293b] p-5 rounded-2xl border border-slate-700/50 flex items-center justify-between group hover:border-yellow-500/30 transition-colors">
                                        <div className="min-w-0">
                                            <div className="text-lg font-black text-white mb-1 truncate max-w-[150px]" title={libraryStats.topResource}>{libraryStats.topResource}</div>
                                            <div className="text-[10px] font-black text-yellow-400 uppercase tracking-widest">Top Resource</div>
                                        </div>
                                        <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-400 shrink-0">
                                            <i className="fas fa-crown text-xl"></i>
                                        </div>
                                    </div>
                                </div>

                                {/* Library Logs Table */}
                                <div className="bg-[#1e293b] rounded-[2.5rem] border border-slate-700/50 overflow-hidden shadow-xl">
                                    <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-900/30">
                                        <h3 className="font-black text-white uppercase tracking-widest text-sm flex items-center gap-2"><i className="fas fa-list-alt text-indigo-500"></i> Access Logs</h3>
                                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Last 100 Actions</div>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left table-auto">
                                            <thead className="bg-slate-900/50 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                <tr>
                                                    <th className="py-4 pl-6 whitespace-nowrap">Reader</th>
                                                    <th className="py-4 whitespace-nowrap">File Accessed</th>
                                                    <th className="py-4 text-right pr-6 whitespace-nowrap">Time</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/50">
                                                {libraryLogs.map(log => {
                                                    const u = getUserDetails(log.uid);
                                                    return (
                                                        <tr key={log.id} onClick={() => { setSelectedUser(u); setUserPointsEdit(String(u.points)); }} className="hover:bg-slate-800/30 transition-colors cursor-pointer">
                                                            <td className="py-3 pl-6">
                                                                <div className="flex items-center gap-3">
                                                                    <Avatar src={u.avatar} seed={u.uid} size="xs" />
                                                                    <span className="truncate max-w-[150px] font-bold text-sm text-slate-300">{u.name}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-3">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-6 h-6 rounded bg-red-900/20 text-red-400 flex items-center justify-center shrink-0"><i className="fas fa-file-pdf text-[10px]"></i></div>
                                                                    <span className="text-indigo-300 font-bold text-xs truncate max-w-[180px]">{log.fileName}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-3 text-right pr-6 text-slate-500 text-xs font-mono">{formatRelativeTime(log.timestamp)}</td>
                                                        </tr>
                                                    );
                                                })}
                                                {libraryLogs.length === 0 && (
                                                    <tr><td colSpan={3} className="py-12 text-center text-slate-500 italic uppercase text-xs font-bold tracking-widest">No activity logs found.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* --- QUIZZES (CONTENT MGR) TAB --- */}
                {activeTab === 'quizzes' && (
                    <div className="animate__animated animate__fadeIn space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
                            {/* Left Panel: Navigation */}
                            <div className="bg-[#1e293b] rounded-[2.5rem] p-6 border border-slate-700/50 flex flex-col h-full">
                                <div className="mb-6 flex justify-between items-center">
                                    <h3 className="font-black text-white uppercase tracking-widest text-sm">Hierarchy</h3>
                                    <div className="flex gap-2">
                                        <button onClick={() => setModalType('subject')} className="bg-cyan-500/20 text-cyan-400 p-2 rounded-lg hover:bg-cyan-500 hover:text-black transition-all"><i className="fas fa-folder-plus"></i></button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2">
                                    {subjects.map(sub => (
                                        <div key={sub.id} className="space-y-2">
                                            <div 
                                                onClick={() => setSelectedSubject(sub.id)}
                                                className={`p-3 rounded-xl cursor-pointer font-bold text-sm flex items-center justify-between transition-colors ${selectedSubject === sub.id ? 'bg-cyan-500 text-black' : 'bg-[#0b1120] text-slate-400 hover:text-white'}`}
                                            >
                                                <span>{sub.name}</span>
                                                {selectedSubject === sub.id && <button onClick={(e) => { e.stopPropagation(); setModalType('chapter'); }} className="text-black/50 hover:text-black"><i className="fas fa-plus-circle"></i></button>}
                                            </div>
                                            {selectedSubject === sub.id && (
                                                <div className="pl-4 space-y-1 border-l-2 border-slate-700 ml-2">
                                                    {chapters.map(chap => (
                                                        <div 
                                                            key={chap.id} 
                                                            onClick={() => setSelectedChapter(chap.id)}
                                                            className={`p-2 rounded-lg cursor-pointer text-xs font-bold transition-colors ${selectedChapter === chap.id ? 'text-cyan-400 bg-cyan-900/20' : 'text-slate-500 hover:text-slate-300'}`}
                                                        >
                                                            {chap.name}
                                                        </div>
                                                    ))}
                                                    {chapters.length === 0 && <div className="text-[10px] text-slate-600 italic px-2">No chapters</div>}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right Panel: Content */}
                            <div className="lg:col-span-2 bg-[#1e293b] rounded-[2.5rem] p-6 border border-slate-700/50 flex flex-col h-full relative overflow-hidden">
                                {selectedChapter ? (
                                    <>
                                        <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-700/50">
                                            <h3 className="font-black text-white uppercase tracking-tighter text-xl">
                                                <i className="fas fa-layer-group text-purple-400 mr-2"></i> 
                                                {chapters.find(c => c.id === selectedChapter)?.name || 'Editor'}
                                            </h3>
                                            <div className="flex bg-[#0b1120] rounded-xl p-1">
                                                <button onClick={() => setInputMode('manual')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${inputMode === 'manual' ? 'bg-purple-500 text-white' : 'text-slate-500'}`}>Manual</button>
                                                <button onClick={() => setInputMode('parser')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${inputMode === 'parser' ? 'bg-purple-500 text-white' : 'text-slate-500'}`}>Parse</button>
                                                <button onClick={() => setInputMode('bulk')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${inputMode === 'bulk' ? 'bg-purple-500 text-white' : 'text-slate-500'}`}>Excel</button>
                                            </div>
                                        </div>

                                        {/* Input Area */}
                                        <div className="mb-6 bg-[#0b1120] p-4 rounded-2xl border border-slate-700/50">
                                            {inputMode === 'manual' && (
                                                <form onSubmit={handleAddQuestion} className="space-y-4">
                                                    <Input value={questionText} onChange={e => setQuestionText(e.target.value)} placeholder="Question..." className="!bg-slate-800 !border-slate-700 !text-white" />
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {options.map((opt, i) => (
                                                            <div key={i} className="flex gap-2">
                                                                <button type="button" onClick={() => setCorrectAnswer(i)} className={`w-10 h-10 rounded-lg flex items-center justify-center font-black transition-colors ${correctAnswer === i ? 'bg-green-500 text-black' : 'bg-slate-800 text-slate-500'}`}>{String.fromCharCode(65+i)}</button>
                                                                <Input value={opt} onChange={e => { const n = [...options]; n[i] = e.target.value; setOptions(n); }} placeholder={`Option ${i+1}`} className="!bg-slate-800 !border-slate-700 !text-white !mb-0" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <Button type="submit" size="sm" fullWidth className="bg-purple-600 hover:bg-purple-500">Add Question</Button>
                                                </form>
                                            )}
                                            {inputMode === 'parser' && (
                                                <div className="space-y-4">
                                                    <textarea value={rawText} onChange={e => setRawText(e.target.value)} className="w-full h-32 bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-sm font-mono outline-none" placeholder="1. Question? a) Op1 b) Op2 Ans: a"></textarea>
                                                    <Button onClick={handleTextParse} size="sm" fullWidth className="bg-purple-600 hover:bg-purple-500">Parse & Add</Button>
                                                </div>
                                            )}
                                            {inputMode === 'bulk' && (
                                                <div className="flex gap-4 items-center justify-center py-6 border-2 border-dashed border-slate-700 rounded-xl hover:border-purple-500 transition-colors relative cursor-pointer">
                                                    <input type="file" accept=".xlsx" onChange={handleBulkUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                                    <div className="text-center">
                                                        <i className="fas fa-file-excel text-3xl text-green-500 mb-2"></i>
                                                        <div className="text-xs font-bold text-slate-400">Drop Excel File</div>
                                                    </div>
                                                    <button onClick={handleDownloadTemplate} className="absolute top-2 right-2 text-xs text-slate-500 hover:text-white z-20"><i className="fas fa-download"></i></button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Questions List */}
                                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                                            {questions.map((q, i) => (
                                                <div key={q.id} className="bg-[#0b1120] p-4 rounded-xl border border-slate-800 hover:border-slate-600 transition-colors group relative">
                                                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => setEditingQuestion(q)} className="text-cyan-400 hover:text-white"><i className="fas fa-edit"></i></button>
                                                        <button onClick={async () => { if(await showConfirm('Delete?','Irreversible')) { await remove(ref(db, `questions/${selectedChapter}/${q.id}`)); showToast('Deleted'); } }} className="text-red-500 hover:text-white"><i className="fas fa-trash"></i></button>
                                                    </div>
                                                    <div className="flex gap-3">
                                                        <span className="text-slate-600 font-mono text-xs">#{i+1}</span>
                                                        <div className="flex-1">
                                                            <p className="text-white font-bold text-sm mb-2">{q.question}</p>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                {q.options.map((o, idx) => (
                                                                    <div key={idx} className={`text-xs px-2 py-1 rounded border ${idx === q.answer ? 'bg-green-900/20 border-green-500/30 text-green-400' : 'border-slate-800 text-slate-500'}`}>{o}</div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {questions.length === 0 && <div className="text-center py-10 text-slate-500 italic">No questions yet.</div>}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-600">
                                        <i className="fas fa-arrow-left text-4xl mb-4 animate-bounce-slow"></i>
                                        <p className="font-bold text-sm uppercase tracking-widest">Select a Chapter</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'reports' && (
                    <div className="animate__animated animate__fadeIn space-y-6">
                        <div className="flex justify-between items-center mb-2 px-2">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                                <i className="fas fa-clipboard-list text-red-400"></i> Issue Center
                            </h2>
                            <div className="text-slate-500 font-bold text-xs">{reports.length} Pending</div>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {reports.length === 0 ? (
                                <div className="col-span-full py-20 text-center bg-[#1e293b] rounded-[2.5rem] border border-slate-700/50">
                                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-600 text-3xl"><i className="fas fa-check"></i></div>
                                    <h3 className="text-white font-bold text-lg">All Clear</h3>
                                    <p className="text-slate-500 text-xs font-bold mt-1">No pending reports to review.</p>
                                </div>
                            ) : (
                                reports.map(r => {
                                    const reporter = getUserDetails(r.reporterUid);
                                    return (
                                        <div key={r.id} className="bg-[#1e293b] rounded-[2rem] p-6 border border-slate-700/50 shadow-xl flex flex-col relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 bg-orange-500/20 text-orange-400 px-4 py-1.5 rounded-bl-2xl text-[10px] font-black uppercase tracking-widest border-l border-b border-orange-500/20">Action Req</div>
                                            <div className="flex items-center gap-3 mb-4">
                                                <Avatar src={reporter.avatar} size="md" className="border-2 border-slate-600" />
                                                <div>
                                                    <div className="text-white font-bold text-sm">{reporter.name}</div>
                                                    <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"><span>Reported {formatRelativeTime(r.timestamp)}</span></div>
                                                </div>
                                            </div>
                                            <div className="flex-1 bg-[#0b1120] rounded-xl p-4 border border-slate-800 mb-4 relative">
                                                <div className="absolute -left-1 top-4 w-1 h-8 bg-red-500 rounded-r-full"></div>
                                                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Category: {r.category || 'General'}</div>
                                                <p className="text-white font-bold text-sm leading-relaxed line-clamp-3 italic">"{r.questionText}"</p>
                                                {r.reason && <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400 font-medium"><i className="fas fa-comment-alt mr-2 text-slate-600"></i><span className="text-orange-400 font-bold">User Note:</span> {r.reason}</div>}
                                            </div>
                                            <div className="grid grid-cols-2 gap-3 mt-auto">
                                                <button onClick={() => deleteReport(r.id)} className="py-3 rounded-xl bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white font-black text-xs uppercase transition-all flex items-center justify-center gap-2"><i className="fas fa-times"></i> Dismiss</button>
                                                <button onClick={() => handleEditReport(r)} className="py-3 rounded-xl bg-game-primary text-white hover:bg-orange-600 font-black text-xs uppercase transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"><i className="fas fa-wrench"></i> Fix & Reply</button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* --- USER MODAL --- */}
        {selectedUser && (
            <Modal isOpen={true} title="User Manager" onClose={() => setSelectedUser(null)}>
                <div className="flex flex-col items-center mb-6 pt-2">
                    <Avatar src={selectedUser.avatar} seed={selectedUser.uid} size="xl" isVerified={selectedUser.isVerified} className="mb-4 border-4 border-slate-700 shadow-xl" />
                    <h2 className="text-2xl font-black text-white">{selectedUser.name}</h2>
                    <p className="text-slate-500 text-sm font-bold mb-4">@{selectedUser.username || 'guest'}</p>
                    <div className="grid grid-cols-2 gap-4 w-full mb-6">
                        <div className="bg-[#0b1120] p-3 rounded-xl text-center border border-slate-800"><div className="text-[10px] text-slate-500 uppercase font-black">Points</div><div className="text-xl text-cyan-400 font-black">{selectedUser.points}</div></div>
                        <div className="bg-[#0b1120] p-3 rounded-xl text-center border border-slate-800"><div className="text-[10px] text-slate-500 uppercase font-black">Role</div><div className="text-sm text-white font-bold">{selectedUser.roles?.superAdmin ? 'Super Admin' : selectedUser.roles?.support ? 'Staff' : 'User'}</div></div>
                    </div>
                    <div className="w-full space-y-4">
                        <div className="p-4 bg-[#0b1120] rounded-2xl border border-slate-800">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Quick Actions</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => toggleUserProp(selectedUser.uid, 'isVerified', selectedUser.isVerified)} className={`py-2 rounded-lg text-xs font-black uppercase ${selectedUser.isVerified ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'}`}>{selectedUser.isVerified ? 'Unverify' : 'Verify'}</button>
                                <button onClick={() => toggleUserProp(selectedUser.uid, 'banned', selectedUser.banned)} className={`py-2 rounded-lg text-xs font-black uppercase ${selectedUser.banned ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-slate-700 text-slate-400 border border-slate-600'}`}>{selectedUser.banned ? 'Unban' : 'Ban User'}</button>
                                <button onClick={() => deleteUser(selectedUser.uid)} className="py-2 rounded-lg text-xs font-black uppercase bg-red-600 text-white hover:bg-red-700 col-span-2">Delete User</button>
                            </div>
                        </div>
                        <div className="p-4 bg-[#0b1120] rounded-2xl border border-slate-800">
                             <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Adjust Points</label>
                             <div className="flex gap-2">
                                 <Input type="number" value={userPointsEdit} onChange={e => setUserPointsEdit(e.target.value)} className="!bg-slate-800 !border-slate-700 !text-white !mb-0" />
                                 <Button onClick={saveUserPoints} size="sm">Save</Button>
                             </div>
                        </div>
                    </div>
                </div>
            </Modal>
        )}

        {/* --- CORRECTION MODAL --- */}
        {editingQuestion && (
            <Modal isOpen={true} title="Correction Studio" onClose={() => { setEditingQuestion(null); setActiveReport(null); }}>
                <div className="space-y-6 pt-4 pb-2">
                    {activeReport && (
                        <div className="bg-orange-500/10 border border-orange-500/30 p-3 rounded-xl flex items-center gap-3">
                            <i className="fas fa-info-circle text-orange-500 text-xl"></i>
                            <div className="text-xs text-orange-200"><span className="font-bold uppercase tracking-wide block text-orange-400">Auto-Response Enabled</span>Saving changes will notify the reporter automatically.</div>
                        </div>
                    )}
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 mb-2 block">Question Text</label>
                        <Input value={editingQuestion.question} onChange={(e) => setEditingQuestion({...editingQuestion, question: e.target.value})} className="!bg-[#0b1120] !border-slate-700 !text-white !p-4 !rounded-2xl" />
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">Answer Options</label>
                        {editingQuestion.options.map((opt, i) => (
                            <div key={i} className="flex gap-2">
                                <button onClick={() => setEditingQuestion({...editingQuestion, answer: i})} className={`w-12 h-12 shrink-0 rounded-xl bg-[#0b1120] border transition-all font-black ${editingQuestion.answer === i ? 'border-green-500 text-green-500 bg-green-500/10' : 'border-slate-700 text-slate-500'}`}>{String.fromCharCode(65+i)}</button>
                                <Input value={opt} onChange={(e) => { const newOpts = [...editingQuestion.options]; newOpts[i] = e.target.value; setEditingQuestion({...editingQuestion, options: newOpts}); }} className="!bg-[#0b1120] !border-slate-700 !text-white !mb-0" />
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-3 pt-2">
                        <Button variant="secondary" fullWidth onClick={() => { setEditingQuestion(null); setActiveReport(null); }}>Cancel</Button>
                        <Button fullWidth onClick={handleUpdateQuestion}>{activeReport ? 'Save & Notify User' : 'Save Changes'}</Button>
                    </div>
                </div>
            </Modal>
        )}

        {/* --- CREATE MODAL --- */}
        <Modal isOpen={!!modalType} title={`Add New ${modalType}`} onClose={() => setModalType(null)}>
            <div className="space-y-4">
                <Input value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Enter Name" className="!bg-slate-800 !border-slate-700 !text-white" autoFocus />
                <Button fullWidth onClick={handleCreateItem}>Create</Button>
            </div>
        </Modal>
    </div>
  );
};

export default SuperAdminPage;
