
import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, off, update, remove } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { UserProfile, MatchState } from '../types';
import { Button, Input, Card, Modal, Avatar } from '../components/UI';
import { showToast, showConfirm, showPrompt } from '../services/alert';

export const SupportDashboard: React.FC = () => {
  const { user, profile } = useContext(UserContext);
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'users' | 'matches'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [matches, setMatches] = useState<MatchState[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modals
  const [editingPointsUser, setEditingPointsUser] = useState<UserProfile | null>(null);
  const [newPoints, setNewPoints] = useState<string>('');

  useEffect(() => {
      // Redirect if not support
      if (profile && !profile.isSupport) {
          navigate('/');
      }
  }, [profile, navigate]);

  // Fetch Users
  useEffect(() => {
      const usersRef = ref(db, 'users');
      const unsub = onValue(usersRef, (snapshot) => {
          if (snapshot.exists()) {
              const data = snapshot.val();
              const list: UserProfile[] = Object.keys(data).map(k => ({ uid: k, ...data[k] }));
              setUsers(list.reverse()); // Newest first
          } else {
              setUsers([]);
          }
      });
      return () => off(usersRef);
  }, []);

  // Fetch Matches
  useEffect(() => {
      const matchesRef = ref(db, 'matches');
      const unsub = onValue(matchesRef, (snapshot) => {
          if (snapshot.exists()) {
              const data = snapshot.val();
              const list: MatchState[] = Object.keys(data).map(k => ({ matchId: k, ...data[k] }));
              setMatches(list.filter(m => m.status === 'active').reverse());
          } else {
              setMatches([]);
          }
      });
      return () => off(matchesRef);
  }, []);

  // Actions
  const handleVerify = async (target: UserProfile) => {
      try {
          await update(ref(db, `users/${target.uid}`), { 
              isVerified: !target.isVerified,
              verificationNotificationPending: !target.isVerified // Notify if granting
          });
          showToast(`User ${target.isVerified ? 'Unverified' : 'Verified'}`, 'success');
      } catch(e) { showToast("Action failed", "error"); }
  };

  const handleBan = async (target: UserProfile) => {
      const confirm = await showConfirm(
          target.banned ? "Unban User?" : "Ban User?", 
          target.banned ? "Restore access?" : "User will be logged out immediately."
      );
      if (!confirm) return;
      
      try {
          await update(ref(db, `users/${target.uid}`), { banned: !target.banned });
          if (!target.banned) {
              await update(ref(db, `users/${target.uid}`), { activeMatch: null });
          }
          showToast(`User ${target.banned ? 'Unbanned' : 'Banned'}`, 'success');
      } catch(e) { showToast("Action failed", "error"); }
  };

  const handleDelete = async (targetUid: string) => {
      const confirm = await showConfirm("Delete User?", "This action is irreversible.", "Delete", "Cancel", "danger");
      if (!confirm) return;
      try {
          await remove(ref(db, `users/${targetUid}`));
          showToast("User Deleted", "success");
      } catch(e) { showToast("Delete failed", "error"); }
  };

  const openPointEditor = (u: UserProfile) => {
      setEditingPointsUser(u);
      setNewPoints(String(u.points || 0));
  };

  const savePoints = async () => {
      if (!editingPointsUser) return;
      const pts = parseInt(newPoints);
      if (isNaN(pts)) return;
      
      try {
          await update(ref(db, `users/${editingPointsUser.uid}`), { points: pts });
          setEditingPointsUser(null);
          showToast("Points Updated", "success");
      } catch(e) { showToast("Update failed", "error"); }
  };

  const terminateMatch = async (matchId: string) => {
      const confirm = await showConfirm("End Match?", "Force stop this game?");
      if (!confirm) return;
      try {
          await remove(ref(db, `matches/${matchId}`));
          showToast("Match Terminated", "success");
      } catch(e) { showToast("Failed", "error"); }
  };

  const spectateMatch = (matchId: string) => {
      navigate(`/game/${matchId}`);
  };

  const filteredUsers = users.filter(u => 
      u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col font-sans transition-colors pt-20">
        {/* Header */}
        <div className="fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-700 px-6 py-4 shadow-sm flex justify-between items-center">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-game-primary transition-colors">
                    <i className="fas fa-arrow-left"></i>
                </button>
                <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                    <i className="fas fa-headset text-game-primary"></i> Support Console
                </h1>
            </div>
            <div className="flex gap-2">
                <div className="bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-xl flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">{matches.length} Live Games</span>
                </div>
            </div>
        </div>

        <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <Card className="!p-4 border-l-4 border-blue-500">
                    <div className="text-xs font-bold text-slate-400 uppercase">Total Users</div>
                    <div className="text-2xl font-black text-slate-800 dark:text-white">{users.length}</div>
                </Card>
                <Card className="!p-4 border-l-4 border-green-500">
                    <div className="text-xs font-bold text-slate-400 uppercase">Verified</div>
                    <div className="text-2xl font-black text-slate-800 dark:text-white">{users.filter(u => u.isVerified).length}</div>
                </Card>
                <Card className="!p-4 border-l-4 border-red-500">
                    <div className="text-xs font-bold text-slate-400 uppercase">Banned</div>
                    <div className="text-2xl font-black text-slate-800 dark:text-white">{users.filter(u => u.banned).length}</div>
                </Card>
                <Card className="!p-4 border-l-4 border-purple-500">
                    <div className="text-xs font-bold text-slate-400 uppercase">Support Staff</div>
                    <div className="text-2xl font-black text-slate-800 dark:text-white">{users.filter(u => u.isSupport).length}</div>
                </Card>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 mb-6 border-b border-slate-200 dark:border-slate-700 pb-1">
                <button 
                    onClick={() => setActiveTab('users')} 
                    className={`pb-3 px-4 font-bold text-sm uppercase tracking-wide transition-all ${activeTab === 'users' ? 'text-game-primary border-b-2 border-game-primary' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    User Management
                </button>
                <button 
                    onClick={() => setActiveTab('matches')} 
                    className={`pb-3 px-4 font-bold text-sm uppercase tracking-wide transition-all ${activeTab === 'matches' ? 'text-game-primary border-b-2 border-game-primary' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Live Arena
                </button>
            </div>

            {/* USERS TAB */}
            {activeTab === 'users' && (
                <div className="animate__animated animate__fadeIn">
                    <div className="mb-6 relative max-w-md">
                        <Input 
                            placeholder="Search by name or username..." 
                            icon="fa-search" 
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                        />
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4">
                        {filteredUsers.slice(0, 50).map(u => (
                            <div key={u.uid} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <Avatar src={u.avatar} seed={u.uid} size="md" isVerified={u.isVerified} isSupport={u.isSupport} />
                                    <div>
                                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            {u.name}
                                            {u.banned && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded uppercase">Banned</span>}
                                        </div>
                                        <div className="text-xs text-slate-500 font-mono">@{u.username || 'guest'}</div>
                                        <div className="text-xs text-game-primary font-black mt-1">{u.points} PTS <span className="text-slate-300">|</span> LVL {Math.floor(u.points/10)+1}</div>
                                    </div>
                                </div>
                                
                                <div className="flex flex-wrap gap-2">
                                    <button onClick={() => handleVerify(u)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${u.isVerified ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                        {u.isVerified ? 'Revoke Badge' : 'Verify'}
                                    </button>
                                    <button onClick={() => openPointEditor(u)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100">
                                        Adjust Points
                                    </button>
                                    <button onClick={() => handleBan(u)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${u.banned ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                        {u.banned ? 'Unban' : 'Ban'}
                                    </button>
                                    <button onClick={() => handleDelete(u.uid)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-200">
                                        <i className="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* MATCHES TAB */}
            {activeTab === 'matches' && (
                <div className="animate__animated animate__fadeIn grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {matches.length === 0 && (
                        <div className="col-span-full text-center py-20 text-slate-400">
                            <i className="fas fa-gamepad text-4xl mb-4"></i>
                            <p>No active matches right now.</p>
                        </div>
                    )}
                    {matches.map(m => {
                        const pIds = Object.keys(m.players || {});
                        const p1 = m.players?.[pIds[0]];
                        const p2 = m.players?.[pIds[1]];
                        const scores = m.scores || {}; // Safeguard
                        
                        return (
                            <div key={m.matchId} className="bg-white dark:bg-slate-800 rounded-3xl p-5 shadow-lg border border-slate-200 dark:border-slate-700 relative overflow-hidden group hover:border-game-primary transition-colors">
                                <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-black px-3 py-1 rounded-bl-xl">
                                    LIVE Q{m.currentQ+1}
                                </div>
                                <div className="text-center mb-4">
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{m.subjectTitle}</div>
                                </div>
                                
                                <div className="flex justify-between items-center mb-6">
                                    <div className="text-center">
                                        <Avatar src={p1?.avatar} size="sm" className="mx-auto mb-2" />
                                        <div className="font-bold text-xs truncate w-20">{p1?.name}</div>
                                        <div className="font-black text-lg text-game-primary">{scores[pIds[0]] ?? 0}</div>
                                    </div>
                                    <div className="text-xl font-black text-slate-300 italic">VS</div>
                                    <div className="text-center">
                                        <Avatar src={p2?.avatar} size="sm" className="mx-auto mb-2" />
                                        <div className="font-bold text-xs truncate w-20">{p2?.name}</div>
                                        <div className="font-black text-lg text-red-500">{scores[pIds[1]] ?? 0}</div>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-2">
                                    <button onClick={() => spectateMatch(m.matchId)} className="bg-slate-100 dark:bg-slate-700 hover:bg-game-primary hover:text-white text-slate-600 dark:text-slate-300 py-2 rounded-xl text-xs font-bold transition-colors">
                                        <i className="fas fa-eye mr-1"></i> Spectate
                                    </button>
                                    <button onClick={() => terminateMatch(m.matchId)} className="bg-red-50 dark:bg-red-900/20 hover:bg-red-500 hover:text-white text-red-600 dark:text-red-400 py-2 rounded-xl text-xs font-bold transition-colors">
                                        <i className="fas fa-stop mr-1"></i> End
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>

        {/* Edit Points Modal */}
        <Modal isOpen={!!editingPointsUser} title="Edit Points" onClose={() => setEditingPointsUser(null)}>
            <div className="space-y-4">
                <p className="text-sm text-slate-500">Adjusting points for <b>{editingPointsUser?.name}</b></p>
                <Input 
                    type="number" 
                    value={newPoints} 
                    onChange={e => setNewPoints(e.target.value)} 
                    placeholder="Enter points value" 
                />
                <Button fullWidth onClick={savePoints}>Save Changes</Button>
            </div>
        </Modal>
    </div>
  );
};
