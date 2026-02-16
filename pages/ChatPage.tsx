
import React, { useState, useEffect, useContext, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, push, serverTimestamp, update, get, query, limitToLast, onChildAdded, off, increment, onChildChanged, set } from 'firebase/database';
import { Howler } from 'howler';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { ChatMessage, UserProfile, Subject, Chapter } from '../types';
import { Avatar, Button, Modal, Card, VerificationBadge } from '../components/UI';
import { UserProfileModal } from '../components/UserProfileModal';
import { playSound } from '../services/audioService';
import { showToast, showConfirm } from '../services/alert';
import { chatCache } from '../services/chatCache';
import confetti from 'canvas-confetti';

const DELETE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

const ChatPage: React.FC = () => {
  const { uid } = useParams(); // Target user ID
  const { user, profile } = useContext(UserContext);
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // UX State
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  
  // Message Menu State
  const [selectedMsgForAction, setSelectedMsgForAction] = useState<ChatMessage | null>(null);
  const pressTimer = useRef<any>(null);

  // 2026 Animation State
  const [showYearAnim, setShowYearAnim] = useState(false);
  const [yearStep, setYearStep] = useState(0); 
  
  // Match Setup State
  const [showGameSetup, setShowGameSetup] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  
  // Credential Visibility
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mountTimeRef = useRef(Date.now());
  
  // Network Listener
  useEffect(() => {
      const handleOnline = () => setIsOffline(false);
      const handleOffline = () => setIsOffline(true);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
      }
  }, []);

  // Initialize Chat & Profile Listener
  useEffect(() => {
      if (!user || !uid) return;
      
      mountTimeRef.current = Date.now();
      setMessages([]);
      setLoadingHistory(true);
      
      const targetUserRef = ref(db, `users/${uid}`);
      const unsubProfile = onValue(targetUserRef, snap => {
          if (snap.exists()) {
              setTargetUser({ uid, ...snap.val() });
          }
      });

      const participants = [user.uid, uid].sort();
      const derivedChatId = `${participants[0]}_${participants[1]}`;
      setChatId(derivedChatId);

      update(ref(db, `chats/${derivedChatId}/unread/${user.uid}`), { count: 0 });

      chatCache.getMessages(derivedChatId, 50).then(cachedMsgs => {
          setMessages(prev => {
              const combined = [...cachedMsgs, ...prev];
              const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
              return unique.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
          });
          setLoadingHistory(false);
      }).catch(err => {
          console.error("Cache Error", err);
          setLoadingHistory(false);
      });

      const msgsQuery = query(ref(db, `chats/${derivedChatId}/messages`), limitToLast(50));

      const unsubMsgs = onChildAdded(msgsQuery, (snapshot) => {
          const data = snapshot.val();
          if (!data) return;
          
          const newMsg: ChatMessage = { id: snapshot.key!, ...data, chatId: derivedChatId };

          if (newMsg.sender !== user.uid && newMsg.timestamp > (mountTimeRef.current - 2000)) {
              if (!newMsg.isDeleted) {
                playSound('message');
                if (newMsg.text && (newMsg.text.includes('2025') || newMsg.text.includes('2026'))) {
                    triggerYearCelebration();
                }
              }
          }

          setMessages(prev => {
              const existingIndex = prev.findIndex(m => m.id === newMsg.id);
              if (existingIndex !== -1) {
                  const updated = [...prev];
                  updated[existingIndex] = { ...updated[existingIndex], ...newMsg };
                  return updated.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
              }
              
              if (newMsg.type !== 'invite' && newMsg.type !== 'credential' && (!newMsg.text || !newMsg.text.trim())) return prev;
              
              const tempIndex = prev.findIndex(m => 
                  m.tempId && 
                  m.text === newMsg.text && 
                  Math.abs(m.timestamp - newMsg.timestamp) < 5000
              );
              
              if (tempIndex !== -1) {
                  const updated = [...prev];
                  updated[tempIndex] = newMsg;
                  return updated.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
              }
              
              return [...prev, newMsg].sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
          });
          
          chatCache.saveMessage(newMsg);

          if (newMsg.sender !== user.uid && newMsg.msgStatus !== 'read') {
              update(ref(db, `chats/${derivedChatId}/messages/${newMsg.id}`), { msgStatus: 'read' });
              update(ref(db, `chats/${derivedChatId}/unread/${user.uid}`), { count: 0 });
              update(ref(db, `chats/${derivedChatId}`), { lastMessageStatus: 'read' });
          }
      });

      // Child Changed Listener (For Real-time Deletions)
      const unsubMsgsChanged = onChildChanged(ref(db, `chats/${derivedChatId}/messages`), (snapshot) => {
          const data = snapshot.val();
          if (data) {
              const updatedMsg = { id: snapshot.key!, ...data, chatId: derivedChatId };
              setMessages(prev => prev.map(m => m.id === updatedMsg.id ? updatedMsg : m).sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0)));
              chatCache.saveMessage(updatedMsg);
          }
      });
      
      const metaRef = ref(db, `chats/${derivedChatId}/lastMessageStatus`);
      const metaUnsub = onValue(metaRef, (snap) => {
          if (snap.exists() && snap.val() === 'read') {
              setMessages(prev => prev.map(m => m.msgStatus !== 'read' && m.sender === user.uid ? { ...m, msgStatus: 'read' } : m));
          }
      });

      return () => {
          unsubProfile();
          unsubMsgs();
          unsubMsgsChanged();
          off(metaRef);
      };
  }, [user, uid]);

  useLayoutEffect(() => {
      if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
  }, [messages, loadingHistory]);

  const handleScroll = async () => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 300;
      setShowScrollButton(!isNearBottom);
      if (container.scrollTop === 0 && chatId && messages.length > 0 && !loadingHistory) {
          const oldestTs = messages[0].timestamp;
          const olderMsgs = await chatCache.getMessages(chatId, 20, oldestTs - 1);
          if (olderMsgs.length > 0) {
              const oldHeight = container.scrollHeight;
              setMessages(prev => {
                   const combined = [...olderMsgs, ...prev];
                   const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
                   return unique.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
              });
              requestAnimationFrame(() => {
                  const newHeight = container.scrollHeight;
                  container.scrollTop = newHeight - oldHeight;
              });
          }
      }
  };

  const scrollToBottom = () => {
      if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
      }
  };

  const triggerYearCelebration = () => {
      if (showYearAnim) return; 
      setShowYearAnim(true);
      setYearStep(1);
      const end = Date.now() + 4000;
      playSound('win');
      const interval = setInterval(function() {
          if (Date.now() > end) return clearInterval(interval);
          confetti({ startVelocity: 30, spread: 360, ticks: 60, zIndex: 200, particleCount: 40, origin: { x: Math.random(), y: Math.random() - 0.2 } });
      }, 250);
      setTimeout(() => { setYearStep(2); playSound('correct'); }, 1200);
      setTimeout(() => { setShowYearAnim(false); setYearStep(0); }, 5000);
  };

  useEffect(() => {
      if (showGameSetup) {
          get(ref(db, 'subjects')).then(snap => {
              if (snap.exists()) setSubjects((Object.values(snap.val()) as Subject[]).filter(s => s && s.id && s.name));
          });
      }
  }, [showGameSetup]);

  useEffect(() => {
    if (!selectedSubject) { setChapters([]); return; }
    get(ref(db, `chapters/${selectedSubject}`)).then(snap => {
        if(snap.exists()) {
            const list = Object.values(snap.val()) as Chapter[];
            const allOption: Chapter = { id: `ALL_${selectedSubject}`, name: 'All Chapters', subjectId: selectedSubject };
            setChapters([allOption, ...list]);
            setSelectedChapter(allOption.id);
        } else setChapters([]);
    });
  }, [selectedSubject]);

  const sendMessage = async (e?: React.FormEvent, type: 'text' | 'invite' = 'text', inviteCode?: string, subjectName?: string) => {
      e?.preventDefault();
      if ((!inputText.trim() && type === 'text') || !user || !chatId) return;
      try { if (Howler && Howler.ctx && Howler.ctx.state === 'suspended') Howler.ctx.resume(); } catch (err) {}
      playSound('sent');
      if (type === 'text' && (inputText.includes('2025') || inputText.includes('2026'))) triggerYearCelebration();
      const tempId = `temp_${Date.now()}`;
      const timestamp = Date.now();
      const msgData: ChatMessage = {
          id: tempId, tempId, chatId, sender: user.uid, text: type === 'invite' ? 'CHALLENGE_INVITE' : inputText.trim(), type,
          inviteCode, subjectName, timestamp, status: type === 'invite' ? 'waiting' : undefined, msgStatus: 'sending'
      };
      if (type === 'text') setInputText('');
      setMessages(prev => [...prev, msgData].sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0)));
      setTimeout(scrollToBottom, 50);
      chatCache.saveMessage(msgData);
      try {
          const newRef = push(ref(db, `chats/${chatId}/messages`));
          const realId = newRef.key!;
          const finalMsg: any = { ...msgData, id: realId, msgStatus: 'sent' as const };
          delete finalMsg.tempId; 
          Object.keys(finalMsg).forEach(key => { if (finalMsg[key] === undefined) delete finalMsg[key]; });
          const updates: any = {};
          updates[`chats/${chatId}/messages/${realId}`] = finalMsg;
          updates[`chats/${chatId}/lastMessage`] = msgData.text;
          updates[`chats/${chatId}/lastTimestamp`] = serverTimestamp();
          updates[`chats/${chatId}/lastMessageSender`] = user.uid;
          updates[`chats/${chatId}/lastMessageStatus`] = 'sent';
          updates[`chats/${chatId}/participants/${user.uid}`] = true;
          updates[`chats/${chatId}/participants/${uid!}`] = true;
          updates[`chats/${chatId}/unread/${uid!}/count`] = increment(1);
          await update(ref(db), updates);
          chatCache.saveMessage({ ...finalMsg, chatId });
          setMessages(prev => prev.map(m => m.tempId === tempId ? { ...finalMsg, chatId } : m).sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0)));
      } catch (err) { showToast("Failed to send", "error"); }
  };

  const handleSendInvite = async () => {
      if (!user || !selectedChapter || !chatId) return;
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const subName = subjects.find(s => s.id === selectedSubject)?.name || "Battle";
      
      try {
          // 1. Create Room first so it exists when opponent clicks join
          const roomRef = ref(db, `rooms/${code}`);
          // Calculate linked message path to update status later
          // We can't know exact message ID yet, so we will update status via room logic in LobbyPage if needed, 
          // or rely on LobbyPage updating room status which we listen to? 
          // Actually, LobbyPage logic handles room deletion.
          
          await set(roomRef, { 
              host: user.uid, 
              sid: selectedSubject, 
              lid: selectedChapter, 
              questionLimit: 10, 
              createdAt: Date.now(),
              // We can store a reference here if we want sophisticated status tracking
          });

          // 2. Send Message
          await sendMessage(undefined, 'invite', code, subName);
          
          setShowGameSetup(false);
          // 3. Navigate to Lobby as Host
          navigate('/lobby', { state: { hostedCode: code } });
      } catch (e) {
          showToast("Failed to create match", "error");
      }
  };

  // --- Deletion Logic ---
  const handleTouchStart = (msg: ChatMessage) => {
      if (msg.isDeleted || msg.sender !== user?.uid) return;
      
      const timeElapsed = Date.now() - (msg.timestamp || 0);
      // Automatically disable deletion for messages older than 30 mins
      if (timeElapsed > DELETE_WINDOW_MS) return;

      pressTimer.current = setTimeout(() => {
          setSelectedMsgForAction(msg);
          playSound('click');
          if (navigator.vibrate) navigator.vibrate(50);
      }, 600);
  };

  const handleTouchEnd = () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const deleteMessage = async () => {
      if (!selectedMsgForAction || !chatId) return;
      const msg = selectedMsgForAction;
      const confirm = await showConfirm("Delete for everyone?", "This message will be removed for all participants.");
      if (confirm) {
          try {
              const updates: any = {};
              updates[`chats/${chatId}/messages/${msg.id}/isDeleted`] = true;
              updates[`chats/${chatId}/messages/${msg.id}/text`] = 'THIS_MESSAGE_WAS_DELETED';
              
              // Also update last message preview if this was the last one
              const lastMsgInList = messages[messages.length - 1];
              if (lastMsgInList && lastMsgInList.id === msg.id) {
                  updates[`chats/${chatId}/lastMessage`] = 'THIS_MESSAGE_WAS_DELETED';
              }

              await update(ref(db), updates);
              setSelectedMsgForAction(null);
              showToast("Message deleted", "success");
          } catch (e) {
              showToast("Deletion failed", "error");
          }
      } else {
          setSelectedMsgForAction(null);
      }
  };

  const copyToClipboard = (val: string) => {
      navigator.clipboard.writeText(val);
      playSound('click');
      showToast("Copied to clipboard", "success");
  };

  const formatTime = (timestamp: number) => {
      if (!timestamp) return '';
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageStatus = (status: string | undefined, isInvite: boolean = false) => {
      const baseColor = "text-white/60";
      const readColor = isInvite ? "text-orange-400" : "text-blue-400";
      if (status === 'sending') return <i className={`fas fa-clock ${baseColor} text-[10px] ml-1 animate-pulse`}></i>;
      if (!status || status === 'sent') return <i className={`fas fa-check ${baseColor} text-[10px] ml-1`}></i>;
      if (status === 'read') return <i className={`fas fa-check-double ${readColor} text-[10px] ml-1`}></i>;
      return null;
  };

  if (!targetUser) return <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-bold">Loading...</div>;

  return (
    <div className="fixed inset-0 flex flex-col z-50 bg-slate-100 dark:bg-slate-900 transition-colors select-none">
        
        {/* Header */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 p-4 shadow-sm flex items-center justify-between relative z-20">
            <div className="flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="text-gray-500 dark:text-gray-300 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><i className="fas fa-arrow-left"></i></button>
                <div className="relative cursor-pointer flex items-center gap-3" onClick={() => setShowProfile(true)}>
                    <Avatar src={targetUser.avatar} seed={targetUser.uid} size="sm" isVerified={targetUser.isVerified} isSupport={targetUser.isSupport} isOnline={targetUser.isOnline} />
                    <div>
                        <div className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1">
                            {targetUser.name}
                            {targetUser.isVerified && <VerificationBadge size="xs" className="text-blue-500" />}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {targetUser.isOnline ? <span className="text-green-500 font-black"><i className="fas fa-circle text-[6px] align-middle mr-1 animate-pulse"></i> Online</span> : `@${targetUser.username}`}
                        </div>
                    </div>
                </div>
            </div>
            {!(profile?.isSupport || targetUser?.isSupport) && (
                <button onClick={() => setShowGameSetup(true)} disabled={isOffline} className="bg-game-primary text-white px-4 py-2 rounded-xl text-xs font-bold uppercase shadow-lg active:scale-95 transition-transform disabled:opacity-50">
                    <i className="fas fa-gamepad mr-2"></i> Play
                </button>
            )}
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-4 pb-32 relative z-10 custom-scrollbar">
            {messages.map((msg, index) => {
                const isMe = msg.sender === user?.uid;
                const isInvite = msg.type === 'invite';
                const isCredential = msg.type === 'credential';
                
                if (isCredential) {
                    return (
                        <div key={msg.id} className="flex flex-col items-center py-4 animate__animated animate__zoomIn">
                            <div className="w-full max-w-[85%] bg-gradient-to-br from-slate-800 to-[#0f172a] p-6 rounded-[2.5rem] border-2 border-orange-500/30 shadow-2xl relative overflow-hidden ring-1 ring-white/5">
                                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                    <i className="fas fa-shield-halved text-8xl text-white"></i>
                                </div>
                                <div className="flex items-center gap-3 mb-6 border-b border-white/5 pb-3">
                                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-500">
                                        <i className="fas fa-user-shield text-sm"></i>
                                    </div>
                                    <span className="text-[10px] font-black uppercase text-orange-400 tracking-[0.3em]">Official Security Update</span>
                                </div>
                                
                                <div className="space-y-4">
                                    <div className="bg-black/20 p-3.5 rounded-2xl border border-white/5 flex items-center justify-between group">
                                        <div>
                                            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Username</div>
                                            <div className="text-white font-mono font-bold text-sm tracking-tight">{msg.newUsername}</div>
                                        </div>
                                        <button onClick={() => copyToClipboard(msg.newUsername || '')} className="text-slate-500 hover:text-white transition-colors p-2"><i className="fas fa-copy"></i></button>
                                    </div>
                                    {msg.newPassword && (
                                        <div className="bg-black/20 p-3.5 rounded-2xl border border-white/5 flex items-center justify-between">
                                            <div>
                                                <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Access Password</div>
                                                <div className="text-white font-mono font-bold text-sm tracking-wider">
                                                    {visiblePasswords[msg.id] ? msg.newPassword : '••••••••'}
                                                </div>
                                            </div>
                                            <div className="flex gap-1">
                                                <button onClick={() => setVisiblePasswords(prev => ({...prev, [msg.id]: !prev[msg.id]}))} className="text-slate-500 hover:text-white p-2 transition-colors">
                                                    <i className={`fas ${visiblePasswords[msg.id] ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                                </button>
                                                <button onClick={() => copyToClipboard(msg.newPassword || '')} className="text-slate-500 hover:text-white p-2 transition-colors">
                                                    <i className="fas fa-copy"></i>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <p className="text-[9px] text-slate-500 font-bold mt-6 text-center italic opacity-60 leading-relaxed">
                                    Use these credentials to log in. Please keep them secure.
                                </p>
                                <div className="text-[8px] text-right mt-4 font-bold text-slate-600">
                                    {formatTime(msg.timestamp)}
                                </div>
                            </div>
                        </div>
                    );
                }

                return (
                    <div 
                        key={msg.id || `temp-${index}`} 
                        className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate__animated animate__fadeInUp`}
                        onMouseDown={() => handleTouchStart(msg)}
                        onMouseUp={handleTouchEnd}
                        onMouseLeave={handleTouchEnd}
                        onTouchStart={() => handleTouchStart(msg)}
                        onTouchEnd={handleTouchEnd}
                    >
                        {isInvite ? (
                             <div className={`max-w-[85%] w-64 p-5 rounded-3xl ${isMe ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white dark:bg-slate-800 border-2 border-game-primary rounded-bl-sm'} shadow-xl relative overflow-hidden`}>
                                 <div className="font-black uppercase text-[10px] mb-3 ${isMe ? 'text-indigo-200' : 'text-game-primary'} tracking-widest border-b border-white/20 pb-2">Quiz Invitation</div>
                                 <div className="text-center">
                                     <h3 className={`text-lg font-bold leading-tight mb-1 ${isMe ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{msg.subjectName || "Unknown Subject"}</h3>
                                     <div className="my-3 bg-black/20 rounded-lg p-2 backdrop-blur-sm">
                                         <div className="text-[10px] uppercase font-bold opacity-70">Room Code</div>
                                         <div className="text-2xl font-mono font-black tracking-widest">{msg.inviteCode}</div>
                                     </div>
                                     {(msg.status === 'played' || msg.status === 'expired' || msg.status === 'canceled') ? (
                                         <div className="bg-slate-500/20 text-slate-300 font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-2 uppercase tracking-widest"><i className="fas fa-info-circle"></i> {msg.status}</div>
                                     ) : !isMe ? (
                                         <button disabled={isOffline} onClick={() => navigate('/lobby', { state: { autoJoinCode: msg.inviteCode } })} className="bg-game-primary text-white px-4 py-2 rounded-xl font-bold w-full shadow-lg active:scale-95 text-xs uppercase">Join Match</button>
                                     ) : (
                                         <div className="text-[10px] font-bold italic opacity-70">Waiting for opponent...</div>
                                     )}
                                 </div>
                                 <div className={`text-[9px] text-right mt-3 flex items-center justify-end gap-1 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                     {formatTime(msg.timestamp)}
                                     {isMe && renderMessageStatus(msg.msgStatus, true)}
                                 </div>
                             </div>
                        ) : (
                             <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm shadow-md transition-all duration-200 ${isMe ? 'bg-game-primary text-white rounded-br-none' : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-none border border-slate-200 dark:border-slate-700'}`}>
                                 <div className="flex items-center gap-2">
                                     {msg.isDeleted ? (
                                         <>
                                            <i className="fas fa-ban opacity-40 text-xs"></i>
                                            <span className="italic opacity-60">
                                                {isMe ? "You deleted this message" : "This message was deleted"}
                                            </span>
                                         </>
                                     ) : (
                                         <span>{msg.text}</span>
                                     )}
                                 </div>
                                 <div className={`text-[9px] text-right mt-1 font-medium flex items-center justify-end gap-1 ${isMe ? 'text-white/70' : 'text-slate-400'}`}>
                                     {formatTime(msg.timestamp)}
                                     {isMe && !msg.isDeleted && renderMessageStatus(msg.msgStatus, false)}
                                 </div>
                             </div>
                        )}
                    </div>
                );
            })}
            <div ref={messagesEndRef}></div>
        </div>

        {/* Input Area */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]">
            <div className="max-w-4xl mx-auto w-full p-3 md:p-4">
                <form onSubmit={(e) => sendMessage(e, 'text')} className="flex items-center gap-2">
                    <input 
                        className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-5 py-3 text-sm md:text-base text-slate-900 dark:text-white outline-none focus:border-game-primary transition-all font-medium"
                        placeholder={isOffline ? "Connecting..." : "Message..."}
                        value={inputText}
                        onChange={e => setInputText(e.target.value)}
                        disabled={isOffline}
                    />
                    <button type="submit" disabled={!inputText.trim() || isOffline} className="w-12 h-12 shrink-0 rounded-full bg-game-primary text-white flex items-center justify-center disabled:opacity-50 shadow-lg active:scale-90 transition-all">
                        <i className="fas fa-paper-plane"></i>
                    </button>
                </form>
            </div>
        </div>

        {/* Action Menu (Delete) */}
        {selectedMsgForAction && (
            <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 backdrop-blur-sm p-4 animate__animated animate__fadeIn">
                <div className="absolute inset-0" onClick={() => setSelectedMsgForAction(null)}></div>
                <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-[2.5rem] p-6 shadow-2xl animate__animated animate__slideInUp relative z-10">
                    <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-6"></div>
                    <div className="space-y-3">
                        <button 
                            onClick={deleteMessage}
                            className="w-full py-4 px-6 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-2xl flex items-center gap-4 font-black uppercase text-sm active:scale-95 transition-transform"
                        >
                            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                <i className="fas fa-trash-alt text-lg"></i>
                            </div>
                            Delete for Everyone
                        </button>
                        <button 
                            onClick={() => setSelectedMsgForAction(null)}
                            className="w-full py-4 px-6 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 rounded-2xl font-black uppercase text-sm active:scale-95 transition-transform"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Game Setup Modal */}
        <Modal isOpen={showGameSetup} title="Start Battle" onClose={() => setShowGameSetup(false)}>
            <div className="space-y-4 pt-2">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Subject</label>
                    <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} className="w-full p-4 bg-slate-100 dark:bg-slate-700 rounded-xl font-bold dark:text-white outline-none">
                        <option value="">Choose Subject</option>
                        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>
                <div className={!selectedSubject ? 'opacity-50 pointer-events-none' : ''}>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Chapter</label>
                    <select value={selectedChapter} onChange={(e) => setSelectedChapter(e.target.value)} className="w-full p-4 bg-slate-100 dark:bg-slate-700 rounded-xl font-bold dark:text-white outline-none" disabled={!selectedSubject}>
                        <option value="">Choose Chapter</option>
                        {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
                <Button fullWidth onClick={handleSendInvite} disabled={!selectedChapter}>Send Challenge</Button>
            </div>
        </Modal>

        {showProfile && targetUser && <UserProfileModal user={targetUser} onClose={() => setShowProfile(false)} />}
    </div>
  );
};

export default ChatPage;
