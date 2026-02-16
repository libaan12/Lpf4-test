
import React, { useState, useEffect, useMemo, useContext } from 'react';
import { ref, update, onValue, off, set, remove, get, push, serverTimestamp, query, limitToLast, increment } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { UserProfile, Subject, Chapter, Question, MatchState, QuestionReport, LibraryViewLog } from '../types';
import { Button, Card, Input, Modal, Avatar, VerificationBadge } from '../components/UI';
import { showAlert, showToast, showConfirm, showPrompt } from '../services/alert';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../services/audioService';

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
  const [fabOpen, setFabOpen] = useState(false);
  
  // Selection States
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  
  // Report Handling State
  const [activeReport, setActiveReport] = useState<QuestionReport | null>(null);
  
  // User Management
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userPointsEdit, setUserPointsEdit] = useState<string>('');
  const [editingRoles, setEditingRoles] = useState({ superAdmin: false, admin: false, support: false });

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

  // --- ACTIONS ---
  const toggleUserProp = async (uid: string, prop: string, current: any) => {
    try {
      await update(ref(db, `users/${uid}`), { [prop]: !current });
      showToast(`User ${prop} updated`);
    } catch(e) { showAlert("Error", "Action failed", "error"); }
  };

  const saveUserRoles = async () => {
      if (!selectedUser) return;
      const roles = editingRoles;
      const updates: any = {};
      updates[`users/${selectedUser.uid}/roles`] = roles;
      updates[`users/${selectedUser.uid}/isSupport`] = roles.support;
      updates[`users/${selectedUser.uid}/role`] = roles.admin ? 'admin' : 'user';
      try {
          await update(ref(db), updates);
          showToast("User roles updated", "success");
      } catch(e) { showAlert("Error", "Failed to update roles", "error"); }
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

        // NOTIFICATION LOGIC
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
            updates[`reports/${activeReport.id}`] = null; // Auto dismiss

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
      <div className="bg-[#1e293b] rounded-[2rem] p-5 relative overflow-hidden border border-slate-700/50 shadow-lg group hover:border-slate-600 transition-colors">
          <div className="flex justify-between items-start mb-2">
              <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{title}</h3>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white`} style={{backgroundColor: chartColor}}><i className={`fas ${icon}`}></i></div>
          </div>
          <div className="text-2xl font-black text-white mb-4">{value}</div>
          <div className="absolute bottom-4 left-0 right-0 h-10 px-4 opacity-80">
             <svg viewBox="0 0 100 25" className="w-full h-full overflow-visible">
                 <path d="M0,25 Q25,20 50,15 T100,5" fill="none" stroke={chartColor} strokeWidth="3" strokeLinecap="round" className="drop-shadow-md" />
             </svg>
          </div>
          <div className="absolute top-5 right-5 text-[10px] font-black" style={{ color: chartColor }}>{sub}</div>
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
  const stats = {
      totalUsers: users.length,
      activeMatches: matches.filter(m => m.status === 'active').length,
      newUsers: users.filter(u => (u.createdAt || 0) > Date.now() - 86400000).length,
      reports: reports.length
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
        <div className="flex-1 flex flex-col relative overflow-hidden w-full">
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                            <StatCard title="Total Users" value={stats.totalUsers.toLocaleString()} sub="+12.5%" chartColor="#22d3ee" icon="fa-users" />
                            <StatCard title="Live Battles" value={stats.activeMatches.toString()} sub="Active" chartColor="#4ade80" icon="fa-gamepad" />
                            <StatCard title="New Recruits" value={stats.newUsers.toString()} sub="+24h" chartColor="#fb923c" icon="fa-user-plus" />
                            <StatCard title="Pending Reports" value={stats.reports.toString()} sub={stats.reports > 0 ? "Action Req" : "Clear"} chartColor="#f472b6" icon="fa-flag" />
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
                                        <Avatar src={u.avatar} size="sm" isVerified={u.isVerified} />
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
    </div>
  );
};

export default SuperAdminPage;
