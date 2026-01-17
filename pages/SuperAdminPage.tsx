
import React, { useState, useEffect, useMemo } from 'react';
import { ref, update, onValue, off, set, remove, get, push } from 'firebase/database';
import { db } from '../firebase';
import { UserProfile, Subject, Chapter, Question, MatchState, QuestionReport } from '../types';
import { Button, Card, Input, Modal, Avatar } from '../components/UI';
import { showAlert, showToast, showConfirm } from '../services/alert';
import { useNavigate } from 'react-router-dom';

const SuperAdminPage: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'users' | 'quizzes' | 'arena' | 'reports' | 'social'>('home');
  const navigate = useNavigate();
  
  // --- CORE DATA STATES ---
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [matches, setMatches] = useState<MatchState[]>([]);
  const [reports, setReports] = useState<QuestionReport[]>([]);
  const [emojis, setEmojis] = useState<{id: string, value: string}[]>([]);
  const [messages, setMessages] = useState<{id: string, value: string}[]>([]);
  
  // Selection State
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [reportFilter, setReportFilter] = useState<'all' | 'wrong_answer' | 'typo' | 'other'>('all');

  // --- LOGIC: AUTHENTICATION ---
  const checkPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1234') { 
        setIsAuthenticated(true); 
    } else {
        showAlert('Access Denied', 'Incorrect PIN', 'error');
    }
  };

  // --- LOGIC: DATA SYNC ---
  useEffect(() => {
    if (!isAuthenticated) return;

    const syncRefs = [
      { path: 'users', setter: (data: any) => setUsers(Object.keys(data || {}).map(k => ({ uid: k, ...data[k] }))) },
      { path: 'matches', setter: (data: any) => setMatches(Object.keys(data || {}).map(k => ({ ...data[k], matchId: k })).reverse()) },
      { path: 'reports', setter: (data: any) => setReports(Object.keys(data || {}).map(k => ({ ...data[k], id: k })).reverse()) },
      { path: 'subjects', setter: (data: any) => setSubjects(Object.values(data || {}).filter((s: any) => s.id)) },
      { path: 'settings/aiAssistantEnabled', setter: (val: any) => setAiEnabled(val === null ? true : val) },
      { 
        path: 'settings/reactions', 
        setter: (val: any) => {
          if (val?.emojis) setEmojis(Object.entries(val.emojis).map(([k, v]) => ({id: k, value: v as string})));
          if (val?.messages) setMessages(Object.entries(val.messages).map(([k, v]) => ({id: k, value: v as string})));
        } 
      }
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

  // --- LOGIC: ACTIONS ---
  const toggleUserProp = async (uid: string, prop: string, current: any) => {
    try {
      await update(ref(db, `users/${uid}`), { [prop]: !current });
      showToast("Updated", "success");
    } catch(e) { showAlert("Error", "Failed to update", "error"); }
  };

  const adjustPoints = async (uid: string, current: number, delta: number) => {
    try {
      await update(ref(db, `users/${uid}`), { points: Math.max(0, current + delta) });
    } catch(e) {}
  };

  const terminateMatch = async (matchId: string) => {
    if (await showConfirm("Destroy Match?", "This will stop the game for all players.", "Destroy", "Cancel", "danger")) {
      const match = matches.find(m => m.matchId === matchId);
      const updates: any = {};
      updates[`matches/${matchId}`] = null;
      if (match?.players) Object.keys(match.players).forEach(uid => updates[`users/${uid}/activeMatch`] = null);
      await update(ref(db), updates);
      showToast("Match Terminated", "success");
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
    showToast("Updated", "success");
  };

  // Fix: Added missing handleDeleteQuestion function
  const handleDeleteQuestion = async (id: string | number) => {
    if (!selectedChapter) return;
    if (await showConfirm("Delete Question?", "This action is irreversible.", "Delete", "Cancel", "danger")) {
      try {
        await remove(ref(db, `questions/${selectedChapter}/${id}`));
        showToast("Question Deleted", "success");
      } catch (e) {
        console.error(e);
        showAlert("Error", "Failed to delete question.", "error");
      }
    }
  };

  // --- FILTERING ---
  const filteredUsers = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    return users.filter(u => u.name?.toLowerCase().includes(lower) || u.username?.toLowerCase().includes(lower));
  }, [users, searchTerm]);

  const filteredReports = useMemo(() => {
    if (reportFilter === 'all') return reports;
    return reports.filter(r => r.reason === reportFilter);
  }, [reports, reportFilter]);

  // --- COMPONENTS: SUB-VIEWS ---

  const DashboardView = () => (
    <div className="space-y-6 animate__animated animate__fadeIn">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800/50 p-6 rounded-[2rem] border border-slate-700/50 shadow-inner relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 text-green-500 font-black text-xs">+5.2%</div>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Total Users</div>
          <div className="text-3xl font-black text-white">{users.length.toLocaleString()}</div>
          <i className="fas fa-users absolute -bottom-4 -right-4 text-6xl opacity-5 group-hover:scale-110 transition-transform"></i>
        </div>
        <div className="bg-slate-800/50 p-6 rounded-[2rem] border border-slate-700/50 shadow-inner relative overflow-hidden group">
          <div className="absolute top-4 right-4"><span className="w-2 h-2 bg-cyan-400 rounded-full inline-block animate-pulse"></span> <span className="text-cyan-400 text-[10px] font-black uppercase">Live</span></div>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">In Arena</div>
          <div className="text-3xl font-black text-cyan-400">{matches.length * 2}</div>
          <i className="fas fa-bolt absolute -bottom-4 -right-4 text-6xl opacity-5 group-hover:scale-110 transition-transform"></i>
        </div>
      </div>

      {/* Reports Banner */}
      <div className="bg-orange-950/20 border border-orange-500/20 p-5 rounded-[2rem] flex items-center justify-between">
        <div className="flex items-center gap-4">
           <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-white text-xl">
             <i className="fas fa-exclamation-triangle"></i>
           </div>
           <div>
             <div className="text-white font-black text-2xl">{reports.length} <span className="text-sm text-slate-400 font-bold uppercase">Reports</span></div>
             <div className="text-orange-500 text-[10px] font-black uppercase tracking-tight">{reports.length > 0 ? `${reports.length} requiring immediate action` : 'System All Clear'}</div>
           </div>
        </div>
        <button onClick={() => setActiveTab('reports')} className="bg-orange-500 text-white px-6 py-2.5 rounded-xl font-black text-sm shadow-lg shadow-orange-500/20">Review</button>
      </div>

      {/* Arena Performance Chart Simulation */}
      <Card className="!bg-slate-800/30 border-slate-700/50 !p-6 rounded-[2.5rem]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-white font-black uppercase tracking-tighter text-lg">Arena Performance</h3>
          <span className="text-cyan-400 text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-cyan-400/10 rounded-full">Daily Peak</span>
        </div>
        <div className="flex items-end gap-1 mb-4">
          <span className="text-5xl font-black text-white">92%</span>
          <span className="text-slate-500 font-bold text-sm mb-1 ml-2">Completion Rate</span>
        </div>
        <div className="h-32 w-full relative mt-4">
          <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
            <path d="M0,80 Q50,20 100,60 T200,40 T300,70 T400,30" fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" />
            <path d="M0,80 Q50,20 100,60 T200,40 T300,70 T400,30 V100 H0 Z" fill="url(#grad)" opacity="0.1" />
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{stopColor:'#22d3ee', stopOpacity:1}} />
                <stop offset="100%" style={{stopColor:'#22d3ee', stopOpacity:0}} />
              </linearGradient>
            </defs>
          </svg>
          <div className="flex justify-between mt-2 text-[10px] font-black text-slate-600 uppercase tracking-widest">
            <span>00:00</span>
            <span>12:00</span>
            <span>23:59</span>
          </div>
        </div>
      </Card>

      {/* Recent Activity */}
      <div>
        <h3 className="text-white font-black uppercase tracking-tighter text-lg mb-4 ml-2">Recent Activity</h3>
        <div className="space-y-3">
          <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/30 flex items-center justify-between group cursor-pointer hover:bg-slate-800/60 transition-all">
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-xl flex items-center justify-center border border-blue-500/20"><i className="fas fa-check-circle"></i></div>
                <div>
                   <div className="text-white font-bold text-sm">Alex Rivier verified their account</div>
                   <div className="text-slate-500 text-[10px] font-bold uppercase tracking-tight">2 minutes ago • Level 12</div>
                </div>
             </div>
             <i className="fas fa-chevron-right text-slate-700 group-hover:translate-x-1 transition-transform"></i>
          </div>
          <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/30 flex items-center justify-between group cursor-pointer hover:bg-slate-800/60 transition-all">
             <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-cyan-500/10 text-cyan-500 rounded-xl flex items-center justify-center border border-cyan-500/20"><i className="fas fa-question-circle"></i></div>
                <div>
                   <div className="text-white font-bold text-sm">New Quiz: "Advanced React Pattern..."</div>
                   <div className="text-slate-500 text-[10px] font-bold uppercase tracking-tight">14 minutes ago • Created by Sarah</div>
                </div>
             </div>
             <i className="fas fa-chevron-right text-slate-700 group-hover:translate-x-1 transition-transform"></i>
          </div>
        </div>
      </div>
    </div>
  );

  const UsersView = () => (
    <div className="space-y-6 animate__animated animate__fadeIn">
      {/* Search Header */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
           <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"></i>
           <input 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-800 border-none rounded-2xl py-4 pl-12 pr-4 text-white text-sm font-bold focus:ring-2 focus:ring-cyan-400 transition-all shadow-inner"
              placeholder="Search ID, email, or name..."
           />
        </div>
        <button className="bg-slate-800 w-14 h-14 rounded-2xl flex items-center justify-center text-white border border-slate-700 shadow-lg"><i className="fas fa-sliders-h"></i></button>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-3 gap-3">
         <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-700/50">
            <div className="text-slate-500 text-[10px] font-black uppercase mb-1">Total</div>
            <div className="text-xl font-black text-white">{users.length}</div>
            <div className="text-cyan-400 text-[8px] font-black mt-1"><i className="fas fa-arrow-up mr-1"></i>12%</div>
         </div>
         <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-700/50">
            <div className="text-slate-500 text-[10px] font-black uppercase mb-1">Admins</div>
            <div className="text-xl font-black text-white">{users.filter(u => u.role === 'admin').length}</div>
            <div className="text-slate-500 text-[8px] font-black mt-1">0%</div>
         </div>
         <div className="bg-slate-800/30 p-4 rounded-2xl border border-slate-700/50">
            <div className="text-slate-500 text-[10px] font-black uppercase mb-1">Flags</div>
            <div className="text-xl font-black text-red-500">{reports.length}</div>
            <div className="text-red-400 text-[8px] font-black mt-1"><i className="fas fa-exclamation-triangle mr-1"></i>+1</div>
         </div>
      </div>

      <div className="flex justify-between items-center px-1">
        <h3 className="text-cyan-400 text-[11px] font-black uppercase tracking-[0.2em]">User Records</h3>
        <span className="text-[10px] font-black text-slate-500 uppercase bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700/30">Live Updates</span>
      </div>

      {/* User Cards List */}
      <div className="space-y-4">
        {filteredUsers.slice(0, 30).map(u => (
          <Card key={u.uid} className="!bg-slate-800/40 border-slate-700/30 !p-5 rounded-[2.5rem] relative group">
            {/* User Profile Info */}
            <div className="flex items-center gap-4 mb-6">
               <div className="relative shrink-0">
                  <Avatar src={u.avatar} size="lg" className="border-slate-700" />
                  <span className={`absolute bottom-1 right-1 w-3 h-3 rounded-full border-2 border-slate-800 ${u.isOnline ? 'bg-green-500' : 'bg-slate-500'}`}></span>
               </div>
               <div className="flex-1 min-w-0">
                  <h4 className="text-lg font-black text-white flex items-center gap-2 truncate">
                    {u.name}
                    {u.isVerified && <i className="fas fa-check-circle text-blue-500 text-sm"></i>}
                  </h4>
                  <div className="text-cyan-400 text-xs font-mono truncate">{u.email || `@${u.username}`}</div>
               </div>
               <button 
                  onClick={() => toggleBan(u.uid, u.banned)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${u.banned ? 'bg-red-500 text-white' : 'bg-slate-700/50 text-red-500 hover:bg-red-500/20'}`}
               >
                  <i className="fas fa-ban"></i>
               </button>
            </div>

            {/* Toggles Grid */}
            <div className="grid grid-cols-3 gap-2 mb-6 text-center">
               <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-700/30">
                  <div className="text-[9px] font-black text-slate-500 uppercase mb-2">Role</div>
                  <button onClick={() => toggleUserProp(u.uid, 'role', u.role === 'admin' ? true : false)} className={`w-10 h-5 rounded-full relative transition-colors ${u.role === 'admin' ? 'bg-cyan-500' : 'bg-slate-700'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${u.role === 'admin' ? 'left-5.5' : 'left-0.5'}`}></div>
                  </button>
                  <div className={`text-[9px] font-black mt-1 uppercase ${u.role === 'admin' ? 'text-cyan-400' : 'text-slate-500'}`}>{u.role || 'User'}</div>
               </div>
               <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-700/30">
                  <div className="text-[9px] font-black text-slate-500 uppercase mb-2">Verify</div>
                  <button onClick={() => toggleVerification(u.uid, u.isVerified)} className={`w-10 h-5 rounded-full relative transition-colors ${u.isVerified ? 'bg-blue-500' : 'bg-slate-700'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${u.isVerified ? 'left-5.5' : 'left-0.5'}`}></div>
                  </button>
                  <div className={`text-[9px] font-black mt-1 uppercase ${u.isVerified ? 'text-blue-400' : 'text-slate-500'}`}>{u.isVerified ? 'Active' : 'Standard'}</div>
               </div>
               <div className="bg-slate-900/50 p-3 rounded-2xl border border-slate-700/30">
                  <div className="text-[9px] font-black text-slate-500 uppercase mb-2">Support</div>
                  <button onClick={() => toggleSupport(u.uid, u.isSupport)} className={`w-10 h-5 rounded-full relative transition-colors ${u.isSupport ? 'bg-orange-500' : 'bg-slate-700'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${u.isSupport ? 'left-5.5' : 'left-0.5'}`}></div>
                  </button>
                  <div className={`text-[9px] font-black mt-1 uppercase ${u.isSupport ? 'text-orange-400' : 'text-slate-500'}`}>{u.isSupport ? 'Agent' : 'Restricted'}</div>
               </div>
            </div>

            {/* Point Adjuster */}
            <div className="flex items-center justify-between bg-slate-900/40 p-4 rounded-2xl border border-slate-700/50">
               <div>
                  <div className="text-[9px] font-black text-slate-500 uppercase">Current Points</div>
                  <div className="text-cyan-400 font-black text-sm">{u.points.toLocaleString()} PTS</div>
               </div>
               <div className="flex items-center gap-4 bg-slate-800/80 rounded-xl px-2 py-1">
                  <button onClick={() => adjustPoints(u.uid, u.points, -10)} className="text-slate-500 hover:text-white p-2"><i className="fas fa-minus"></i></button>
                  <span className="text-white font-black text-sm w-12 text-center">+{u.points}</span>
                  <button onClick={() => adjustPoints(u.uid, u.points, 10)} className="text-cyan-400 hover:text-white p-2"><i className="fas fa-plus"></i></button>
               </div>
               <button className="bg-cyan-500/20 text-cyan-400 w-10 h-10 rounded-xl flex items-center justify-center border border-cyan-500/30"><i className="fas fa-check"></i></button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );

  const QuizzesView = () => (
    <div className="space-y-6 animate__animated animate__fadeIn">
      {/* Top Controls */}
      <div className="flex items-center justify-between px-2">
         <div className="flex items-center gap-3">
           <div className="w-12 h-12 bg-cyan-400 rounded-2xl flex items-center justify-center text-slate-900 text-xl"><i className="fas fa-chart-bar"></i></div>
           <h2 className="text-white font-black text-2xl uppercase tracking-tighter">Quiz Manager</h2>
         </div>
         <div className="flex gap-2">
           <button onClick={() => { setSelectedChapter(''); setQuestions([]); }} className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-700"><i className="fas fa-sync-alt"></i></button>
           <button className="w-12 h-12 bg-cyan-400 rounded-2xl flex items-center justify-center text-slate-900 text-xl shadow-lg shadow-cyan-400/20"><i className="fas fa-user-circle"></i></button>
         </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
         <div className="relative">
            <div className="absolute top-2 left-4 text-[8px] font-black text-slate-500 uppercase tracking-widest z-10">Subject</div>
            <select 
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 pt-6 text-white font-black text-sm appearance-none shadow-lg focus:ring-2 focus:ring-cyan-400"
            >
              <option value="">Choose Subject</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <i className="fas fa-layer-group absolute right-4 bottom-4 text-slate-600"></i>
         </div>
         <div className="relative">
            <div className="absolute top-2 left-4 text-[8px] font-black text-slate-500 uppercase tracking-widest z-10">Chapter</div>
            <select 
              value={selectedChapter}
              onChange={e => setSelectedChapter(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-2xl p-4 pt-6 text-white font-black text-sm appearance-none shadow-lg focus:ring-2 focus:ring-cyan-400 disabled:opacity-50"
              disabled={!selectedSubject}
            >
              <option value="">Select Chapter</option>
              {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <i className="fas fa-square-full absolute right-4 bottom-4 text-cyan-400/50 scale-75"></i>
         </div>
      </div>

      {/* Meta Bar */}
      <div className="flex justify-between items-center text-slate-500 text-[10px] font-black uppercase tracking-widest px-1">
        <div className="flex gap-2 items-center">
           Admin <i className="fas fa-chevron-right text-[8px]"></i> 
           Math <i className="fas fa-chevron-right text-[8px]"></i> 
           <span className="text-cyan-400">Ch. 4</span>
        </div>
        <span className="bg-cyan-400/10 text-cyan-400 px-3 py-1 rounded-full border border-cyan-400/20">{questions.length} Questions</span>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div key={q.id} className="bg-slate-800/40 p-6 rounded-[2.5rem] border border-slate-700/50 relative overflow-hidden group">
            <div className="flex items-start gap-4">
               <div className="w-12 h-12 bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 rounded-2xl flex items-center justify-center font-black text-xl shrink-0">Q{idx+1}</div>
               <div className="flex-1">
                  <div className="text-cyan-400 text-[9px] font-black uppercase tracking-widest mb-1">Status: Live</div>
                  <h4 className="text-white font-bold leading-tight mb-4">{q.question}</h4>
                  <div className="flex gap-4">
                     <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2"><i className="fas fa-list-ul text-cyan-400"></i> {q.options.length} Options</span>
                     <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2"><i className="fas fa-star text-yellow-500"></i> Easy</span>
                     <span className="text-cyan-400 text-[9px] font-black uppercase ml-auto tracking-widest flex items-center gap-1 opacity-50"><i className="fas fa-database"></i> Sync ID: {String(q.id).substring(0,4)}</span>
                  </div>
               </div>
               <div className="flex flex-col gap-3">
                  <button onClick={() => setEditingQuestion(q)} className="w-10 h-10 rounded-xl bg-slate-700/50 text-cyan-400 flex items-center justify-center hover:bg-cyan-400 hover:text-slate-900 transition-all"><i className="fas fa-edit"></i></button>
                  <button onClick={() => handleDeleteQuestion(q.id)} className="w-10 h-10 rounded-xl bg-slate-700/50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"><i className="fas fa-trash"></i></button>
               </div>
            </div>
          </div>
        ))}
        {questions.length === 0 && <div className="text-center py-20 text-slate-600 font-black uppercase tracking-widest">Select a Chapter</div>}
      </div>

      {/* Floating Add Button */}
      <button className="fixed bottom-24 right-6 w-16 h-16 bg-cyan-400 rounded-full flex items-center justify-center text-slate-900 text-3xl shadow-[0_10px_30px_rgba(34,211,238,0.4)] z-10 active:scale-90 transition-transform"><i className="fas fa-plus"></i></button>
    </div>
  );

  const ArenaView = () => (
    <div className="space-y-6 animate__animated animate__fadeIn">
      {/* Header Cards */}
      <div className="bg-cyan-500 p-6 rounded-[2.5rem] shadow-xl shadow-cyan-500/20 relative overflow-hidden group">
         <div className="absolute top-0 right-0 p-4 opacity-20"><i className="fas fa-chart-line text-8xl"></i></div>
         <div className="relative z-10 flex justify-between items-center">
            <div>
               <div className="text-slate-900/50 text-[10px] font-black uppercase tracking-widest mb-1">Server Load</div>
               <div className="text-4xl font-black text-white">Optimal</div>
            </div>
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center text-white"><i className="fas fa-signal text-2xl"></i></div>
         </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
         <div className="bg-slate-800/50 p-6 rounded-[2.5rem] border border-slate-700/50">
            <div className="text-slate-500 text-[10px] font-black uppercase mb-1">Active</div>
            <div className="text-3xl font-black text-white">{matches.length} <span className="text-sm text-slate-500 font-bold uppercase">matches</span></div>
         </div>
         <div className="bg-slate-800/50 p-6 rounded-[2.5rem] border border-slate-700/50">
            <div className="text-slate-500 text-[10px] font-black uppercase mb-1">Latency</div>
            <div className="text-3xl font-black text-cyan-400">24<span className="text-sm font-bold uppercase ml-1">ms</span></div>
         </div>
      </div>

      <div className="flex justify-between items-center px-1">
         <h3 className="text-white font-black uppercase tracking-tighter text-lg">Real-time Feed</h3>
         <span className="text-[9px] font-black text-green-400 uppercase bg-green-400/10 px-3 py-1 rounded-full border border-green-400/20 flex items-center gap-2"><i className="fas fa-circle text-[6px] animate-pulse"></i> Live Sync</span>
      </div>

      {/* Matches List */}
      <div className="space-y-4">
        {matches.map(m => {
           const pIds = Object.keys(m.players || {});
           return (
            <div key={m.matchId} className="bg-slate-800/40 p-6 rounded-[2.5rem] border border-slate-700/50 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-24 h-1 bg-cyan-400"></div>
               <div className="flex justify-between items-start mb-4">
                  <div>
                    <h4 className="text-lg font-black text-white">{m.subjectTitle || 'Battle Arena'} #{String(m.matchId).substring(6,9)}</h4>
                    <div className="text-slate-500 text-[10px] font-bold uppercase mt-1">Duration: 12:45 • Room: US-EAST-1</div>
                  </div>
                  <span className="bg-cyan-400/10 text-cyan-400 text-[9px] font-black px-3 py-1 rounded-lg border border-cyan-400/20 uppercase tracking-widest">Level 4</span>
               </div>
               
               <div className="flex items-center gap-3 mb-6">
                  <div className="flex -space-x-3">
                    {pIds.map(uid => (
                      <Avatar key={uid} src={m.players[uid].avatar} size="sm" className="border-2 border-slate-800" />
                    ))}
                    {pIds.length > 2 && <div className="w-10 h-10 rounded-full bg-slate-900 border-2 border-slate-800 flex items-center justify-center text-[10px] font-black text-white">+{pIds.length-2}</div>}
                  </div>
                  <div className="text-[11px] text-slate-400 font-bold ml-2">Alex, Sarah, and {pIds.length-2} others</div>
               </div>

               <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => navigate(`/game/${m.matchId}`)} className="bg-slate-700/50 text-cyan-400 py-3 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 hover:bg-cyan-400 hover:text-slate-900 transition-all border border-slate-700"><i className="fas fa-eye"></i> Spectate</button>
                  <button onClick={() => terminateMatch(m.matchId)} className="bg-red-500/10 text-red-500 py-3 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 hover:bg-red-500 hover:text-white transition-all border border-red-500/20"><i className="fas fa-ban"></i> Terminate</button>
               </div>
            </div>
           )
        })}
      </div>
    </div>
  );

  const ReportsView = () => (
    <div className="space-y-6 animate__animated animate__fadeIn">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
         <div className="bg-slate-800/50 p-6 rounded-[2.5rem] border border-slate-700/50">
            <div className="text-slate-500 text-[10px] font-black uppercase mb-1">Pending</div>
            <div className="text-4xl font-black text-white">{reports.length} <span className="text-sm text-cyan-400 ml-1 font-black">+3%</span></div>
            <div className="w-full h-1 bg-slate-700 rounded-full mt-4 overflow-hidden"><div className="w-1/3 h-full bg-cyan-400"></div></div>
         </div>
         <div className="bg-slate-800/50 p-6 rounded-[2.5rem] border border-slate-700/50">
            <div className="text-slate-500 text-[10px] font-black uppercase mb-1">Top Issue</div>
            <div className="text-2xl font-black text-white">Inaccurate</div>
            <div className="text-cyan-400 text-[10px] font-black uppercase mt-2 tracking-widest">65% of reports</div>
         </div>
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar py-2">
         <button onClick={() => setReportFilter('all')} className={`px-6 py-2.5 rounded-full font-black text-sm transition-all shadow-lg ${reportFilter === 'all' ? 'bg-cyan-400 text-slate-900' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>All</button>
         <button onClick={() => setReportFilter('wrong_answer')} className={`px-6 py-2.5 rounded-full font-black text-sm transition-all ${reportFilter === 'wrong_answer' ? 'bg-cyan-400 text-slate-900' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>Inaccurate</button>
         <button onClick={() => setReportFilter('typo')} className={`px-6 py-2.5 rounded-full font-black text-sm transition-all ${reportFilter === 'typo' ? 'bg-cyan-400 text-slate-900' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>Typo</button>
         <button onClick={() => setReportFilter('other')} className={`px-6 py-2.5 rounded-full font-black text-sm transition-all ${reportFilter === 'other' ? 'bg-cyan-400 text-slate-900' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>Spam</button>
      </div>

      {/* Reports List */}
      <div className="space-y-4">
         {filteredReports.map(r => (
           <div key={r.id} className="bg-slate-800/40 p-6 rounded-[2.5rem] border border-slate-700/50 relative overflow-hidden group">
              <div className="flex justify-between items-start mb-4">
                 <div>
                    <span className="text-cyan-400 text-[10px] font-black uppercase tracking-widest">#Q-{String(r.questionId).substring(0,4)}</span>
                    <div className="text-slate-500 text-[9px] font-black uppercase mt-1">Physics • Grade 10</div>
                 </div>
                 <div className="text-slate-600 text-[10px] font-black uppercase">2M Ago</div>
              </div>
              
              <div className="flex gap-4 mb-6">
                 <div className="w-12 h-12 bg-orange-500/10 text-orange-500 border border-orange-500/20 rounded-2xl flex items-center justify-center text-xl shrink-0"><i className="fas fa-exclamation-circle"></i></div>
                 <div>
                    <h4 className="text-white font-black text-base">{getReasonLabel(r.reason)}</h4>
                    <p className="text-slate-500 italic text-xs leading-relaxed mt-1">"{r.questionText.substring(0, 80)}..."</p>
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <button onClick={() => handleEditReported(r)} className="bg-cyan-400/10 text-cyan-400 py-3 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 border border-cyan-400/20 hover:bg-cyan-400 hover:text-slate-900 transition-all"><i className="fas fa-list-check"></i> Review & Fix</button>
                 <button onClick={() => handleClearReport(r.id)} className="bg-slate-700/30 text-slate-500 py-3 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 border border-slate-700/50 hover:bg-slate-700 hover:text-white transition-all"><i className="fas fa-times"></i> Dismiss</button>
              </div>
           </div>
         ))}
         {filteredReports.length === 0 && <div className="text-center py-20 text-slate-600 font-black uppercase tracking-widest">No Flags Pending</div>}
      </div>
    </div>
  );

  const SocialView = () => (
    <div className="space-y-6 animate__animated animate__fadeIn">
      {/* Header */}
      <div className="flex items-center gap-3 px-2">
         <div className="w-12 h-12 bg-cyan-400 rounded-2xl flex items-center justify-center text-slate-900 text-xl"><i className="fas fa-smile"></i></div>
         <h2 className="text-white font-black text-2xl uppercase tracking-tighter">Reaction Settings</h2>
      </div>

      {/* Emoji Grid Section */}
      <section className="space-y-4">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-white font-black text-lg uppercase tracking-tight">Active Emojis</h3>
          <span className="text-cyan-400 text-[10px] font-black uppercase tracking-widest bg-cyan-400/10 px-3 py-1 rounded-full border border-cyan-400/20">{emojis.length}/8</span>
        </div>
        <div className="grid grid-cols-4 gap-4">
           {emojis.map(e => (
             <div key={e.id} className="aspect-square bg-slate-800/60 rounded-2xl border border-slate-700/50 flex items-center justify-center text-3xl relative group">
                {e.value}
                <button onClick={() => handleDeleteReaction('emojis', e.id)} className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center shadow-lg transform scale-0 group-hover:scale-100 transition-transform"><i className="fas fa-times"></i></button>
             </div>
           ))}
           {emojis.length < 8 && (
             <button className="aspect-square border-2 border-dashed border-slate-700 rounded-2xl flex items-center justify-center text-slate-600 text-2xl hover:border-cyan-400 hover:text-cyan-400 transition-all"><i className="fas fa-plus"></i></button>
           )}
        </div>
      </section>

      {/* PTT Messages List */}
      <section className="space-y-4">
        <h3 className="text-white font-black text-lg uppercase tracking-tight px-1">PTT Messages</h3>
        <div className="space-y-3">
          {messages.map(m => (
            <div key={m.id} className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50 flex items-center justify-between group">
               <div className="flex items-center gap-4">
                  <i className="fas fa-grip-vertical text-slate-700 cursor-move"></i>
                  <span className="text-white font-bold text-sm tracking-tight">{m.value}</span>
               </div>
               <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="text-cyan-400 hover:text-white transition-colors p-2"><i className="fas fa-pencil-alt"></i></button>
                  <button onClick={() => handleDeleteReaction('messages', m.id)} className="text-red-500 hover:text-white transition-colors p-2"><i className="fas fa-trash"></i></button>
               </div>
            </div>
          ))}
          <button className="w-full py-4 border-2 border-dashed border-slate-700 rounded-2xl flex items-center justify-center gap-3 text-cyan-400 font-black text-sm uppercase tracking-widest hover:border-cyan-400 transition-all">
            <i className="fas fa-plus-circle"></i> New Message
          </button>
        </div>
      </section>

      <div className="pt-4">
        <Button fullWidth className="!bg-cyan-500 !py-5 shadow-xl shadow-cyan-500/30 rounded-[1.5rem]" onClick={handleSeedDefaults}>
           <i className="fas fa-layer-group mr-2"></i> Load Somali Defaults
        </Button>
        <p className="text-center text-slate-500 text-[8px] mt-4 font-black uppercase tracking-[0.2em] max-w-[250px] mx-auto opacity-60">Note: Loading defaults will overwrite current PTT configuration and sync to all active game clients.</p>
      </div>
    </div>
  );

  const getReasonLabel = (reason: string) => {
      switch(reason) {
          case 'wrong_answer': return 'Incorrect Answer Key';
          case 'typo': return 'Typo in Question';
          case 'other': return 'Inappropriate Content';
          default: return reason;
      }
  };

  const toggleBan = async (uid: string, current: boolean = false) => {
    if (await showConfirm("Update Access?", `${!current ? 'Ban' : 'Unban'} this user?`)) {
       await update(ref(db, `users/${uid}`), { banned: !current });
       showToast("Updated", "success");
    }
  };

  const toggleVerification = async (uid: string, current: boolean = false) => {
    await update(ref(db, `users/${uid}`), { isVerified: !current, verificationNotificationPending: !current });
  };

  const toggleSupport = async (uid: string, current: boolean = false) => {
    await update(ref(db, `users/${uid}`), { isSupport: !current });
  };

  const handleClearReport = async (id: string) => {
    await remove(ref(db, `reports/${id}`));
    showToast("Cleared", "success");
  };

  const handleEditReported = async (report: QuestionReport) => {
    const qSnap = await get(ref(db, `questions/${report.chapterId}/${report.questionId}`));
    if (qSnap.exists()) setEditingQuestion({ id: report.questionId, ...qSnap.val(), subject: report.chapterId });
  };

  const handleDeleteReaction = async (type: string, id: string) => {
    await remove(ref(db, `settings/reactions/${type}/${id}`));
  };

  const handleSeedDefaults = async () => {
      const DEFAULT_EMOJIS = ['😂', '😡', '👏', '😱', '🥲', '🔥', '🏆', '🤯'];
      const DEFAULT_MESSAGES = ['Nasiib wacan!', 'Aad u fiican', 'Iska jir!', 'Hala soo baxo!', 'Mahadsanid'];
      const updates: any = {};
      DEFAULT_EMOJIS.forEach(e => updates[`settings/reactions/emojis/${push(ref(db, 'settings/reactions/emojis')).key}`] = e);
      DEFAULT_MESSAGES.forEach(m => updates[`settings/reactions/messages/${push(ref(db, 'settings/reactions/messages')).key}`] = m);
      await update(ref(db), updates);
      showToast('Defaults Initialized', 'success');
  };

  // --- FINAL RENDER ---

  if (!isAuthenticated) {
      return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 p-4">
              <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-[3rem] shadow-2xl shadow-cyan-500/10">
                  <div className="text-center mb-8">
                      <div className="w-20 h-20 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-slate-700 shadow-inner group">
                          <i className="fas fa-shield-halved text-4xl text-cyan-400 group-hover:scale-110 transition-transform"></i>
                      </div>
                      <h1 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter italic">Command Center</h1>
                      <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Administrator Login</p>
                  </div>
                  <form onSubmit={checkPin}>
                      <div className="relative mb-6">
                        <i className="fas fa-lock absolute left-5 top-1/2 -translate-y-1/2 text-slate-600"></i>
                        <input 
                            type="password" 
                            placeholder="SECURITY PIN" 
                            value={pin} 
                            onChange={e => setPin(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-5 text-center text-2xl tracking-[0.8em] font-mono text-cyan-400 focus:ring-2 focus:ring-cyan-500 outline-none transition-all placeholder:text-slate-800"
                            autoFocus
                        />
                      </div>
                      <Button fullWidth className="!bg-cyan-500 !py-5 shadow-xl shadow-cyan-500/20 rounded-2xl font-black text-lg italic">AUTHENTICATE</Button>
                  </form>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans transition-colors overflow-hidden">
        {/* Header: Command Center Style */}
        <header className="px-6 py-8 flex items-center justify-between z-30">
            <div className="flex items-center gap-4">
                <Avatar src="https://api.dicebear.com/7.x/avataaars/svg?seed=Admin" size="sm" className="border-cyan-400 ring-2 ring-cyan-400/20" />
                <div>
                   <div className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Command Center</div>
                   <h1 className="text-xl font-black text-white tracking-tighter">Good Morning, Admin</h1>
                </div>
            </div>
            <div className="relative">
               <button className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                  <i className="fas fa-bell"></i>
               </button>
               {reports.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-slate-950"></span>}
            </div>
        </header>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto px-6 pb-32 pt-2 custom-scrollbar">
            {activeTab === 'home' && <DashboardView />}
            {activeTab === 'users' && <UsersView />}
            {activeTab === 'quizzes' && <QuizzesView />}
            {activeTab === 'arena' && <ArenaView />}
            {activeTab === 'reports' && <ReportsView />}
            {activeTab === 'social' && <SocialView />}
        </main>

        {/* Bottom Navigation: High Fidelity Style */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900/90 backdrop-blur-xl border-t border-slate-800 p-4">
           <div className="max-w-md mx-auto flex items-center justify-between px-2">
              {[
                  { id: 'home', icon: 'fa-th-large', label: 'Home' },
                  { id: 'users', icon: 'fa-user-group', label: 'Users' },
                  { id: 'quizzes', icon: 'fa-question-circle', label: 'Quizzes' },
                  { id: 'arena', icon: 'fa-bolt', label: 'Arena' },
                  { id: 'social', icon: 'fa-smile', label: 'Social' }
              ].map(item => (
                <button 
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === item.id ? 'text-cyan-400' : 'text-slate-600 hover:text-slate-400'}`}
                >
                  <div className={`w-12 h-12 flex items-center justify-center rounded-2xl transition-all ${activeTab === item.id ? 'bg-cyan-400/10' : ''}`}>
                    <i className={`fas ${item.icon} text-xl`}></i>
                  </div>
                  <span className={`text-[8px] font-black uppercase tracking-widest ${activeTab === item.id ? 'opacity-100' : 'opacity-0 translate-y-1'}`}>{item.label}</span>
                </button>
              ))}
           </div>
        </nav>

        {/* Sync Footer */}
        <div className="fixed bottom-24 left-0 right-0 flex justify-center pointer-events-none opacity-40">
           <div className="bg-slate-900/50 px-6 py-2 rounded-full border border-slate-800 flex items-center gap-3">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Firebase Connected</span>
           </div>
        </div>

        {/* Modals: Preserving Logic */}
        {editingQuestion && (
            <Modal isOpen={true} title="Edit Question" onClose={() => setEditingQuestion(null)}>
                <div className="space-y-4 pt-2">
                    <Input 
                        label="Question Text" 
                        value={editingQuestion.question} 
                        onChange={(e) => setEditingQuestion({...editingQuestion, question: e.target.value})}
                        className="!bg-slate-900 !border-slate-700 !text-white"
                    />
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Options</label>
                        {editingQuestion.options.map((opt, idx) => (
                            <div key={idx} className="flex gap-2">
                                <button 
                                  onClick={() => setEditingQuestion({...editingQuestion, answer: idx})}
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-black transition-all ${editingQuestion.answer === idx ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400'}`}
                                >
                                  {String.fromCharCode(65+idx)}
                                </button>
                                <input 
                                    value={opt}
                                    onChange={(e) => {
                                        const newOpts = [...editingQuestion.options];
                                        newOpts[idx] = e.target.value;
                                        setEditingQuestion({...editingQuestion, options: newOpts});
                                    }}
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white font-bold"
                                />
                            </div>
                        ))}
                    </div>
                    <div className="pt-4 flex gap-3">
                         <Button fullWidth variant="outline" onClick={() => setEditingQuestion(null)} className="!border-slate-700 !text-slate-500">Cancel</Button>
                         <Button fullWidth onClick={handleUpdateQuestion} className="!bg-cyan-500">Save Changes</Button>
                    </div>
                </div>
            </Modal>
        )}
    </div>
  );
};

export default SuperAdminPage;
