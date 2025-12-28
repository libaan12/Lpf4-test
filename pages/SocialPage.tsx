import React, { useState, useEffect, useContext } from 'react';
import { ref, onValue, off, update, push, remove } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { UserProfile } from '../types';
import { Button, Input, Avatar, Card, Modal } from '../components/UI';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../services/audioService';
import { showToast } from '../services/alert';

const SocialPage: React.FC = () => {
  const { user, profile } = useContext(UserContext);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'friends' | 'explore' | 'requests'>('friends');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<{uid: string, user: UserProfile}[]>([]);
  
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Load Data
  useEffect(() => {
      if (!user) return;
      const usersRef = ref(db, 'users');
      
      const handleData = (snap: any) => {
          if (!snap.exists()) return;
          const data = snap.val();
          
          // Process Requests
          const myRequests = data[user.uid]?.friendRequests || {};
          const reqList: any[] = [];
          Object.keys(myRequests).forEach(reqUid => {
              if (data[reqUid]) reqList.push({ uid: reqUid, user: { uid: reqUid, ...data[reqUid] } });
          });
          setRequests(reqList);

          // Process Friends
          const myFriends = data[user.uid]?.friends || {};
          const friendList: UserProfile[] = [];
          Object.keys(myFriends).forEach(fUid => {
              if (data[fUid]) friendList.push({ uid: fUid, ...data[fUid] });
          });
          setFriends(friendList);

          // Process All Users (for Explore)
          const all: UserProfile[] = Object.keys(data).map(k => ({ uid: k, ...data[k] }));
          // Filter out self and already friends
          setAllUsers(all.filter(u => u.uid !== user.uid && !myFriends[u.uid]));
      };

      onValue(usersRef, handleData);
      return () => off(usersRef);
  }, [user]);

  const sendRequest = async (targetUid: string) => {
      if (!user) return;
      try {
          await update(ref(db, `users/${targetUid}/friendRequests`), {
              [user.uid]: true
          });
          showToast("Friend request sent!", "success");
          playSound('click');
      } catch (e) {
          console.error(e);
      }
  };

  const acceptRequest = async (targetUid: string) => {
      if (!user) return;
      try {
          const updates: any = {};
          // Add to my friends
          updates[`users/${user.uid}/friends/${targetUid}`] = true;
          // Add to their friends
          updates[`users/${targetUid}/friends/${user.uid}`] = true;
          // Remove request
          updates[`users/${user.uid}/friendRequests/${targetUid}`] = null;
          
          await update(ref(db), updates);
          showToast("Friend added!", "success");
          playSound('correct');
      } catch (e) {
          console.error(e);
      }
  };

  const rejectRequest = async (targetUid: string) => {
      if (!user) return;
      try {
          await remove(ref(db, `users/${user.uid}/friendRequests/${targetUid}`));
          playSound('click');
      } catch (e) { console.error(e); }
  };

  const startChat = (targetUid: string) => {
      navigate(`/chat/${targetUid}`);
  };

  const filteredExplore = allUsers.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (u.username && u.username.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="min-h-full p-4 flex flex-col pb-24 max-w-4xl mx-auto w-full">
       {/* Header */}
       <div className="sticky top-0 z-30 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-md -mx-4 px-4 py-3 mb-6 border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm flex items-center justify-between transition-colors">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white uppercase italic tracking-tight">Social Hub</h1>
            <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl">
                <button onClick={() => setActiveTab('friends')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'friends' ? 'bg-white shadow text-game-primary' : 'text-slate-500'}`}>Friends</button>
                <button onClick={() => setActiveTab('explore')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'explore' ? 'bg-white shadow text-game-primary' : 'text-slate-500'}`}>Explore</button>
                <button onClick={() => setActiveTab('requests')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'requests' ? 'bg-white shadow text-game-primary' : 'text-slate-500'}`}>
                    Requests {requests.length > 0 && <span className="ml-1 bg-red-500 text-white px-1.5 rounded-full text-[10px]">{requests.length}</span>}
                </button>
            </div>
       </div>

       {/* FRIENDS TAB */}
       {activeTab === 'friends' && (
           <div className="space-y-4 animate__animated animate__fadeIn">
               {friends.length === 0 ? (
                   <div className="text-center py-10 text-slate-400">
                       <i className="fas fa-user-friends text-4xl mb-3 opacity-50"></i>
                       <p className="font-bold">No friends yet.</p>
                       <Button size="sm" variant="secondary" className="mt-4" onClick={() => setActiveTab('explore')}>Find Students</Button>
                   </div>
               ) : (
                   friends.map(f => (
                       <div key={f.uid} onClick={() => setSelectedUser(f)} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                           <div className="flex items-center gap-3">
                               <div className="relative">
                                  <Avatar src={f.avatar} seed={f.uid} size="md" isVerified={f.isVerified} />
                                  <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-800 ${f.isOnline ? 'bg-green-500' : 'bg-slate-400'}`}></div>
                               </div>
                               <div>
                                   <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1">{f.name} {f.isVerified && <i className="fas fa-check-circle text-blue-500 text-xs"></i>}</div>
                                   <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">@{f.username}</div>
                               </div>
                           </div>
                           <button onClick={(e) => { e.stopPropagation(); startChat(f.uid); }} className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-game-primary flex items-center justify-center hover:bg-game-primary hover:text-white transition-all shadow-sm">
                               <i className="fas fa-comment"></i>
                           </button>
                       </div>
                   ))
               )}
           </div>
       )}

       {/* EXPLORE TAB */}
       {activeTab === 'explore' && (
           <div className="space-y-4 animate__animated animate__fadeIn">
               <Input 
                  placeholder="Search students..." 
                  icon="fa-search" 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
               />
               
               <div className="space-y-3">
                   {filteredExplore.map(u => (
                       <div key={u.uid} onClick={() => setSelectedUser(u)} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                            <div className="flex items-center gap-3">
                               <Avatar src={u.avatar} seed={u.uid} size="md" isVerified={u.isVerified} />
                               <div>
                                   <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1">{u.name} {u.isVerified && <i className="fas fa-check-circle text-blue-500 text-xs"></i>}</div>
                                   <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">@{u.username || 'unknown'}</div>
                               </div>
                           </div>
                           <button 
                             onClick={(e) => { e.stopPropagation(); sendRequest(u.uid); }}
                             className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-game-primary hover:text-white transition-colors"
                           >
                               <i className="fas fa-user-plus mr-1"></i> Add
                           </button>
                       </div>
                   ))}
                   {filteredExplore.length === 0 && <div className="text-center text-slate-400 py-4">No users found.</div>}
               </div>
           </div>
       )}

       {/* REQUESTS TAB */}
       {activeTab === 'requests' && (
           <div className="space-y-4 animate__animated animate__fadeIn">
               {requests.length === 0 ? (
                   <div className="text-center py-10 text-slate-400 font-bold">No pending requests.</div>
               ) : (
                   requests.map(r => (
                       <div key={r.uid} className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                               <Avatar src={r.user.avatar} seed={r.user.uid} size="md" isVerified={r.user.isVerified} />
                               <div>
                                   <div className="font-bold text-slate-900 dark:text-white">{r.user.name}</div>
                                   <div className="text-xs text-slate-500 dark:text-slate-400">wants to be friends</div>
                               </div>
                           </div>
                           <div className="flex gap-2 w-full sm:w-auto">
                               <Button size="sm" fullWidth onClick={() => acceptRequest(r.uid)}><i className="fas fa-check mr-1"></i> Accept</Button>
                               <Button size="sm" variant="outline" fullWidth onClick={() => rejectRequest(r.uid)}><i className="fas fa-times"></i></Button>
                           </div>
                       </div>
                   ))
               )}
           </div>
       )}

       {/* User Profile Modal */}
       {selectedUser && (
           <Modal isOpen={true} onClose={() => setSelectedUser(null)} title="Student Card">
               <div className="flex flex-col items-center mb-6">
                   <Avatar src={selectedUser.avatar} seed={selectedUser.uid} size="xl" isVerified={selectedUser.isVerified} className="mb-4 shadow-xl border-4 border-white dark:border-slate-700" />
                   <h2 className="text-2xl font-black text-slate-900 dark:text-white text-center flex items-center gap-2">
                       {selectedUser.name}
                       {selectedUser.isVerified && <i className="fas fa-check-circle text-blue-500 text-lg"></i>}
                   </h2>
                   <p className="text-slate-500 dark:text-slate-400 font-mono font-bold mb-4">@{selectedUser.username}</p>
                   
                   <div className="grid grid-cols-2 gap-4 w-full">
                       <div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl text-center">
                           <div className="text-xs text-slate-400 font-bold uppercase">Level</div>
                           <div className="text-xl font-black text-slate-800 dark:text-white">{Math.floor(selectedUser.points / 10) + 1}</div>
                       </div>
                       <div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl text-center">
                           <div className="text-xs text-slate-400 font-bold uppercase">Points</div>
                           <div className="text-xl font-black text-game-primary dark:text-blue-400">{selectedUser.points}</div>
                       </div>
                   </div>
               </div>
               
               <div className="flex gap-3">
                   {!friends.find(f => f.uid === selectedUser.uid) ? (
                        <Button fullWidth onClick={() => { sendRequest(selectedUser.uid); setSelectedUser(null); }}>Send Friend Request</Button>
                   ) : (
                        <Button fullWidth onClick={() => { startChat(selectedUser.uid); setSelectedUser(null); }}><i className="fas fa-comment mr-2"></i> Message</Button>
                   )}
               </div>
           </Modal>
       )}
    </div>
  );
};

export default SocialPage;