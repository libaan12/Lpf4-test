
import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import { ref, onValue, off, update, remove } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { UserProfile } from '../types';
import { Button, Input, Avatar, Modal } from '../components/UI';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../services/alert';

interface ChatMeta {
  lastMessage: string;
  lastTimestamp: number;
  unreadCount: number;
  lastMessageSender?: string; 
  lastMessageStatus?: string; 
  type?: string; 
}

const SocialPage: React.FC = () => {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  
  // Tab State & Swipe Refs
  const [activeTab, setActiveTab] = useState<'chats' | 'explore' | 'requests'>('chats');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [searchTerm, setSearchTerm] = useState('');

  // --- DATA STATES WITH LOCAL STORAGE RESTORED ---

  const [friends, setFriends] = useState<UserProfile[]>(() => {
      try {
          const cached = localStorage.getItem(`lp_social_friends_${user?.uid}`);
          return cached ? JSON.parse(cached) : [];
      } catch { return []; }
  });

  const [requests, setRequests] = useState<{uid: string, user: UserProfile}[]>(() => {
      try {
          const cached = localStorage.getItem(`lp_social_requests_${user?.uid}`);
          return cached ? JSON.parse(cached) : [];
      } catch { return []; }
  });

  const [allUsers, setAllUsers] = useState<UserProfile[]>(() => {
      try {
          const cached = localStorage.getItem(`lp_social_all_users`);
          return cached ? JSON.parse(cached) : [];
      } catch { return []; }
  });

  const [chatMetadata, setChatMetadata] = useState<Record<string, ChatMeta>>(() => {
      try {
          const cached = localStorage.getItem(`lp_chat_meta_${user?.uid}`);
          return cached ? JSON.parse(cached) : {};
      } catch { return {}; }
  });

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // --- PERSISTENCE EFFECT ---
  useEffect(() => {
      if(user) {
          localStorage.setItem(`lp_social_friends_${user.uid}`, JSON.stringify(friends));
          localStorage.setItem(`lp_social_requests_${user.uid}`, JSON.stringify(requests));
          localStorage.setItem(`lp_social_all_users`, JSON.stringify(allUsers));
          localStorage.setItem(`lp_chat_meta_${user.uid}`, JSON.stringify(chatMetadata));
      }
  }, [friends, requests, allUsers, chatMetadata, user]);

  // --- FIREBASE LISTENERS ---

  useEffect(() => {
      if (!user) return;
      const usersRef = ref(db, 'users');
      
      const handleData = (snap: any) => {
          if (!snap.exists()) return;
          const data = snap.val();
          
          // 1. Requests
          const myRequests = data[user.uid]?.friendRequests || {};
          const reqList: any[] = [];
          Object.keys(myRequests).forEach(uid => {
              if(data[uid]) reqList.push({ uid, user: { uid, ...data[uid] } });
          });
          setRequests(reqList);

          // 2. Friends (Chats)
          const myFriends = data[user.uid]?.friends || {};
          const friendList: UserProfile[] = [];
          Object.keys(myFriends).forEach(uid => {
              if(data[uid]) friendList.push({ uid, ...data[uid] });
          });
          setFriends(friendList);

          // 3. All Users (Explore)
          const all: UserProfile[] = Object.keys(data).map(k => ({ uid: k, ...data[k] }));
          const filtered = all.filter(u => u.uid !== user.uid);
          setAllUsers(filtered);
      };

      onValue(usersRef, handleData);
      return () => off(usersRef);
  }, [user]);

  // Chat Metadata Listener
  useEffect(() => {
    if (!user || friends.length === 0) return;
    const listeners: Function[] = [];

    friends.forEach(f => {
        const participants = [user.uid, f.uid].sort();
        const chatId = `${participants[0]}_${participants[1]}`;
        const chatRef = ref(db, `chats/${chatId}`);

        const unsub = onValue(chatRef, (snapshot) => {
            if (snapshot.exists()) {
                const data = snapshot.val();
                const meta = {
                    lastMessage: data.lastMessage || '',
                    lastTimestamp: data.lastTimestamp || 0,
                    unreadCount: data.unread?.[user.uid]?.count || 0,
                    lastMessageSender: data.lastMessageSender,
                    lastMessageStatus: data.lastMessageStatus,
                    type: (data.lastMessage === 'CHALLENGE_INVITE') ? 'invite' : 'text'
                };

                setChatMetadata(prev => ({ ...prev, [f.uid]: meta }));
            }
        });
        listeners.push(() => off(chatRef));
    });
    return () => listeners.forEach(unsub => unsub());
  }, [user, friends]);

  // --- ACTIONS ---

  const sendRequest = async (targetUid: string) => {
      if(!user) return;
      await update(ref(db, `users/${targetUid}/friendRequests`), { [user.uid]: true });
      showToast("Request sent", "success");
  };

  const formatTime = (ts: number) => {
      if(!ts) return '';
      const d = new Date(ts);
      const now = new Date();
      if(d.toDateString() === now.toDateString()) {
          return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
      }
      return d.toLocaleDateString([], {month:'short', day:'numeric'});
  };

  const renderStatusIcon = (status?: string) => {
      switch(status) {
          case 'sending': return <i className="fas fa-clock text-slate-400 text-[10px]"></i>;
          case 'sent': return <i className="fas fa-check text-slate-400 text-[10px]"></i>;
          case 'delivered': return <i className="fas fa-check-double text-slate-400 text-[10px]"></i>;
          case 'read': return <i className="fas fa-check-double text-blue-500 text-[10px]"></i>;
          default: return <i className="fas fa-check text-slate-400 text-[10px]"></i>;
      }
  };

  // --- SWIPE LOGIC ---
  
  const handleScroll = () => {
      if (scrollContainerRef.current) {
          const x = scrollContainerRef.current.scrollLeft;
          const w = scrollContainerRef.current.offsetWidth;
          const index = Math.round(x / w);
          if (index === 0 && activeTab !== 'chats') setActiveTab('chats');
          if (index === 1 && activeTab !== 'explore') setActiveTab('explore');
          if (index === 2 && activeTab !== 'requests') setActiveTab('requests');
      }
  };

  const switchTab = (tab: 'chats' | 'explore' | 'requests') => {
      setActiveTab(tab);
      if (scrollContainerRef.current) {
          const w = scrollContainerRef.current.offsetWidth;
          let targetX = 0;
          if (tab === 'explore') targetX = w;
          if (tab === 'requests') targetX = w * 2;
          scrollContainerRef.current.scrollTo({ left: targetX, behavior: 'smooth' });
      }
  };

  // Filter & Sort Logic: 1. Verified/Support 2. Online 3. Alpha
  const exploreList = useMemo(() => {
      return allUsers.filter(u => {
          const isFriend = friends.some(f => f.uid === u.uid);
          const matchesSearch = (u.name||'').toLowerCase().includes(searchTerm.toLowerCase());
          return !isFriend && matchesSearch;
      }).sort((a, b) => {
          // 1. Verified Tier
          const aVerifiedScore = (a.isVerified || a.isSupport) ? 1 : 0;
          const bVerifiedScore = (b.isVerified || b.isSupport) ? 1 : 0;
          if (aVerifiedScore !== bVerifiedScore) return bVerifiedScore - aVerifiedScore;
          
          // 2. Online Tier
          const aOnlineScore = a.isOnline ? 1 : 0;
          const bOnlineScore = b.isOnline ? 1 : 0;
          if (aOnlineScore !== bOnlineScore) return bOnlineScore - aOnlineScore;
          
          // 3. Alphabetical
          return (a.name || '').localeCompare(b.name || '');
      });
  }, [allUsers, friends, searchTerm]);

  const sortedFriends = useMemo(() => {
      return [...friends].sort((a, b) => {
          const tA = chatMetadata[a.uid]?.lastTimestamp || 0;
          const tB = chatMetadata[b.uid]?.lastTimestamp || 0;
          return tB - tA;
      });
  }, [friends, chatMetadata]);

  return (
    <div className="absolute inset-0 flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden">
        
        {/* Top Header */}
        <div className="z-20 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 pt-4 pb-3 px-4 shadow-sm transition-all shrink-0">
            <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
                <h1 className="text-2xl font-black italic text-slate-800 dark:text-white uppercase tracking-tighter transform scale-y-110">STUDENTS</h1>
                
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    <button onClick={() => switchTab('chats')} className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${activeTab === 'chats' ? 'bg-white dark:bg-slate-700 text-game-primary shadow-sm' : 'text-slate-400'}`}>Chats</button>
                    <button onClick={() => switchTab('explore')} className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${activeTab === 'explore' ? 'bg-white dark:bg-slate-700 text-game-primary shadow-sm' : 'text-slate-400'}`}>Explore</button>
                    <button onClick={() => switchTab('requests')} className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${activeTab === 'requests' ? 'bg-white dark:bg-slate-700 text-game-primary shadow-sm' : 'text-slate-400'}`}>
                        Requests
                        {requests.length > 0 && <span className="ml-1 bg-red-500 text-white px-1.5 rounded-full text-[9px]">{requests.length}</span>}
                    </button>
                </div>
            </div>
        </div>

        {/* Swipe Container */}
        <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 flex overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
            
            {/* CHATS TAB */}
            <div className="min-w-full w-full snap-center overflow-y-auto p-4 custom-scrollbar pb-24" style={{ scrollSnapStop: 'always' }}>
                <div className="max-w-2xl mx-auto space-y-3">
                    {sortedFriends.length === 0 ? (
                        <div className="text-center py-20 opacity-50 flex flex-col items-center">
                            <i className="fas fa-comments text-4xl mb-2 text-slate-300"></i>
                            <p className="font-bold text-slate-400 mb-4">No active chats</p>
                            <Button size="sm" onClick={() => switchTab('explore')} className="!px-6">Find Friends</Button>
                        </div>
                    ) : (
                        sortedFriends.map(f => {
                            const meta = chatMetadata[f.uid] || { lastMessage: '', lastTimestamp: 0, unreadCount: 0 };
                            const isGameInvite = meta.type === 'invite' || meta.lastMessage === 'CHALLENGE_INVITE';
                            const isMe = meta.lastMessageSender === user?.uid;
                            
                            return (
                                <div 
                                    key={f.uid} 
                                    onClick={() => navigate(`/chat/${f.uid}`)} 
                                    className="bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-50 dark:border-slate-700/50 flex items-center gap-4 cursor-pointer active:scale-[0.98] transition-all relative"
                                >
                                    <div className="relative">
                                        <Avatar src={f.avatar} seed={f.uid} size="md" isVerified={f.isVerified} isSupport={f.isSupport} isOnline={f.isOnline} />
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-black text-slate-900 dark:text-white text-base truncate flex items-center gap-1.5">
                                                {f.name}
                                                {f.isVerified && <i className="fas fa-check-circle text-blue-500 text-xs"></i>}
                                                {f.isSupport && <i className="fas fa-check-circle text-game-primary text-xs"></i>}
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap">{formatTime(meta.lastTimestamp)}</span>
                                        </div>
                                        
                                        <div className="flex justify-between items-center">
                                            {isGameInvite ? (
                                                <span className="text-sm font-bold text-game-primary flex items-center gap-1.5">
                                                    <i className="fas fa-gamepad"></i> Game Invite
                                                </span>
                                            ) : (
                                                <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
                                                    {isMe && (
                                                        <span className="shrink-0 flex items-center justify-center">
                                                            {renderStatusIcon(meta.lastMessageStatus)}
                                                        </span>
                                                    )}
                                                    <span className={`text-sm truncate ${meta.unreadCount > 0 ? 'text-slate-800 dark:text-white font-bold' : 'text-slate-500 dark:text-slate-400 font-medium'}`}>
                                                        {meta.lastMessage || 'Start a conversation'}
                                                    </span>
                                                </div>
                                            )}
                                            
                                            {/* Unread Count Badge (Red Circle) */}
                                            {meta.unreadCount > 0 && (
                                                <span className="w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-black shrink-0 shadow-sm animate-pulse ml-auto">
                                                    {meta.unreadCount}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* EXPLORE TAB */}
            <div className="min-w-full w-full snap-center overflow-y-auto p-4 custom-scrollbar pb-24" style={{ scrollSnapStop: 'always' }}>
                <div className="max-w-2xl mx-auto space-y-4">
                    <div className="bg-white dark:bg-slate-800 p-2 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700">
                        <Input 
                            placeholder="Search students..." 
                            icon="fa-search"
                            value={searchTerm} 
                            onChange={e => setSearchTerm(e.target.value)} 
                            className="!border-none !bg-transparent !mb-0 !py-2"
                        />
                    </div>
                    
                    {exploreList.slice(0, 50).map(u => {
                        const hasRequested = (u as any).friendRequests?.[user?.uid || ''];
                        return (
                            <div key={u.uid} onClick={() => setSelectedUser(u)} className="bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-50 dark:border-slate-700 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-transform">
                                <div className="flex items-center gap-4">
                                    <Avatar src={u.avatar} seed={u.uid} size="md" isVerified={u.isVerified} isSupport={u.isSupport} isOnline={u.isOnline} />
                                    <div>
                                        <div className="font-black text-slate-900 dark:text-white text-sm flex items-center gap-1">
                                            {u.name}
                                            {u.isVerified && <i className="fas fa-check-circle text-blue-500 text-xs"></i>}
                                            {u.isSupport && <i className="fas fa-check-circle text-game-primary text-xs"></i>}
                                        </div>
                                        <div className="text-[11px] text-slate-400 font-medium">
                                            {u.isOnline ? <span className="text-green-500 font-bold"><i className="fas fa-circle text-[6px] mr-1 align-middle"></i> Online</span> : `@${u.username || 'unknown'}`}
                                        </div>
                                    </div>
                                </div>
                                {hasRequested ? (
                                    <span className="text-xs font-bold text-green-600 bg-green-100 px-3 py-1.5 rounded-xl flex items-center gap-1"><i className="fas fa-check"></i> Sent</span>
                                ) : (
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); sendRequest(u.uid); }}
                                        className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-game-primary hover:text-white transition-colors flex items-center gap-1"
                                    >
                                        <i className="fas fa-user-plus"></i> Add
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* REQUESTS TAB */}
            <div className="min-w-full w-full snap-center overflow-y-auto p-4 custom-scrollbar pb-24" style={{ scrollSnapStop: 'always' }}>
                <div className="max-w-2xl mx-auto space-y-3">
                    {requests.length === 0 ? (
                        <div className="text-center py-20 opacity-50">
                            <i className="fas fa-user-friends text-4xl mb-2 text-slate-300"></i>
                            <p className="font-bold text-slate-400">No pending requests</p>
                        </div>
                    ) : (
                        requests.map(r => (
                            <div key={r.uid} className="bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-slate-50 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <Avatar src={r.user.avatar} size="md" isVerified={r.user.isVerified} isSupport={r.user.isSupport} />
                                    <div>
                                        <div className="font-black text-slate-900 dark:text-white text-sm flex items-center gap-1">
                                            {r.user.name}
                                            {r.user.isVerified && <i className="fas fa-check-circle text-blue-500 text-xs"></i>}
                                            {r.user.isSupport && <i className="fas fa-check-circle text-game-primary text-xs"></i>}
                                        </div>
                                        <div className="text-xs text-slate-400 font-bold">Wants to connect</div>
                                    </div>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <button 
                                        onClick={async () => {
                                            await update(ref(db), { 
                                                [`users/${user?.uid}/friends/${r.uid}`]: true, 
                                                [`users/${r.uid}/friends/${user?.uid}`]: true, 
                                                [`users/${user?.uid}/friendRequests/${r.uid}`]: null 
                                            });
                                            showToast("Added!", "success");
                                        }} 
                                        className="flex-1 sm:flex-none bg-game-primary text-white px-6 py-2 rounded-xl text-xs font-bold shadow-md hover:bg-orange-600 transition-colors"
                                    >
                                        Accept
                                    </button>
                                    <button 
                                        onClick={() => remove(ref(db, `users/${user?.uid}/friendRequests/${r.uid}`))} 
                                        className="flex-1 sm:flex-none bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-6 py-2 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                                    >
                                        Ignore
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>

        {/* User Modal */}
        {selectedUser && (
            <Modal isOpen={true} onClose={() => setSelectedUser(null)} title={selectedUser.name}>
                <div className="flex flex-col items-center mb-6">
                    <Avatar src={selectedUser.avatar} seed={selectedUser.uid} size="xl" isVerified={selectedUser.isVerified} isSupport={selectedUser.isSupport} isOnline={selectedUser.isOnline} className="mb-4 shadow-xl border-4 border-white dark:border-slate-700" />
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white text-center flex items-center gap-2">
                        {selectedUser.name}
                        {selectedUser.isVerified && <i className="fas fa-check-circle text-blue-500 text-lg"></i>}
                        {selectedUser.isSupport && <i className="fas fa-check-circle text-game-primary text-lg"></i>}
                    </h2>
                    <p className="text-slate-400 font-bold font-mono text-sm">@{selectedUser.username}</p>
                    
                    {selectedUser.isOnline && (
                        <div className="mt-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest animate-pulse">
                            <i className="fas fa-circle text-[8px] mr-1"></i> Currently Online
                        </div>
                    )}

                    {selectedUser.isSupport ? (
                        <div className="mt-6">
                            <span className="inline-flex items-center gap-2 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest">
                                <i className="fas fa-shield-alt"></i> Official Account
                            </span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4 w-full mt-6">
                            <div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl text-center">
                                <div className="text-xs text-slate-400 font-bold uppercase">Level</div>
                                <div className="text-xl font-black text-slate-800 dark:text-white">{Math.floor((selectedUser.points || 0) / 10) + 1}</div>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl text-center">
                                <div className="text-xs text-slate-400 font-bold uppercase">Points</div>
                                <div className="text-xl font-black text-game-primary dark:text-blue-400">{selectedUser.points}</div>
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="flex gap-3">
                    {friends.some(f => f.uid === selectedUser.uid) ? (
                        <Button fullWidth onClick={() => { navigate(`/chat/${selectedUser.uid}`); setSelectedUser(null); }}>Message</Button>
                    ) : (
                        <Button fullWidth onClick={() => { sendRequest(selectedUser.uid); setSelectedUser(null); }}>Send Request</Button>
                    )}
                </div>
            </Modal>
        )}
    </div>
  );
};

export default SocialPage;
