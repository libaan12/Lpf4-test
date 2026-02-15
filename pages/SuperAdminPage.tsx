
import React, { useState, useEffect, useMemo, useContext } from 'react';
import { ref, update, onValue, off, set, remove, get, push, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { UserProfile, Subject, Chapter, Question, MatchState, QuestionReport } from '../types';
import { Button, Card, Input, Modal, Avatar, VerificationBadge } from '../components/UI';
import { showAlert, showToast, showConfirm, showPrompt } from '../services/alert';
import { useNavigate } from 'react-router-dom';

const SuperAdminPage: React.FC = () => {
  const { profile: myProfile } = useContext(UserContext);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [activeTab, setActiveTab] = useState<'home' | 'users' | 'quizzes' | 'arena' | 'reports'>('home');
  const navigate = useNavigate();
  
  // --- DATA STATES ---
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [matches, setMatches] = useState<MatchState[]>([]);
  const [reports, setReports] = useState<QuestionReport[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  
  // --- UI STATES ---
  const [searchTerm, setSearchTerm] = useState('');
  const [fabOpen, setFabOpen] = useState(false);
  
  // Selection States
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  
  // User Management
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [userPointsEdit, setUserPointsEdit] = useState<string>('');
  const [editingRoles, setEditingRoles] = useState({ superAdmin: false, admin: false, support: false });

  // --- AUTHENTICATION ---
  useEffect(() => {
      // Auto-unlock if user is a Super Admin based on profile roles
      if (myProfile?.roles?.superAdmin) {
          setIsAuthenticated(true);
      }
  }, [myProfile]);

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

    return () => unsubs.forEach(fn => fn());
  }, [isAuthenticated]);

  useEffect(() => {
    if (selectedSubject) {
      const chapRef = ref(db, `chapters/${selectedSubject}`);
      onValue(chapRef, (snap) => setChapters(Object.values(snap.val() || {})));
    }
  }, [selectedSubject]);

  useEffect(() => {
    if (selectedChapter) {
      const qRef = ref(db, `questions/${selectedChapter}`);
      onValue(qRef, (snap) => {
        const data = snap.val();
        setQuestions(Object.keys(data || {}).map(key => ({ id: key, ...data[key] })));
      });
    }
  }, [selectedChapter]);

  // --- USER SELECTION LOGIC ---
  useEffect(() => {
      if (selectedUser) {
          // Sync local role state with selected user
          setEditingRoles({
              superAdmin: selectedUser.roles?.superAdmin || false,
              admin: selectedUser.roles?.admin || (selectedUser.role === 'admin') || false,
              support: selectedUser.roles?.support || selectedUser.isSupport || false
          });
      }
  }, [selectedUser]);

  // --- ACTIONS ---
  const toggleUserProp = async (uid: string, prop: string, current: any) => {
    try {
      await update(ref(db, `users/${uid}`), { [prop]: !current });
      if (selectedUser && selectedUser.uid === uid) {
          setSelectedUser({ ...selectedUser, [prop]: !current });
      }
      showToast(`User ${prop} updated`);
    } catch(e) { showAlert("Error", "Action failed", "error"); }
  };

  const saveUserRoles = async () => {
      if (!selectedUser) return;
      
      const roles = editingRoles;
      const updates: any = {};
      
      // Update Roles Object
      updates[`users/${selectedUser.uid}/roles`] = roles;
      
      // Maintain Legacy Compatibility
      updates[`users/${selectedUser.uid}/isSupport`] = roles.support;
      updates[`users/${selectedUser.uid}/role`] = roles.admin ? 'admin' : 'user';
      
      try {
          await update(ref(db), updates);
          showToast("User roles updated", "success");
      } catch(e) {
          showAlert("Error", "Failed to update roles", "error");
      }
  };

  const saveUserPoints = async () => {
      if (!selectedUser) return;
      const pts = parseInt(userPointsEdit);
      if (isNaN(pts)) return;
      await update(ref(db, `users/${selectedUser.uid}`), { points: pts });
      showToast("Points updated", "success");
      setSelectedUser({ ...selectedUser, points: pts });
  };

  const deleteUser = async (uid: string) => {
      if (await showConfirm("Delete User?", "This action is irreversible.", "Delete", "Cancel", "danger")) {
          await remove(ref(db, `users/${uid}`));
          setSelectedUser(null);
          showToast("User deleted", "success");
      }
  };

  const terminateMatch = async (matchId: string) => {
    if (await showConfirm("Terminate Match?", "Game will end for all players.")) {
      const match = matches.find(m => m.matchId === matchId);
      const updates: any = {};
      updates[`matches/${matchId}`] = null;
      if (match?.players) Object.keys(match.players).forEach(uid => updates[`users/${uid}/activeMatch`] = null);
      await update(ref(db), updates);
      showToast("Terminated");
    }
  };

  const handleUpdateQuestion = async () => {
    if (!editingQuestion) return;
    const path = `questions/${editingQuestion.subject}/${editingQuestion.id}`;
    await update(ref(db, path), {
        question: editingQuestion.question,
        options: editingQuestion.options,
        answer: editingQuestion.answer
    });
    setEditingQuestion(null);
    showToast("Updated");
  };

  const handleFABAction = (action: 'quiz' | 'user' | 'alert') => {
      setFabOpen(false);
      if (action === 'quiz') {
          setActiveTab('quizzes');
      } else if (action === 'user') {
          setActiveTab('users');
          document.getElementById('user-search')?.focus();
      } else if (action === 'alert') {
          showToast("System Alert Broadcasted (Simulated)", "info");
      }
  };

  // --- FILTERS ---
  const filteredUsers = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return users.filter(u => u.name?.toLowerCase().includes(term) || u.username?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term));
  }, [users, searchTerm]);

  // --- COMPUTED METRICS ---
  const stats = useMemo(() => {
      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      const newUsers = users.filter(u => (u.createdAt || 0) > now - day).length;
      const activeMatches = matches.filter(m => m.status === 'active').length;
      return {
          totalUsers: users.length,
          activeMatches,
          newUsers,
          reports: reports.length
      };
  }, [users, matches, reports]);

  // --- UI HELPERS ---
  const SidebarItem = ({ id, icon, active }: { id: string, icon: string, active: boolean }) => (
      <button 
        onClick={() => setActiveTab(id as any)}
        className={`w-12 h-12 mb-6 rounded-2xl flex items-center justify-center transition-all duration-300 relative group ${active ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'text-slate-500 hover:text-slate-200'}`}
      >
          <i className={`fas ${icon} text-xl`}></i>
          {active && <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-6 bg-cyan-400 rounded-r-full shadow-[0_0_10px_rgba(34,211,238,0.8)]"></div>}
      </button>
  );

  const StatCard = ({ title, value, sub, chartColor, icon }: { title: string, value: string, sub: string, chartColor: string, icon: string }) => (
      <div className="bg-[#1e293b] rounded-[2rem] p-5 relative overflow-hidden border border-slate-700/50 shadow-lg group hover:border-slate-600 transition-colors">
          <div className="flex justify-between items-start mb-2">
              <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{title}</h3>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white`} style={{backgroundColor: chartColor}}>
                  <i className={`fas ${icon}`}></i>
              </div>
          </div>
          <div className="text-2xl font-black text-white mb-4">{value}</div>
          <div className="absolute bottom-4 left-0 right-0 h-10 px-4 opacity-80">
             <svg viewBox="0 0 100 25" className="w-full h-full overflow-visible">
                 <path 
                    d="M0,25 Q25,20 50,15 T100,5" 
                    fill="none" 
                    stroke={chartColor} 
                    strokeWidth="3" 
                    strokeLinecap="round"
                    className="drop-shadow-md"
                 />
             </svg>
          </div>
          <div className="absolute top-5 right-5 text-[10px] font-black" style={{ color: chartColor }}>{sub}</div>
      </div>
  );

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0b1120] p-6 font-sans">
        <div className="w-full max-w-sm bg-[#1e293b] border border-cyan-500/20 p-10 rounded-[2.5rem] shadow-[0_0_50px_rgba(34,211,238,0.1)] relative overflow-hidden text-center">
          <div className="w-20 h-20 bg-cyan-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-cyan-500/30 animate-pulse">
             <i className="fas fa-fingerprint text-4xl text-cyan-400"></i>
          </div>
          <h1 className="text-2xl font-black text-white mb-2 uppercase tracking-widest">System Locked</h1>
          <p className="text-slate-500 text-xs font-bold mb-8">Enter Administrator PIN</p>
          <form onSubmit={checkPin}>
            <input 
                type="password" 
                value={pin} 
                onChange={e => setPin(e.target.value)}
                className="w-full bg-[#0b1120] border-2 border-slate-700 rounded-xl py-4 text-center text-2xl tracking-[0.5em] font-black text-cyan-400 focus:border-cyan-500 outline-none transition-all mb-6"
                placeholder="••••"
                autoFocus
            />
            <Button fullWidth className="bg-cyan-500 hover:bg-cyan-400 text-[#0b1120] font-black border-none py-4 rounded-xl">UNLOCK</Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0b1120] text-white font-sans overflow-hidden select-none">
        
        {/* SIDEBAR - Fixed Menu */}
        <div className="w-24 border-r border-slate-800 flex flex-col items-center py-8 z-20 bg-[#0b1120] hidden md:flex">
            <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center mb-10 shadow-lg shadow-cyan-500/20 cursor-pointer hover:scale-105 transition-transform" onClick={() => navigate('/')}>
                <i className="fas fa-bolt text-xl text-white"></i>
            </div>
            
            <div className="flex-1 w-full flex flex-col items-center custom-scrollbar overflow-y-auto">
                <SidebarItem id="home" icon="fa-th-large" active={activeTab === 'home'} />
                <SidebarItem id="users" icon="fa-users" active={activeTab === 'users'} />
                <SidebarItem id="quizzes" icon="fa-layer-group" active={activeTab === 'quizzes'} />
                <SidebarItem id="arena" icon="fa-gamepad" active={activeTab === 'arena'} />
                <SidebarItem id="reports" icon="fa-flag" active={activeTab === 'reports'} />
            </div>

            <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-slate-800 text-slate-500 hover:text-white flex items-center justify-center transition-colors mt-4">
                <i className="fas fa-sign-out-alt"></i>
            </button>
        </div>

        {/* MAIN CONTENT */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
            
            {/* HEADER */}
            <header className="px-8 py-6 flex justify-between items-center border-b border-slate-800/50 bg-[#0b1120]/95 backdrop-blur-sm z-10">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/')} className="md:hidden w-10 h-10 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center">
                        <i className="fas fa-arrow-left"></i>
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tight">SUPER ADMIN</h1>
                        <p className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.3em]">Central Command</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="relative cursor-pointer" onClick={() => setActiveTab('reports')}>
                        <i className="fas fa-bell text-slate-400 text-xl hover:text-white transition-colors"></i>
                        {stats.reports > 0 && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_#ef4444]"></span>}
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                            <div className="text-white font-bold text-sm">Super Admin</div>
                            <div className="text-slate-500 text-[10px] uppercase font-black tracking-wider">Full Access</div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-purple-500/20 border-2 border-purple-500 flex items-center justify-center overflow-hidden">
                            <i className="fas fa-user-astronaut text-purple-400"></i>
                        </div>
                    </div>
                </div>
            </header>

            {/* SCROLLABLE AREA */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
                
                {/* --- DASHBOARD HOME --- */}
                {activeTab === 'home' && (
                    <div className="max-w-7xl mx-auto space-y-8 animate__animated animate__fadeIn">
                        
                        {/* 4 Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <StatCard title="Total Users" value={stats.totalUsers.toLocaleString()} sub="+12.5%" chartColor="#22d3ee" icon="fa-users" />
                            <StatCard title="Live Battles" value={stats.activeMatches.toString()} sub="Active" chartColor="#4ade80" icon="fa-gamepad" />
                            <StatCard title="New Recruits" value={stats.newUsers.toString()} sub="+24h" chartColor="#fb923c" icon="fa-user-plus" />
                            <StatCard title="Pending Reports" value={stats.reports.toString()} sub={stats.reports > 0 ? "Action Req" : "Clear"} chartColor="#f472b6" icon="fa-flag" />
                        </div>

                        {/* Recent Activity List */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-[#1e293b] rounded-[2.5rem] p-6 border border-slate-700/50 shadow-xl flex flex-col">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-white font-black uppercase text-sm tracking-widest">Live Arena Feed</h3>
                                    <button onClick={() => setActiveTab('arena')} className="text-[10px] font-black text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded-full hover:bg-cyan-500/10">VIEW ALL</button>
                                </div>
                                <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[350px]">
                                    {matches.slice(0, 10).map(m => (
                                        <div key={m.matchId} className="bg-[#0b1120] p-3 rounded-2xl flex items-center gap-3 border border-slate-800 hover:border-slate-600 transition-colors">
                                            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-cyan-400">
                                                <i className="fas fa-gamepad"></i>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-white font-bold text-xs truncate">Match #{String(m.matchId).substring(6)}</div>
                                                <div className="text-[10px] text-slate-500 truncate">{m.subjectTitle || 'Battle'}</div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-white font-black text-sm">{Object.keys(m.players || {}).length}P</div>
                                                <div className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${m.status === 'active' ? 'bg-green-500 text-[#0b1120]' : 'bg-slate-700 text-slate-400'}`}>
                                                    {m.status === 'active' ? 'LIVE' : 'DONE'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {matches.length === 0 && <div className="text-center text-slate-600 text-xs py-10">No recent activity</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- USERS TAB --- */}
                {activeTab === 'users' && (
                    <div className="bg-[#1e293b] rounded-[2.5rem] p-8 border border-slate-700/50 min-h-[500px] animate__animated animate__fadeIn">
                        <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between items-center">
                            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                                <i className="fas fa-users text-cyan-400"></i> User Database
                            </h2>
                            <div className="relative w-full md:w-64">
                                <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
                                <input 
                                    id="user-search"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full bg-[#0b1120] border border-slate-700 rounded-xl py-3 pl-12 pr-4 text-white text-sm font-bold focus:ring-2 focus:ring-cyan-500 outline-none"
                                    placeholder="Search users..."
                                />
                            </div>
                        </div>
                        <div className="space-y-3">
                            {filteredUsers.slice(0, 50).map(u => (
                                <div key={u.uid} className="bg-[#0b1120] p-4 rounded-2xl flex items-center justify-between group hover:border-cyan-500/30 border border-transparent transition-all">
                                    <div className="flex items-center gap-4">
                                        <Avatar src={u.avatar} size="sm" isVerified={u.isVerified} />
                                        <div>
                                            <div className="text-white font-bold text-sm flex items-center gap-2">
                                                {u.name}
                                                {u.banned && <span className="text-[8px] bg-red-500 px-1.5 rounded text-white uppercase font-black">Banned</span>}
                                                {u.roles?.superAdmin && <span className="text-[8px] bg-purple-500 px-1.5 rounded text-white uppercase font-black">Super Admin</span>}
                                                {u.roles?.support && !u.roles?.superAdmin && <span className="text-[8px] bg-orange-500 px-1.5 rounded text-white uppercase font-black">Staff</span>}
                                            </div>
                                            <div className="text-slate-500 text-xs font-mono">@{u.username || 'guest'} • <span className="text-cyan-400">{u.points} PTS</span></div>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => { setSelectedUser(u); setUserPointsEdit(String(u.points)); }} 
                                        className="bg-slate-800 hover:bg-cyan-500 hover:text-black text-cyan-400 px-4 py-2 rounded-xl text-xs font-black uppercase transition-colors"
                                    >
                                        Manage
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* --- QUIZZES TAB --- */}
                {activeTab === 'quizzes' && (
                    <div className="bg-[#1e293b] rounded-[2.5rem] p-8 border border-slate-700/50 min-h-[500px] animate__animated animate__fadeIn">
                        <h2 className="text-xl font-black text-white mb-6 uppercase tracking-widest flex items-center gap-2">
                            <i className="fas fa-layer-group text-purple-400"></i> Content Manager
                        </h2>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <select 
                                value={selectedSubject} 
                                onChange={e => setSelectedSubject(e.target.value)}
                                className="bg-[#0b1120] text-white p-4 rounded-xl font-bold border-none outline-none focus:ring-1 focus:ring-cyan-500"
                            >
                                <option value="">Select Subject</option>
                                {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <select 
                                value={selectedChapter} 
                                onChange={e => setSelectedChapter(e.target.value)}
                                className="bg-[#0b1120] text-white p-4 rounded-xl font-bold border-none outline-none focus:ring-1 focus:ring-cyan-500"
                                disabled={!selectedSubject}
                            >
                                <option value="">Select Chapter</option>
                                {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-3">
                            {questions.map((q, idx) => (
                                <div key={q.id} className="bg-[#0b1120] p-4 rounded-2xl border border-slate-800 flex justify-between items-start hover:border-purple-500/30 transition-colors">
                                    <div className="flex gap-3">
                                        <div className="text-cyan-500 font-black text-lg w-8 pt-1">Q{idx+1}</div>
                                        <div>
                                            <div className="text-white font-bold text-sm mb-2">{q.question}</div>
                                            <div className="flex flex-wrap gap-2">
                                                {q.options.map((o, i) => (
                                                    <span key={i} className={`text-[10px] px-2 py-1 rounded ${i === q.answer ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-slate-800 text-slate-500'}`}>{o}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <button onClick={() => setEditingQuestion(q)} className="text-cyan-400 hover:text-white"><i className="fas fa-edit"></i></button>
                                    </div>
                                </div>
                            ))}
                            {questions.length === 0 && <div className="text-center text-slate-600 py-10 font-bold">Select a chapter to view questions</div>}
                        </div>
                    </div>
                )}

                {/* --- ARENA TAB --- */}
                {activeTab === 'arena' && (
                    <div className="bg-[#1e293b] rounded-[2.5rem] p-8 border border-slate-700/50 min-h-[500px] animate__animated animate__fadeIn">
                        <h2 className="text-xl font-black text-white mb-6 uppercase tracking-widest flex items-center gap-2">
                            <i className="fas fa-gamepad text-green-400"></i> Active Arena
                        </h2>
                        <div className="space-y-4">
                            {matches.map(m => (
                                <div key={m.matchId} className="bg-[#0b1120] p-5 rounded-2xl border border-slate-800 flex justify-between items-center group hover:border-green-500/30 transition-colors">
                                    <div>
                                        <div className="text-cyan-400 text-[10px] font-black uppercase tracking-widest mb-1">{m.subjectTitle}</div>
                                        <div className="text-white font-bold text-sm flex items-center gap-2">
                                            {Object.keys(m.players || {}).length} Players
                                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">ID: {m.matchId}</div>
                                    </div>
                                    <Button size="sm" variant="danger" onClick={() => terminateMatch(m.matchId)} className="!py-2 !px-4 !text-[10px]">TERMINATE</Button>
                                </div>
                            ))}
                            {matches.length === 0 && <div className="text-center text-slate-600 py-20 font-bold">No live matches</div>}
                        </div>
                    </div>
                )}
            </div>

            {/* EXPANDABLE FAB */}
            <div className="fixed bottom-8 right-8 flex flex-col items-end gap-3 z-50">
                {fabOpen && (
                    <div className="flex flex-col gap-3 items-end animate__animated animate__fadeInUp animate__faster">
                        <button onClick={() => handleFABAction('quiz')} className="bg-[#1e293b] text-white px-4 py-2 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2 hover:bg-slate-700 transition-colors">
                            <span className="text-xs font-bold">New Question</span>
                            <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center"><i className="fas fa-plus"></i></div>
                        </button>
                        <button onClick={() => handleFABAction('user')} className="bg-[#1e293b] text-white px-4 py-2 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2 hover:bg-slate-700 transition-colors">
                            <span className="text-xs font-bold">Find User</span>
                            <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center"><i className="fas fa-search"></i></div>
                        </button>
                        <button onClick={() => handleFABAction('alert')} className="bg-[#1e293b] text-white px-4 py-2 rounded-xl shadow-lg border border-slate-700 flex items-center gap-2 hover:bg-slate-700 transition-colors">
                            <span className="text-xs font-bold">System Alert</span>
                            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center"><i className="fas fa-bullhorn"></i></div>
                        </button>
                    </div>
                )}
                <button 
                    onClick={() => setFabOpen(!fabOpen)}
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-[#0b1120] text-2xl shadow-[0_0_30px_rgba(34,211,238,0.4)] hover:scale-110 active:scale-95 transition-all z-30 ${fabOpen ? 'bg-slate-700 text-white rotate-45' : 'bg-cyan-500'}`}
                >
                    <i className="fas fa-plus"></i>
                </button>
            </div>
        </div>

        {/* --- USER DETAIL MODAL --- */}
        {selectedUser && (
            <Modal isOpen={true} title="User Manager" onClose={() => setSelectedUser(null)}>
                <div className="flex flex-col items-center mb-6 pt-2">
                    <Avatar src={selectedUser.avatar} size="xl" isVerified={selectedUser.isVerified} className="mb-4 border-4 border-slate-700 shadow-xl" />
                    <h2 className="text-2xl font-black text-white">{selectedUser.name}</h2>
                    <p className="text-slate-500 text-sm font-bold mb-4">@{selectedUser.username || 'guest'}</p>
                    
                    <div className="grid grid-cols-2 gap-4 w-full mb-6">
                        <div className="bg-[#0b1120] p-3 rounded-xl text-center border border-slate-800">
                            <div className="text-[10px] text-slate-500 uppercase font-black">Points</div>
                            <div className="text-xl text-cyan-400 font-black">{selectedUser.points}</div>
                        </div>
                        <div className="bg-[#0b1120] p-3 rounded-xl text-center border border-slate-800">
                            <div className="text-[10px] text-slate-500 uppercase font-black">Role</div>
                            <div className="text-sm text-white font-bold">{selectedUser.roles?.superAdmin ? 'Super Admin' : selectedUser.roles?.support ? 'Staff' : 'User'}</div>
                        </div>
                    </div>

                    <div className="w-full space-y-4">
                        {/* ROLE MANAGEMENT */}
                        <div className="p-4 bg-[#0b1120] rounded-2xl border border-slate-800">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Role Assignment</label>
                            <div className="space-y-2">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${editingRoles.support ? 'bg-orange-500 border-orange-500 text-black' : 'border-slate-600 bg-slate-900'}`}>
                                        {editingRoles.support && <i className="fas fa-check text-xs"></i>}
                                    </div>
                                    <input type="checkbox" className="hidden" checked={editingRoles.support} onChange={() => setEditingRoles(prev => ({ ...prev, support: !prev.support }))} />
                                    <span className="text-sm font-bold text-white">Support Staff</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${editingRoles.admin ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-600 bg-slate-900'}`}>
                                        {editingRoles.admin && <i className="fas fa-check text-xs"></i>}
                                    </div>
                                    <input type="checkbox" className="hidden" checked={editingRoles.admin} onChange={() => setEditingRoles(prev => ({ ...prev, admin: !prev.admin }))} />
                                    <span className="text-sm font-bold text-white">Admin (Content Manager)</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${editingRoles.superAdmin ? 'bg-purple-500 border-purple-500 text-white' : 'border-slate-600 bg-slate-900'}`}>
                                        {editingRoles.superAdmin && <i className="fas fa-check text-xs"></i>}
                                    </div>
                                    <input type="checkbox" className="hidden" checked={editingRoles.superAdmin} onChange={() => setEditingRoles(prev => ({ ...prev, superAdmin: !prev.superAdmin }))} />
                                    <span className="text-sm font-bold text-white">Super Admin (Full Access)</span>
                                </label>
                            </div>
                            <Button size="sm" onClick={saveUserRoles} className="mt-4 !py-2 !text-xs !bg-slate-700 hover:!bg-slate-600 border-none w-full">Update Roles</Button>
                        </div>

                        {/* QUICK ACTIONS */}
                        <div className="p-4 bg-[#0b1120] rounded-2xl border border-slate-800">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Quick Actions</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => toggleUserProp(selectedUser.uid, 'isVerified', selectedUser.isVerified)} className={`py-2 rounded-lg text-xs font-black uppercase ${selectedUser.isVerified ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'}`}>
                                    {selectedUser.isVerified ? 'Unverify' : 'Verify'}
                                </button>
                                <button onClick={() => toggleUserProp(selectedUser.uid, 'banned', selectedUser.banned)} className={`py-2 rounded-lg text-xs font-black uppercase ${selectedUser.banned ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-slate-700 text-slate-400 border border-slate-600'}`}>
                                    {selectedUser.banned ? 'Unban' : 'Ban User'}
                                </button>
                                <button onClick={() => deleteUser(selectedUser.uid)} className="py-2 rounded-lg text-xs font-black uppercase bg-red-600 text-white hover:bg-red-700 col-span-2">
                                    Delete User
                                </button>
                            </div>
                        </div>

                        <div className="p-4 bg-[#0b1120] rounded-2xl border border-slate-800 flex gap-2 items-end">
                            <div className="flex-1">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">Adjust Points</label>
                                <Input 
                                    value={userPointsEdit} 
                                    onChange={e => setUserPointsEdit(e.target.value)} 
                                    className="!bg-[#1e293b] !border-slate-700 !text-white !mb-0 !py-2" 
                                    type="number"
                                />
                            </div>
                            <Button size="sm" onClick={saveUserPoints} className="!py-3">Save</Button>
                        </div>
                    </div>
                </div>
            </Modal>
        )}

        {/* --- QUESTION EDITOR MODAL --- */}
        {editingQuestion && (
            <Modal isOpen={true} title="Edit Question" onClose={() => setEditingQuestion(null)}>
                <div className="space-y-4 pt-4">
                    <Input 
                        value={editingQuestion.question} 
                        onChange={(e) => setEditingQuestion({...editingQuestion, question: e.target.value})}
                        className="!bg-[#0b1120] !border-slate-700 !text-white"
                    />
                    {editingQuestion.options.map((opt, i) => (
                        <div key={i} className="flex gap-2">
                            <button 
                                onClick={() => setEditingQuestion({...editingQuestion, answer: i})}
                                className={`w-10 h-10 rounded bg-[#0b1120] border ${editingQuestion.answer === i ? 'border-green-500 text-green-500' : 'border-slate-700 text-slate-500'}`}
                            >{String.fromCharCode(65+i)}</button>
                            <Input 
                                value={opt} 
                                onChange={(e) => {
                                    const newOpts = [...editingQuestion.options];
                                    newOpts[i] = e.target.value;
                                    setEditingQuestion({...editingQuestion, options: newOpts});
                                }}
                                className="!bg-[#0b1120] !border-slate-700 !text-white !mb-0"
                            />
                        </div>
                    ))}
                    <Button fullWidth onClick={handleUpdateQuestion}>Save Changes</Button>
                </div>
            </Modal>
        )}
    </div>
  );
};

export default SuperAdminPage;
