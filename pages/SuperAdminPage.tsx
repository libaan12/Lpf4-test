
import React, { useState, useEffect } from 'react';
import { ref, update, onValue, off, set, remove, get } from 'firebase/database';
import { db } from '../firebase';
import { UserProfile, Subject, Chapter, Question, MatchState, QuestionReport } from '../types';
import { Button, Card, Input, Modal, Avatar } from '../components/UI';
import { showAlert, showToast, showConfirm } from '../services/alert';
import { useNavigate } from 'react-router-dom';

const SuperAdminPage: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'quizzes' | 'matches' | 'reports'>('users');
  const navigate = useNavigate();
  
  // --- USER MANAGEMENT STATE ---
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);

  // --- QUIZ MANAGEMENT STATE ---
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  
  // --- MATCH MANAGEMENT STATE ---
  const [matches, setMatches] = useState<MatchState[]>([]);

  // --- REPORT MANAGEMENT STATE ---
  const [reports, setReports] = useState<QuestionReport[]>([]);
  
  // Editing Question
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  // INITIAL AUTH & SETTINGS
  useEffect(() => {
    if (isAuthenticated) {
        // Listen for AI Settings
        const settingsRef = ref(db, 'settings/aiAssistantEnabled');
        const handleSettings = (snap: any) => {
             setAiEnabled(snap.exists() ? snap.val() : true);
        };
        const unsubSettings = onValue(settingsRef, handleSettings);

        return () => {
            off(settingsRef, 'value', handleSettings);
        }
    }
  }, [isAuthenticated]);

  // FETCH USERS (Only when tab is users)
  useEffect(() => {
      if (isAuthenticated && activeTab === 'users') {
        setLoading(true);
        const userRef = ref(db, 'users');
        const handleData = (snap: any) => {
            if (snap.exists()) {
                const data = snap.val();
                const list: UserProfile[] = Object.keys(data).map(key => ({ uid: key, ...data[key] }));
                setUsers(list);
            } else { setUsers([]); }
            setLoading(false);
        };
        const unsubscribe = onValue(userRef, handleData);
        return () => off(userRef, 'value', handleData);
      }
  }, [isAuthenticated, activeTab]);

  // FILTER USERS
  useEffect(() => {
      if (searchTerm.trim() === '') {
          setFilteredUsers(users);
      } else {
          const lower = searchTerm.toLowerCase();
          setFilteredUsers(users.filter(u => 
              (u.name && u.name.toLowerCase().includes(lower)) || 
              (u.username && u.username.toLowerCase().includes(lower)) ||
              (u.email && u.email.toLowerCase().includes(lower))
          ));
      }
  }, [searchTerm, users]);

  // FETCH SUBJECTS (Only when tab is quizzes)
  useEffect(() => {
      if (isAuthenticated && activeTab === 'quizzes') {
          const subRef = ref(db, 'subjects');
          const handleSub = (snap: any) => {
              if (snap.exists()) {
                const list = (Object.values(snap.val()) as Subject[]).filter(s => s && s.id && s.name);
                setSubjects(list);
              } else {
                setSubjects([]);
              }
          };
          onValue(subRef, handleSub);
          return () => off(subRef);
      }
  }, [isAuthenticated, activeTab]);

  // FETCH MATCHES (Only when tab is matches)
  useEffect(() => {
      if (isAuthenticated && activeTab === 'matches') {
          const matchesRef = ref(db, 'matches');
          const handleMatches = (snap: any) => {
              if (snap.exists()) {
                  const data = snap.val();
                  // Map and sort by newest first
                  const list: MatchState[] = Object.keys(data).map(key => ({ ...data[key], matchId: key }));
                  setMatches(list.reverse());
              } else {
                  setMatches([]);
              }
          };
          onValue(matchesRef, handleMatches);
          return () => off(matchesRef);
      }
  }, [isAuthenticated, activeTab]);

  // FETCH REPORTS
  useEffect(() => {
      if (isAuthenticated && activeTab === 'reports') {
          const reportsRef = ref(db, 'reports');
          const handleReports = (snap: any) => {
              if (snap.exists()) {
                  const data = snap.val();
                  const list: QuestionReport[] = Object.keys(data).map(key => ({ ...data[key], id: key }));
                  setReports(list.reverse());
              } else {
                  setReports([]);
              }
          };
          onValue(reportsRef, handleReports);
          return () => off(reportsRef);
      }
  }, [isAuthenticated, activeTab]);

  // FETCH CHAPTERS
  useEffect(() => {
      if (selectedSubject) {
          const chapRef = ref(db, `chapters/${selectedSubject}`);
          onValue(chapRef, (snap) => {
              if (snap.exists()) {
                  setChapters(Object.values(snap.val()) as Chapter[]);
              } else {
                  setChapters([]);
              }
          });
      } else {
          setChapters([]);
          setSelectedChapter('');
      }
  }, [selectedSubject]);

  // FETCH QUESTIONS
  useEffect(() => {
      if (selectedChapter) {
          const qRef = ref(db, `questions/${selectedChapter}`);
          onValue(qRef, (snap) => {
              if (snap.exists()) {
                  const data = snap.val();
                  const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
                  setQuestions(list);
              } else {
                  setQuestions([]);
              }
          });
      } else {
          setQuestions([]);
      }
  }, [selectedChapter]);

  const checkPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1234') { setIsAuthenticated(true); } else {
        showAlert('Access Denied', 'Incorrect PIN', 'error');
    }
  };

  // --- USER ACTIONS ---

  const toggleRole = async (uid: string, currentRole?: string) => {
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      try {
        await update(ref(db, `users/${uid}`), { role: newRole });
        showToast(`User is now ${newRole}`, 'success');
        if (selectedUser && selectedUser.uid === uid) {
            setSelectedUser({ ...selectedUser, role: newRole as 'admin' | 'user' });
        }
      } catch (e) {
        showAlert('Error', 'Failed to update role', 'error');
      }
  };

  const toggleBan = async (uid: string, currentBanStatus?: boolean) => {
      const newStatus = !currentBanStatus;
      const action = newStatus ? 'Banned' : 'Unbanned';
      
      const confirmed = await showConfirm(
          `${action} User?`, 
          `Are you sure you want to ${newStatus ? 'BAN' : 'UNBAN'} this user? They will ${newStatus ? 'lose access immediately' : 'regain access'}.`
      );

      if (!confirmed) return;

      try {
          await update(ref(db, `users/${uid}`), { banned: newStatus });
          if (newStatus) {
              await update(ref(db, `users/${uid}`), { activeMatch: null });
          }
          showToast(`User ${action}`, 'success');
          if (selectedUser && selectedUser.uid === uid) {
              setSelectedUser({ ...selectedUser, banned: newStatus });
          }
      } catch (e) {
          showAlert('Error', `Failed to ${action} user`, 'error');
      }
  };
  
  const toggleVerification = async (uid: string, currentStatus?: boolean) => {
      const newStatus = !currentStatus;
      // Set the pending flag only when turning verification ON
      const updates: any = { isVerified: newStatus };
      if (newStatus) {
          updates.verificationNotificationPending = true;
      }

      try {
          await update(ref(db, `users/${uid}`), updates);
          showToast(newStatus ? 'User Verified' : 'Verification Removed', 'success');
          if (selectedUser && selectedUser.uid === uid) {
              setSelectedUser({ ...selectedUser, isVerified: newStatus });
          }
      } catch(e) { console.error(e); }
  };

  const toggleSupport = async (uid: string, currentStatus?: boolean) => {
      const newStatus = !currentStatus;
      try {
          await update(ref(db, `users/${uid}`), { isSupport: newStatus });
          showToast(newStatus ? 'Support Badge Granted' : 'Support Badge Revoked', 'success');
          if (selectedUser && selectedUser.uid === uid) {
              setSelectedUser({ ...selectedUser, isSupport: newStatus });
          }
      } catch(e) { console.error(e); }
  };

  const toggleCustomAvatarPrivilege = async (uid: string, currentStatus?: boolean) => {
      const newStatus = !currentStatus;
      try {
          await update(ref(db, `users/${uid}`), { allowCustomAvatar: newStatus });
          showToast(newStatus ? 'Custom Avatar Allowed' : 'Custom Avatar Revoked', 'success');
          if (selectedUser && selectedUser.uid === uid) {
              setSelectedUser({ ...selectedUser, allowCustomAvatar: newStatus });
          }
      } catch (e) { console.error(e); }
  };

  const deleteUser = async (uid: string) => {
      const confirmed = await showConfirm(
          "Delete User Permanently?", 
          "This action cannot be undone. All user data will be wiped.",
          "warning"
      );
      
      if (!confirmed) return;

      try {
          const userSnap = await get(ref(db, `users/${uid}`));
          if (userSnap.exists()) {
              const userData = userSnap.val();
              if (userData.activeMatch) {
                   await remove(ref(db, `matches/${userData.activeMatch}/players/${uid}`));
              }
          }
          await remove(ref(db, `users/${uid}`));
          setSelectedUser(null);
          showAlert('Deleted', 'User record deleted.', 'success');
      } catch (e) {
          console.error(e);
          showAlert('Error', 'Failed to delete user data.', 'error');
      }
  };

  const toggleAiFeature = async () => {
    try {
        await set(ref(db, 'settings/aiAssistantEnabled'), !aiEnabled);
        showToast(!aiEnabled ? 'AI Enabled' : 'AI Disabled', 'success');
    } catch (e) {
        console.error(e);
    }
  };

  // --- QUIZ ACTIONS ---

  const handleDeleteQuestion = async (qId: string | number) => {
      const confirmed = await showConfirm("Delete Question?", "This cannot be undone.");
      if (!confirmed) return;
      try {
          await remove(ref(db, `questions/${selectedChapter}/${qId}`));
          showToast("Question deleted", "success");
      } catch (e) {
          showAlert("Error", "Could not delete question", "error");
      }
  };

  const handleUpdateQuestion = async () => {
      if (!editingQuestion) return;
      // Validation
      if (!editingQuestion.question.trim() || editingQuestion.options.some(o => !o.trim())) {
          showToast("Fields cannot be empty", "warning");
          return;
      }
      
      try {
          // Path determined by subject property which stores chapterId
          const path = `questions/${editingQuestion.subject}/${editingQuestion.id}`;
          await update(ref(db, path), {
              question: editingQuestion.question,
              options: editingQuestion.options,
              answer: editingQuestion.answer
          });
          setEditingQuestion(null);
          showToast("Question Updated", "success");
      } catch (e) {
          showAlert("Error", "Update failed", "error");
      }
  };

  // --- MATCH ACTIONS ---

  const handleDestroyMatch = async (matchId: string) => {
      const confirmed = await showConfirm(
          "Destroy Match?", 
          "This will immediately terminate the game session for all participants.", 
          "Destroy", 
          "Cancel", 
          "danger"
      );
      
      if (!confirmed) return;

      try {
          const match = matches.find(m => m.matchId === matchId);
          const updates: any = {};
          
          // Delete Match
          updates[`matches/${matchId}`] = null;
          
          // Clear activeMatch for players
          if (match && match.players) {
              Object.keys(match.players).forEach(uid => {
                  updates[`users/${uid}/activeMatch`] = null;
              });
          }
          
          await update(ref(db), updates);
          showToast("Match Terminated", "success");
      } catch (e) {
          console.error(e);
          showAlert("Error", "Failed to destroy match", "error");
      }
  };

  // --- REPORT ACTIONS ---
  
  const handleEditReported = async (report: QuestionReport) => {
      try {
          const qSnap = await get(ref(db, `questions/${report.chapterId}/${report.questionId}`));
          if (qSnap.exists()) {
              // Explicitly pass subject (chapterId) for update path
              setEditingQuestion({ id: report.questionId, ...qSnap.val(), subject: report.chapterId });
          } else {
              showAlert("Error", "Question no longer exists.", "error");
          }
      } catch (e) {
          showAlert("Error", "Could not fetch question details.", "error");
      }
  };

  const handleClearReport = async (reportId: string) => {
      try {
          await remove(ref(db, `reports/${reportId}`));
          showToast("Report cleared", "success");
      } catch (e) {
          showToast("Clear failed", "error");
      }
  };

  const getReasonLabel = (reason: string) => {
      switch(reason) {
          case 'wrong_answer': return 'Wrong Answer';
          case 'typo': return 'Typo/Error';
          case 'other': return 'Other';
          default: return reason;
      }
  };

  // --- RENDER ---

  if (!isAuthenticated) {
      return (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4 transition-colors">
              <Card className="w-full max-w-md bg-white dark:bg-gray-800 border-none shadow-2xl">
                  <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-200 dark:border-red-500/30">
                          <i className="fas fa-user-shield text-3xl text-red-500"></i>
                      </div>
                      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-1">Restricted Access</h1>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">Super Admin Dashboard</p>
                  </div>
                  <form onSubmit={checkPin}>
                      <Input 
                        type="password" 
                        placeholder="Security PIN" 
                        value={pin} 
                        onChange={e => setPin(e.target.value)}
                        className="text-center text-2xl tracking-[0.5em] font-mono h-14 text-gray-900 dark:text-white"
                        autoFocus
                      />
                      <Button fullWidth variant="danger" className="mt-4 shadow-red-500/30">Unlock System</Button>
                  </form>
              </Card>
          </div>
      );
  }

  return (
    <div className="min-h-full bg-gray-100 dark:bg-gray-900 p-4 absolute inset-0 overflow-y-auto transition-colors pt-32">
        {/* Fixed Header */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-700/50 shadow-sm flex flex-col px-4 py-3 transition-colors duration-300">
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h1 className="text-xl md:text-2xl font-black text-gray-800 dark:text-white uppercase tracking-tight">Super Admin</h1>
                    <p className="text-gray-500 dark:text-gray-400 font-bold text-xs">System Control Center</p>
                </div>
                <button onClick={() => navigate('/')} className="text-gray-500 dark:text-gray-400 hover:text-red-500"><i className="fas fa-times text-xl"></i></button>
            </div>
            <div className="flex bg-slate-100 dark:bg-gray-800 rounded-xl p-1 gap-1 overflow-x-auto">
                <button onClick={() => setActiveTab('users')} className={`flex-1 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'users' ? 'bg-white dark:bg-gray-700 shadow text-game-primary' : 'text-gray-500 hover:text-gray-700'}`}>Users</button>
                <button onClick={() => setActiveTab('quizzes')} className={`flex-1 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'quizzes' ? 'bg-white dark:bg-gray-700 shadow text-game-primary' : 'text-gray-500 hover:text-gray-700'}`}>Quizzes</button>
                <button onClick={() => setActiveTab('matches')} className={`flex-1 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'matches' ? 'bg-white dark:bg-gray-700 shadow text-game-primary' : 'text-gray-500 hover:text-gray-700'}`}>Live</button>
                <button onClick={() => setActiveTab('reports')} className={`flex-1 px-4 py-1.5 rounded-lg text-xs font-bold transition-all relative ${activeTab === 'reports' ? 'bg-white dark:bg-gray-700 shadow text-game-primary' : 'text-gray-500 hover:text-gray-700'}`}>
                    Reports
                    {reports.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-black animate-pulse">{reports.length}</span>}
                </button>
            </div>
        </div>

        <div className="max-w-6xl mx-auto pb-20">
            
            {/* AI Control Card */}
            <Card className="mb-8 border-l-4 border-indigo-500">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                            <i className="fas fa-robot text-xl"></i>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">AI Assistant</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Global Switch for Gemini AI</p>
                        </div>
                    </div>
                    <button 
                        onClick={toggleAiFeature}
                        className={`
                            relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2  focus-visible:ring-white/75
                            ${aiEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}
                        `}
                    >
                        <span className="sr-only">Use setting</span>
                        <span
                            aria-hidden="true"
                            className={`
                                pointer-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out
                                ${aiEnabled ? 'translate-x-6' : 'translate-x-0'}
                            `}
                        />
                    </button>
                </div>
            </Card>

            {/* --- USER MANAGEMENT TAB --- */}
            {activeTab === 'users' && (
                <div className="animate__animated animate__fadeIn">
                    <div className="mb-4">
                        <Input 
                            placeholder="Search users..." 
                            icon="fa-search" 
                            value={searchTerm} 
                            onChange={(e) => setSearchTerm(e.target.value)} 
                        />
                    </div>
                    <Card className="!bg-white dark:!bg-gray-800 overflow-hidden shadow-lg border-0 p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                                        <th className="p-4 pl-6">User</th>
                                        <th className="p-4">Stats</th>
                                        <th className="p-4">Status</th>
                                        <th className="p-4 text-right pr-6">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {filteredUsers.map(u => (
                                        <tr key={u.uid} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${u.banned ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                                            <td className="p-4 pl-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                                        <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                                            {u.name}
                                                            {u.isVerified && <i className="fas fa-check-circle text-blue-500 text-xs" title="Verified"></i>}
                                                            {u.isSupport && <i className="fas fa-check-circle text-game-primary text-xs" title="Support"></i>}
                                                            {u.role === 'admin' && <i className="fas fa-shield-alt text-somali-blue text-xs" title="Admin"></i>}
                                                        </div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">@{u.username}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col">
                                                    <span className="font-mono font-bold text-somali-blue dark:text-blue-400">{u.points} pts</span>
                                                    <span className="text-[10px] text-gray-400 uppercase">LVL {Math.floor(u.points / 10) + 1}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                {u.banned ? (
                                                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-600 border border-red-200">BANNED</span>
                                                ) : (
                                                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-600 border border-green-200">ACTIVE</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right pr-6">
                                                <Button size="sm" onClick={() => setSelectedUser(u)} variant="secondary">
                                                    Edit
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* --- QUIZ MANAGEMENT TAB --- */}
            {activeTab === 'quizzes' && (
                <div className="animate__animated animate__fadeIn space-y-6">
                    {/* Filters */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="relative">
                            <select 
                                value={selectedSubject} 
                                onChange={(e) => setSelectedSubject(e.target.value)}
                                className="w-full p-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl font-bold text-gray-900 dark:text-white appearance-none cursor-pointer"
                            >
                                <option value="">Select Subject</option>
                                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                        </div>
                        <div className="relative">
                            <select 
                                value={selectedChapter} 
                                onChange={(e) => setSelectedChapter(e.target.value)}
                                className="w-full p-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-2xl font-bold text-gray-900 dark:text-white appearance-none cursor-pointer disabled:opacity-50"
                                disabled={!selectedSubject}
                            >
                                <option value="">Select Chapter</option>
                                {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                        </div>
                    </div>

                    {/* Question List */}
                    {selectedChapter && (
                        <Card className="!bg-white dark:!bg-gray-800 border-0 shadow-lg">
                            <div className="flex justify-between items-center mb-4 border-b border-gray-100 dark:border-gray-700 pb-4">
                                <h2 className="font-bold text-lg text-gray-900 dark:text-white">
                                    <i className="fas fa-list-ul mr-2 text-game-primary"></i> 
                                    Questions ({questions.length})
                                </h2>
                            </div>
                            
                            {questions.length === 0 ? (
                                <div className="text-center py-10 text-gray-400 font-bold">No questions found in this chapter.</div>
                            ) : (
                                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                    {questions.map((q, idx) => (
                                        <div key={q.id} className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row gap-4 items-start md:items-center group hover:border-game-primary/30 transition-colors">
                                            <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center justify-center font-bold shrink-0">
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-bold text-gray-800 dark:text-white mb-2">{q.question}</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {q.options.map((opt, i) => (
                                                        <span key={i} className={`text-xs px-2 py-1 rounded border ${i === q.answer ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800' : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                                                            {opt}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex gap-2 self-end md:self-center opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button size="sm" onClick={() => setEditingQuestion(q)} variant="secondary" className="!px-3"><i className="fas fa-pencil-alt"></i></Button>
                                                <Button size="sm" onClick={() => handleDeleteQuestion(q.id)} variant="danger" className="!px-3"><i className="fas fa-trash"></i></Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    )}
                </div>
            )}

            {/* --- MATCH MANAGEMENT TAB --- */}
            {activeTab === 'matches' && (
                <div className="animate__animated animate__fadeIn space-y-6">
                    {matches.length === 0 ? (
                        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                             <div className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400 dark:text-gray-500 text-3xl">
                                <i className="fas fa-gamepad"></i>
                             </div>
                             <h3 className="text-xl font-bold text-gray-500 dark:text-gray-400">No Active Matches</h3>
                             <p className="text-sm text-gray-400 dark:text-gray-500">The arena is currently quiet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                             {matches.map(m => {
                                 const pIds = Object.keys(m.players || {});
                                 const p1 = m.players?.[pIds[0]];
                                 const p2 = m.players?.[pIds[1]];
                                 
                                 return (
                                    <div key={m.matchId} className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col md:flex-row items-center justify-between gap-6">
                                        <div className="flex items-center gap-6 flex-1 w-full justify-center md:justify-start">
                                             {/* Player 1 */}
                                             <div className="flex flex-col items-center">
                                                 <Avatar src={p1?.avatar} size="md" className="mb-2" />
                                                 <div className="font-bold text-sm text-gray-900 dark:text-white truncate max-w-[100px]">{p1?.name || 'Unknown'}</div>
                                                 <div className="text-xl font-black text-game-primary">{m.scores?.[pIds[0]] || 0}</div>
                                             </div>
                                             
                                             <div className="text-center">
                                                 <div className="text-2xl font-black text-gray-300 dark:text-gray-600 italic">VS</div>
                                                 <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500">
                                                     Q {m.currentQ + 1}
                                                 </span>
                                             </div>
                                             
                                             {/* Player 2 */}
                                             <div className="flex flex-col items-center">
                                                 <Avatar src={p2?.avatar} size="md" className="mb-2" />
                                                 <div className="font-bold text-sm text-gray-900 dark:text-white truncate max-w-[100px]">{p2?.name || 'Unknown'}</div>
                                                 <div className="text-xl font-black text-red-500">{m.scores?.[pIds[1]] || 0}</div>
                                             </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-2 w-full md:w-auto border-t md:border-t-0 border-gray-100 dark:border-gray-700 pt-4 md:pt-0">
                                            <div className="flex gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                                                <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded uppercase">{m.mode}</span>
                                                <span className={`px-2 py-1 rounded uppercase ${m.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-gray-100'}`}>{m.status}</span>
                                            </div>
                                            <Button 
                                                size="sm" 
                                                variant="danger" 
                                                onClick={() => handleDestroyMatch(m.matchId)}
                                                className="w-full md:w-auto"
                                            >
                                                <i className="fas fa-ban mr-2"></i> Terminate
                                            </Button>
                                        </div>
                                    </div>
                                 );
                             })}
                        </div>
                    )}
                </div>
            )}

            {/* --- REPORT MANAGEMENT TAB --- */}
            {activeTab === 'reports' && (
                <div className="animate__animated animate__fadeIn space-y-4">
                    {reports.length === 0 ? (
                        <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                             <div className="w-20 h-20 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-green-500 text-3xl">
                                <i className="fas fa-check-double"></i>
                             </div>
                             <h3 className="text-xl font-bold text-gray-500 dark:text-gray-400">All Clear!</h3>
                             <p className="text-sm text-gray-400 dark:text-gray-500">No question reports pending review.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {reports.map(r => (
                                <div key={r.id} className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 group hover:border-red-200 transition-colors">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${r.reason === 'wrong_answer' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                                                {getReasonLabel(r.reason)}
                                            </span>
                                            <span className="text-[10px] font-bold text-slate-400 font-mono">ID: {r.id.substring(0, 8)}</span>
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-400">{new Date(r.timestamp).toLocaleString()}</div>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl mb-4 border border-slate-100 dark:border-slate-800">
                                        <p className="font-bold text-sm text-gray-800 dark:text-white leading-relaxed">"{r.questionText}"</p>
                                        <p className="text-[10px] text-slate-500 mt-2 uppercase font-black">Chapter: {r.chapterId}</p>
                                    </div>
                                    <div className="flex justify-end gap-3 pt-3 border-t border-slate-50 dark:border-slate-700/50">
                                        <button onClick={() => handleClearReport(r.id)} className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">Dismiss</button>
                                        <Button size="sm" onClick={() => handleEditReported(r)} className="!bg-indigo-600 border-indigo-800">Review & Fix</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* --- MODALS --- */}

        {/* User Detail Modal */}
        {selectedUser && (
            <Modal isOpen={true} title="User Control" onClose={() => setSelectedUser(null)}>
                <div className="flex flex-col items-center mb-6">
                    <div className="relative">
                        <Avatar src={selectedUser.avatar} seed={selectedUser.uid} size="xl" className="border-4 border-white dark:border-gray-700 shadow-xl" isVerified={selectedUser.isVerified} />
                        {selectedUser.banned && (
                            <div className="absolute inset-0 bg-red-500/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                                <i className="fas fa-ban text-4xl text-white"></i>
                            </div>
                        )}
                    </div>
                    <h2 className="text-2xl font-black mt-4 text-gray-900 dark:text-white flex items-center gap-2">
                        {selectedUser.name}
                        {selectedUser.isVerified && <i className="fas fa-check-circle text-blue-500 text-lg" title="Verified"></i>}
                        {selectedUser.isSupport && <i className="fas fa-check-circle text-game-primary text-lg" title="Support Team"></i>}
                    </h2>
                    <p className="text-gray-600 dark:text-gray-300 font-bold font-mono">@{selectedUser.username}</p>
                    <div className="grid grid-cols-2 gap-4 w-full mt-6">
                        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl text-center">
                            <div className="text-xs text-gray-400 uppercase font-bold">Role</div>
                            <div className="text-xl font-black text-gray-800 dark:text-white uppercase">{selectedUser.role || 'User'}</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl text-center">
                            <div className="text-xs text-gray-400 uppercase font-bold">Points</div>
                            <div className="text-xl font-black text-somali-blue dark:text-blue-400">{selectedUser.points}</div>
                        </div>
                    </div>
                </div>
                <div className="space-y-3">
                    <Button fullWidth onClick={() => toggleVerification(selectedUser.uid, selectedUser.isVerified)} variant="outline">
                        {selectedUser.isVerified ? 'Remove Verification' : 'Verify User'}
                    </Button>
                    {/* Support Badge Toggle */}
                    <Button fullWidth onClick={() => toggleSupport(selectedUser.uid, selectedUser.isSupport)} className="bg-orange-100 hover:bg-orange-200 text-orange-600 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800">
                        {selectedUser.isSupport ? 'Revoke Support Badge' : 'Grant Support Badge'}
                    </Button>
                    <Button fullWidth onClick={() => toggleCustomAvatarPrivilege(selectedUser.uid, selectedUser.allowCustomAvatar)} className="bg-purple-600 hover:bg-purple-700 border-purple-800">
                        {selectedUser.allowCustomAvatar ? 'Revoke Custom Avatar' : 'Allow Custom Avatar'}
                    </Button>
                    <div className="flex gap-2">
                        <Button fullWidth onClick={() => toggleRole(selectedUser.uid, selectedUser.role)} variant={selectedUser.role === 'admin' ? 'secondary' : 'primary'}>
                            {selectedUser.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                        </Button>
                        <Button fullWidth onClick={() => toggleBan(selectedUser.uid, selectedUser.banned)} className={selectedUser.banned ? "bg-green-600" : "bg-orange-500"}>
                            {selectedUser.banned ? 'Unban' : 'Ban'}
                        </Button>
                    </div>
                    <Button fullWidth onClick={() => deleteUser(selectedUser.uid)} variant="danger">Delete Data</Button>
                </div>
            </Modal>
        )}

        {/* Edit Question Modal */}
        {editingQuestion && (
            <Modal isOpen={true} title="Edit Question" onClose={() => setEditingQuestion(null)}>
                <div className="space-y-4">
                    <Input 
                        label="Question Text" 
                        value={editingQuestion.question} 
                        onChange={(e) => setEditingQuestion({...editingQuestion, question: e.target.value})}
                    />
                    
                    <div>
                        <label className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide block mb-2">Options</label>
                        <div className="space-y-2">
                            {editingQuestion.options.map((opt, idx) => (
                                <div key={idx} className="flex gap-2 items-center">
                                    <div 
                                        onClick={() => setEditingQuestion({...editingQuestion, answer: idx})}
                                        className={`w-8 h-8 rounded flex items-center justify-center font-bold cursor-pointer border-2 ${idx === editingQuestion.answer ? 'bg-green-50 border-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700 border-transparent text-gray-500 dark:text-gray-400'}`}
                                    >
                                        {String.fromCharCode(65+idx)}
                                    </div>
                                    <input 
                                        value={opt}
                                        onChange={(e) => {
                                            const newOpts = [...editingQuestion.options];
                                            newOpts[idx] = e.target.value;
                                            setEditingQuestion({...editingQuestion, options: newOpts});
                                        }}
                                        className="flex-1 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white font-medium focus:outline-none focus:border-game-primary"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                         <Button fullWidth variant="outline" onClick={() => setEditingQuestion(null)}>Cancel</Button>
                         <Button fullWidth onClick={handleUpdateQuestion}>Save Changes</Button>
                    </div>
                </div>
            </Modal>
        )}
    </div>
  );
};

export default SuperAdminPage;
