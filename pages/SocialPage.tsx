
import React, { useState, useEffect, useContext, useMemo } from 'react';
import { ref, onValue, off, update, remove } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { UserProfile } from '../types';
import { Avatar, VerificationBadge } from '../components/UI';
import { UserProfileModal } from '../components/UserProfileModal';
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
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'explore'>('friends');
  const [searchTerm, setSearchTerm] = useState('');

  // Swipe Logic
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  // --- DATA STATES ---
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [requests, setRequests] = useState<{uid: string, user: UserProfile}[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [chatMetadata, setChatMetadata] = useState<Record<string, ChatMeta>>({});
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // --- RESTORE CACHE ---
  useEffect(() => {
      // 1. Social Data
      const cached = localStorage.getItem('social_cache');
      if (cached) {
          try {
              const { friends: cFriends, requests: cRequests, allUsers: cAll } = JSON.parse(cached);
              if (cFriends) setFriends(cFriends);
              if (cRequests) setRequests(cRequests);
              if (cAll) setAllUsers(cAll);
          } catch(e) {
              console.error("Cache load failed", e);
          }
      }

      // 2. Chat Metadata (for instant last message display)
      const cachedMeta = localStorage.getItem('social_meta_cache');
      if (cachedMeta) {
          try {
              setChatMetadata(JSON.parse(cachedMeta));
          } catch(e) {}
      }
  }, []);

  // --- PERSIST META CACHE ---
  useEffect(() => {
      if (Object.keys(chatMetadata).length > 0) {
          localStorage.setItem('social_meta_cache', JSON.stringify(chatMetadata));
      }
  }, [chatMetadata]);

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

          // SAVE TO CACHE
          localStorage.setItem('social_cache', JSON.stringify({ 
              friends: friendList, 
              requests: reqList, 
              allUsers: filtered 
          }));
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

  // --- SWIPE HANDLERS ---
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
        if (activeTab === 'friends') setActiveTab('requests');
        else if (activeTab === 'requests') setActiveTab('explore');
    }
    if (isRightSwipe) {
        if (activeTab === 'explore') setActiveTab('requests');
        else if (activeTab === 'requests') setActiveTab('friends');
    }
  };

  // --- LIST PROCESSING ---
  const exploreList = useMemo(() => {
      return allUsers.filter(u => {
          const isFriend = friends.some(f => f.uid === u.uid);
          const isRequested = requests.some(r => r.uid === u.uid); 
          const matchesSearch = (u.name||'').toLowerCase().includes(searchTerm.toLowerCase());
          return !isFriend && !isRequested && matchesSearch;
      }).sort((a, b) => {
          // 1. Online First
          if (a.isOnline !== b.isOnline) return b.isOnline ? 1 : -1;
          // 2. Points High to Low
          return (b.points || 0) - (a.points || 0);
      }); 
  }, [allUsers, friends, requests, searchTerm]);

  const sortedFriends = useMemo(() => {
      return [...friends].filter(f => 
          (f.name||'').toLowerCase().includes(searchTerm.toLowerCase())
      ).sort((a, b) => {
          const tA = chatMetadata[a.uid]?.lastTimestamp || 0;
          const tB = chatMetadata[b.uid]?.lastTimestamp || 0;
          return tB - tA; // Recent first
      });
  }, [friends, chatMetadata, searchTerm]);

  const getLevel = (points: number = 0) => Math.floor(points / 10) + 1;

  const formatLastSeen = (ts: number) => {
      if (!ts) return '';
      const now = Date.now();
      const diff = now - ts;
      const day = 24 * 60 * 60 * 1000;
      
      const date = new Date(ts);
      if (diff < day) {
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      if (diff < day * 2) return 'Yesterday';
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 pb-24 flex flex-col font-sans transition-colors overflow-x-hidden">
        
        {/* 1. Header Area with Search */}
        <div className="px-4 pt-6 pb-2 sticky top-0 bg-white dark:bg-slate-900 z-30">
            <div className="relative mb-6">
                <i className="fas fa-search absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 text-lg"></i>
                <input 
                    className="w-full bg-slate-100 dark:bg-slate-800 py-3.5 pl-14 pr-4 rounded-2xl border-none outline-none font-bold text-slate-700 dark:text-white placeholder-slate-400 text-sm transition-all focus:ring-2 focus:ring-game-primary/20"
                    placeholder="Search players or chats..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* 2. Tabs (Pills) - WhatsApp Style Indicators */}
            <div className="flex items-center gap-1 mb-2">
                <button 
                    onClick={() => setActiveTab('friends')}
                    className={`flex-1 py-3 text-center text-sm font-black uppercase tracking-widest transition-all relative ${
                        activeTab === 'friends' 
                        ? 'text-[#ea580c]' 
                        : 'text-slate-400'
                    }`}
                >
                    Chats
                    {friends.length > 0 && activeTab !== 'friends' && (
                        <span className="ml-1 text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full text-slate-500">
                            {friends.length}
                        </span>
                    )}
                    {activeTab === 'friends' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#ea580c] rounded-t-full"></div>}
                </button>
                
                <button 
                    onClick={() => setActiveTab('requests')}
                    className={`flex-1 py-3 text-center text-sm font-black uppercase tracking-widest transition-all relative ${
                        activeTab === 'requests' 
                        ? 'text-[#ea580c]' 
                        : 'text-slate-400'
                    }`}
                >
                    Requests
                    {requests.length > 0 && (
                        <span className="ml-1 text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full">
                            {requests.length}
                        </span>
                    )}
                    {activeTab === 'requests' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#ea580c] rounded-t-full"></div>}
                </button>
                
                <button 
                    onClick={() => setActiveTab('explore')}
                    className={`flex-1 py-3 text-center text-sm font-black uppercase tracking-widest transition-all relative ${
                        activeTab === 'explore' 
                        ? 'text-[#ea580c]' 
                        : 'text-slate-400'
                    }`}
                >
                    Explore
                    {activeTab === 'explore' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#ea580c] rounded-t-full"></div>}
                </button>
            </div>
        </div>

        {/* 3. Content List - Swipeable Container */}
        <div 
            className="flex-1 min-h-[300px]"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            
            {/* --- FRIENDS (CHATS) TAB --- */}
            {activeTab === 'friends' && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {sortedFriends.length === 0 ? (
                        <div className="text-center py-20 opacity-50">
                            <i className="fas fa-comment-dots text-4xl mb-4 text-slate-300"></i>
                            <p className="font-bold text-slate-400">No chats yet</p>
                        </div>
                    ) : (
                        sortedFriends.map(f => {
                            const meta = chatMetadata[f.uid];
                            const lastMsg = meta?.lastMessage 
                                ? (meta.lastMessage === 'CHALLENGE_INVITE' ? '🎮 Game Invite' : meta.lastMessage) 
                                : 'Start chatting';
                            const isMe = meta?.lastMessageSender === user?.uid;
                            const unreadCount = meta?.unreadCount || 0;
                            
                            return (
                                <div 
                                    key={f.uid} 
                                    onClick={() => navigate(`/chat/${f.uid}`)}
                                    className="px-4 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 active:bg-slate-100 dark:active:bg-slate-800/60 transition-all relative overflow-hidden group"
                                >
                                    {/* Avatar */}
                                    <div className="relative shrink-0">
                                        <Avatar src={f.avatar} seed={f.uid} size="md" isOnline={f.isOnline} />
                                    </div>

                                    {/* Info Middle */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-center mb-0.5">
                                            <div className="font-black text-slate-900 dark:text-white text-base truncate flex items-center gap-1.5">
                                                {f.name}
                                                {f.isVerified && <VerificationBadge size="xs" className="text-blue-500" />}
                                                {f.isSupport && <i className="fas fa-check-circle text-game-primary text-xs"></i>}
                                            </div>
                                            <div className={`text-[10px] font-bold ${unreadCount > 0 ? 'text-[#ea580c]' : 'text-slate-400'}`}>
                                                {formatLastSeen(meta?.lastTimestamp)}
                                            </div>
                                        </div>
                                        
                                        <div className="flex justify-between items-center">
                                            <div className={`text-sm truncate flex items-center gap-1 ${unreadCount > 0 ? 'font-black text-slate-900 dark:text-slate-100' : 'font-medium text-slate-500 dark:text-slate-400'}`}>
                                                {isMe && <i className={`fas fa-check-double text-[10px] mr-0.5 ${meta?.lastMessageStatus === 'read' ? 'text-blue-500' : 'text-slate-400'}`}></i>}
                                                <span className="truncate">{lastMsg}</span>
                                            </div>
                                            
                                            {unreadCount > 0 && (
                                                <div className="w-5 h-5 bg-[#ea580c] rounded-full flex items-center justify-center text-[10px] text-white font-black ml-2 shadow-sm animate__animated animate__bounceIn">
                                                    {unreadCount}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* --- EXPLORE TAB --- */}
            {activeTab === 'explore' && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                    {exploreList.slice(0, 50).map(u => {
                        const hasRequested = (u as any).friendRequests?.[user?.uid || ''];
                        return (
                            <div 
                                key={u.uid} 
                                onClick={() => setSelectedUser(u)}
                                className="px-4 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 active:bg-slate-100 dark:active:bg-slate-800/60 transition-all relative overflow-hidden group"
                            >
                                {/* Avatar */}
                                <div className="relative shrink-0">
                                    <Avatar src={u.avatar} seed={u.uid} size="md" isOnline={u.isOnline} />
                                </div>

                                {/* Info Middle */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center mb-0.5">
                                        <div className="font-black text-slate-900 dark:text-white text-base truncate flex items-center gap-1.5">
                                            {u.name}
                                            {u.isVerified && <VerificationBadge size="xs" className="text-blue-500" />}
                                            {u.isSupport && <i className="fas fa-check-circle text-game-primary text-xs"></i>}
                                        </div>
                                        <div className="bg-[#fbbf24] text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-sm">
                                            Lv.{getLevel(u.points)}
                                        </div>
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 font-bold truncate">@{u.username || 'user'}</div>
                                </div>

                                {/* Action End */}
                                <div className="shrink-0 flex items-center justify-center min-w-[60px]">
                                    {hasRequested ? (
                                        <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-200 dark:border-slate-700">
                                            <i className="fas fa-check text-sm"></i>
                                        </div>
                                    ) : (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); sendRequest(u.uid); }}
                                            className="btn-3d bg-[#8b5cf6] text-white px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all"
                                            style={{ boxShadow: '0px 3px 0px 0px #6d28d9' }}
                                        >
                                            Add
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* --- REQUESTS TAB --- */}
            {activeTab === 'requests' && (
                <div className="px-4 py-2 space-y-3">
                    {requests.length === 0 ? (
                        <div className="text-center py-20 opacity-50">
                            <i className="fas fa-user-clock text-4xl mb-4 text-slate-300"></i>
                            <p className="font-bold text-slate-400">No pending requests</p>
                        </div>
                    ) : (
                        requests.map(r => (
                            <div key={r.uid} className="bg-white dark:bg-slate-800 p-4 rounded-[1.8rem] shadow-sm flex flex-col gap-4 animate__animated animate__fadeIn border border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-4">
                                    <Avatar src={r.user.avatar} seed={r.user.uid} size="md" />
                                    <div className="min-w-0 flex-1">
                                        <div className="font-black text-slate-800 dark:text-white text-sm flex items-center gap-1 truncate">
                                            {r.user.name}
                                            {r.user.isVerified && <VerificationBadge size="xs" className="text-blue-500" />}
                                            {r.user.isSupport && <i className="fas fa-check-circle text-game-primary text-xs"></i>}
                                        </div>
                                        <div className="text-xs text-slate-400 font-bold truncate">Wants to be friends</div>
                                    </div>
                                    <div className="ml-auto bg-[#fbbf24] text-white text-[10px] font-black px-2.5 py-1 rounded-full shrink-0">
                                        Lv.{getLevel(r.user.points)}
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <button 
                                        onClick={async () => {
                                            await update(ref(db), { 
                                                [`users/${user?.uid}/friends/${r.uid}`]: true, 
                                                [`users/${r.uid}/friends/${user?.uid}`]: true, 
                                                [`users/${user?.uid}/friendRequests/${r.uid}`]: null 
                                            });
                                            showToast("Friend Added!", "success");
                                        }} 
                                        className="btn-3d flex-1 bg-[#ea580c] text-white py-3 rounded-2xl text-xs font-black uppercase"
                                        style={{ boxShadow: '0px 4px 0px 0px #c2410c' }}
                                    >
                                        Accept
                                    </button>
                                    <button 
                                        onClick={() => remove(ref(db, `users/${user?.uid}/friendRequests/${r.uid}`))} 
                                        className="btn-3d flex-1 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 py-3 rounded-2xl text-xs font-black uppercase"
                                        style={{ boxShadow: '0px 4px 0px 0px rgba(0,0,0,0.2)' }}
                                    >
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>

        {/* User Modal */}
        {selectedUser && (
            <UserProfileModal 
                user={selectedUser} 
                onClose={() => setSelectedUser(null)}
                actionLabel={friends.some(f => f.uid === selectedUser.uid) ? "Message" : "Send Request"}
                onAction={friends.some(f => f.uid === selectedUser.uid) 
                    ? () => { navigate(`/chat/${selectedUser.uid}`); setSelectedUser(null); }
                    : () => { sendRequest(selectedUser.uid); setSelectedUser(null); }
                }
            />
        )}
    </div>
  );
};

export default SocialPage;
