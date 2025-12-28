import React, { useState, useEffect, useContext, useRef } from 'react';
import { ref, onValue, off, update, push, remove } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { UserProfile } from '../types';
import { Button, Input, Avatar, Card, Modal } from '../components/UI';
import { useNavigate } from 'react-router-dom';
import { playSound } from '../services/audioService';
import { showToast } from '../services/alert';

interface ChatMeta {
  lastMessage: string;
  lastTimestamp: number;
  unreadCount: number;
}

const SocialPage: React.FC = () => {
  const { user, profile } = useContext(UserContext);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'friends' | 'explore' | 'requests'>('friends');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<{uid: string, user: UserProfile}[]>([]);
  const [chatMetadata, setChatMetadata] = useState<Record<string, ChatMeta>>({});
  
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  
  // Track previous unread total for sound notifications
  const totalUnreadRef = useRef(0);

  // Load Data
  useEffect(() => {
      if (!user) return;
      
      // 1. Load cached friends first
      const cachedFriends = localStorage.getItem('friends_cache');
      if (cachedFriends) {
          try {
              setFriends(JSON.parse(cachedFriends));
          } catch(e) {}
      }

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
          
          // Cache Friends
          localStorage.setItem('friends_cache', JSON.stringify(friendList));

          // Process All Users (for Explore)
          const all: UserProfile[] = Object.keys(data).map(k => ({ uid: k, ...data[k] }));
          // Filter out self and already friends
          setAllUsers(all.filter(u => u.uid !== user.uid && !myFriends[u.uid]));
      };

      onValue(usersRef, handleData);
      return () => off(usersRef);
  }, [user]);

  // Listen to Chat Metadata for ALL friends
  useEffect(() => {
    if (!user || friends.length === 0) return;

    const listeners: Function[] = [];

    friends.forEach(friend => {
        const participants = [user.uid, friend.uid].sort();
        const chatId = `${participants[0]}_${participants[1]}`;
        const chatRef = ref(db, `chats/${chatId}`);

        const unsub = onValue(chatRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const unreadForMe = data.unread?.[user.uid]?.count || 0;
                
                setChatMetadata(prev => {
                    const updated = {
                        ...prev,
                        [friend.uid]: {
                            lastMessage: data.lastMessage || 'Start a conversation',
                            lastTimestamp: data.lastTimestamp || 0,
                            unreadCount: unreadForMe
                        }
                    };
                    return updated;
                });
            }
        });
        listeners.push(() => off(chatRef));
    });

    return () => listeners.forEach(unsub => unsub());
  }, [user, friends]);

  // Play Sound on Unread Increase
  useEffect(() => {
      let currentTotal = 0;
      Object.values(chatMetadata).forEach((meta: ChatMeta) => currentTotal += meta.unreadCount);
      
      if (currentTotal > totalUnreadRef.current) {
          playSound('message');
      }
      totalUnreadRef.current = currentTotal;
  }, [chatMetadata]);

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

  const formatLastTime = (timestamp: number) => {
      if (!timestamp) return '';
      const date = new Date(timestamp);
      const now = new Date();
      if (date.toDateString() === now.toDateString()) {
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Filter Users
  const filteredExplore = allUsers.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (u.username && u.username.toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a, b) => {
      // 1. Verified users first
      if (a.isVerified && !b.isVerified) return -1;
      if (!a.isVerified && b.isVerified) return 1;
      // 2. Then alphabetical
      return a.name.localeCompare(b.name);
  });

  // Sort Friends by Recent Interaction
  const sortedFriends = [...friends].sort((a, b) => {
      const timeA = chatMetadata[a.uid]?.lastTimestamp || 0;
      const timeB = chatMetadata[b.uid]?.lastTimestamp || 0;
      
      // 1. Most recent timestamp first
      if (timeB !== timeA) return timeB - timeA;
      // 2. Verified users next
      if (a.isVerified && !b.isVerified) return -1;
      if (!a.isVerified && b.isVerified) return 1;
      return a.name.localeCompare(b.name);
  });

  return (
    <div className="min-h-full p-4 flex flex-col pb-24 pt-24 max-w-4xl mx-auto w-full">
       {/* Header - Softer Colors */}
       <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 shadow-sm flex items-center justify-between px-4 py-3 transition-colors duration-300">
            <h1 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white uppercase italic tracking-tight">Students</h1>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button onClick={() => setActiveTab('friends')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'friends' ? 'bg-white shadow text-game-primary' : 'text-slate-500 hover:text-slate-700'}`}>Chats</button>
                <button onClick={() => setActiveTab('explore')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'explore' ? 'bg-white shadow text-game-primary' : 'text-slate-500 hover:text-slate-700'}`}>Explore</button>
                <button onClick={() => setActiveTab('requests')} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'requests' ? 'bg-white shadow text-game-primary' : 'text-slate-500 hover:text-slate-700'}`}>
                    Requests {requests.length > 0 && <span className="ml-1 bg-red-500 text-white px-1.5 rounded-full text-[10px]">{requests.length}</span>}
                </button>
            </div>
       </div>

       {/* FRIENDS TAB (Like WhatsApp) */}
       {activeTab === 'friends' && (
           <div className="space-y-3 animate__animated animate__fadeIn">
               {sortedFriends.length === 0 ? (
                   <div className="text-center py-10 text-slate-400">
                       <i className="fas fa-comment-slash text-4xl mb-3 opacity-50"></i>
                       <p className="font-bold">No chats yet.</p>
                       <Button size="sm" variant="secondary" className="mt-4 w-full sm:w-auto" onClick={() => setActiveTab('explore')}>Find Students</Button>
                   </div>
               ) : (
                   sortedFriends.map(f => {
                       const meta = chatMetadata[f.uid] || { lastMessage: 'Start a conversation', lastTimestamp: 0, unreadCount: 0 };
                       const hasUnread = meta.unreadCount > 0;

                       return (
                           <div key={f.uid} onClick={() => startChat(f.uid)} className={`bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border ${hasUnread ? 'border-l-4 border-l-game-primary border-y-slate-100 border-r-slate-100 dark:border-y-slate-700 dark:border-r-slate-700' : 'border-slate-100 dark:border-slate-700'} flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors relative overflow-hidden`}>
                               <div className="flex items-center gap-3 w-full">
                                   <div className="relative shrink-0">
                                      <Avatar src={f.avatar} seed={f.uid} size="md" isVerified={f.isVerified} isOnline={f.isOnline} />
                                   </div>
                                   <div className="flex-1 min-w-0 pr-2">
                                       <div className="flex justify-between items-baseline">
                                            <div className="font-bold text-slate-900 dark:text-white text-base truncate flex items-center gap-1">
                                                {f.name} {f.isVerified && <i className="fas fa-check-circle text-blue-500 text-xs"></i>}
                                            </div>
                                            <div className={`text-[10px] font-bold ${hasUnread ? 'text-game-primary' : 'text-slate-400'}`}>
                                                {formatLastTime(meta.lastTimestamp)}
                                            </div>
                                       </div>
                                       
                                       <div className="flex justify-between items-center mt-0.5">
                                            <div className={`text-sm truncate pr-2 ${hasUnread ? 'font-bold text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                                                {meta.lastMessage.startsWith('CHALLENGE_INVITE') ? (
                                                    <span className="text-game-primary italic"><i className="fas fa-gamepad mr-1"></i> Game Invite</span>
                                                ) : meta.lastMessage}
                                            </div>
                                            
                                            {hasUnread && (
                                                <div className="bg-game-danger text-white text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full shrink-0 shadow-sm animate-pulse">
                                                    {meta.unreadCount > 9 ? '9+' : meta.unreadCount}
                                                </div>
                                            )}
                                       </div>
                                   </div>
                               </div>
                           </div>
                       );
                   })
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
                       <div key={u.uid} onClick={() => setSelectedUser(u)} className={`bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border ${u.isVerified ? 'border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10' : 'border-slate-100 dark:border-slate-700'} flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors`}>
                            <div className="flex items-center gap-3">
                               <Avatar src={u.avatar} seed={u.uid} size="md" isVerified={u.isVerified} isOnline={u.isOnline} />
                               <div>
                                   <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                                        {u.name} 
                                        {u.isVerified && <i className="fas fa-check-circle text-blue-500 text-xs"></i>}
                                   </div>
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
                               <button 
                                    onClick={() => rejectRequest(r.uid)}
                                    // SOLID RED BUTTON
                                    className="px-4 py-2 rounded-2xl bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 flex items-center justify-center transition-all active:scale-95 flex-1 sm:flex-none border-b-4 border-red-700"
                                >
                                   <i className="fas fa-times"></i>
                               </button>
                           </div>
                       </div>
                   ))
               )}
           </div>
       )}

       {/* User Profile Modal */}
       {selectedUser && (
           <Modal isOpen={true} onClose={() => setSelectedUser(null)} title={selectedUser.name}>
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