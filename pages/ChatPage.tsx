
import React, { useState, useEffect, useContext, useRef, useLayoutEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, push, set, serverTimestamp, update, get, runTransaction, query, limitToLast, onChildAdded, off } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { ChatMessage, UserProfile, Subject, Chapter } from '../types';
import { Avatar, Button, Modal, Card } from '../components/UI';
import { playSound } from '../services/audioService';
import { showToast, showAlert } from '../services/alert';
import { chatCache } from '../services/chatCache';
import confetti from 'canvas-confetti';

const ChatPage: React.FC = () => {
  const { uid } = useParams(); // Target user ID
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // UX State
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  // 2026 Animation State
  const [showYearAnim, setShowYearAnim] = useState(false);
  const [yearStep, setYearStep] = useState(0); // 0: init, 1: 2025, 2: swap
  
  // Match Setup State
  const [showGameSetup, setShowGameSetup] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [setupLoading, setSetupLoading] = useState(false);
  
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

  // Initialize Chat
  useEffect(() => {
      if (!user || !uid) return;
      
      // Update ref to avoid playing sounds for history when switching chats
      mountTimeRef.current = Date.now();

      // Reset State when switching chats
      setMessages([]);
      setLoadingHistory(true);
      
      // Fetch Target User Info
      get(ref(db, `users/${uid}`)).then(snap => {
          if (snap.exists()) setTargetUser({ uid, ...snap.val() });
      });

      // Construct Chat ID
      const participants = [user.uid, uid].sort();
      const derivedChatId = `${participants[0]}_${participants[1]}`;
      setChatId(derivedChatId);

      // --- 1. LOAD CACHE ---
      chatCache.getMessages(derivedChatId, 50).then(cachedMsgs => {
          setMessages(prev => {
              const combined = [...cachedMsgs, ...prev];
              const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
              return unique.sort((a,b) => a.timestamp - b.timestamp);
          });
          setLoadingHistory(false);
      }).catch(err => {
          console.error("Cache Error", err);
          setLoadingHistory(false);
      });

      // --- 2. SYNC NEW MESSAGES ---
      const msgsQuery = query(ref(db, `chats/${derivedChatId}/messages`), limitToLast(50));

      const unsub = onChildAdded(msgsQuery, (snapshot) => {
          const data = snapshot.val();
          if (!data) return;
          
          const newMsg: ChatMessage = { id: snapshot.key!, ...data, chatId: derivedChatId };

          // Play Sound for New Incoming Messages
          if (newMsg.sender !== user.uid && newMsg.timestamp > mountTimeRef.current) {
              playSound('message');
              // Check for 2026 Animation trigger
              if (newMsg.text && (newMsg.text.includes('2025') || newMsg.text.includes('2026'))) {
                  triggerYearCelebration();
              }
          }

          // Real-time update for invitation status if message exists in state
          setMessages(prev => {
              const existingIndex = prev.findIndex(m => m.id === newMsg.id);
              if (existingIndex !== -1) {
                  const updated = [...prev];
                  updated[existingIndex] = { ...updated[existingIndex], ...newMsg };
                  return updated;
              }
              
              if (newMsg.type !== 'invite' && (!newMsg.text || !newMsg.text.trim())) return prev;
              
              // Handle temp message replacement
              const tempIndex = prev.findIndex(m => 
                  m.tempId && 
                  m.text === newMsg.text && 
                  (m.type === 'invite' ? m.inviteCode === newMsg.inviteCode : true) &&
                  Math.abs(m.timestamp - newMsg.timestamp) < 5000
              );
              
              if (tempIndex !== -1) {
                  const updated = [...prev];
                  updated[tempIndex] = newMsg;
                  return updated;
              }
              
              return [...prev, newMsg].sort((a,b) => a.timestamp - b.timestamp);
          });
          
          chatCache.saveMessage(newMsg);

          if (newMsg.sender !== user.uid && newMsg.msgStatus !== 'read') {
              update(ref(db, `chats/${derivedChatId}/messages/${newMsg.id}`), { msgStatus: 'read' });
              update(ref(db, `chats/${derivedChatId}/unread/${user.uid}`), { count: 0 });
              update(ref(db, `chats/${derivedChatId}`), { lastMessageStatus: 'read' });
          }
      });
      
      // Also listen for changes to existing messages (specifically for Invite Status updates)
      const msgsRef = ref(db, `chats/${derivedChatId}/messages`);
      const changeUnsub = onValue(msgsRef, (snap) => {
          if(!snap.exists()) return;
          const data = snap.val();
          setMessages(prev => prev.map(m => {
              if (data[m.id]) return { ...m, ...data[m.id] };
              return m;
          }));
      });

      const metaRef = ref(db, `chats/${derivedChatId}/lastMessageStatus`);
      const metaUnsub = onValue(metaRef, (snap) => {
          if (snap.exists() && snap.val() === 'read') {
              setMessages(prev => prev.map(m => m.msgStatus !== 'read' && m.sender === user.uid ? { ...m, msgStatus: 'read' } : m));
          }
      });

      return () => {
          unsub();
          changeUnsub();
          off(metaRef);
          off(msgsRef);
      };
  }, [user, uid]);

  // --- AUTO-SCROLL LOGIC ---
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

      // Pagination (Load older messages)
      if (container.scrollTop === 0 && chatId && messages.length > 0 && !loadingHistory) {
          const oldestTs = messages[0].timestamp;
          const olderMsgs = await chatCache.getMessages(chatId, 20, oldestTs - 1);
          
          if (olderMsgs.length > 0) {
              const oldHeight = container.scrollHeight;
              
              setMessages(prev => {
                   const combined = [...olderMsgs, ...prev];
                   const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
                   return unique.sort((a,b) => a.timestamp - b.timestamp);
              });
              
              // Maintain scroll position after loading history
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

  // 2026 Celebration Logic
  const triggerYearCelebration = () => {
      if (showYearAnim) return; 
      setShowYearAnim(true);
      setYearStep(1);
      
      const duration = 4000;
      const end = Date.now() + duration;
      
      playSound('win');

      const interval = setInterval(function() {
          if (Date.now() > end) {
              return clearInterval(interval);
          }
          confetti({ 
              startVelocity: 30, 
              spread: 360, 
              ticks: 60, 
              zIndex: 200, 
              particleCount: 40, 
              origin: { x: Math.random(), y: Math.random() - 0.2 } 
          });
      }, 250);

      // Swap sequence
      setTimeout(() => {
          setYearStep(2); // The Swap
          playSound('correct'); 
      }, 1200); // Trigger swap slightly faster

      setTimeout(() => {
          setShowYearAnim(false);
          setYearStep(0);
      }, 5000);
  };

  // Load Subjects for Game Invite
  useEffect(() => {
      if (showGameSetup) {
          get(ref(db, 'subjects')).then(snap => {
              if (snap.exists()) {
                  const list = (Object.values(snap.val()) as Subject[]).filter(s => s && s.id && s.name);
                  setSubjects(list);
              }
          });
      }
  }, [showGameSetup]);

  // Load Chapters
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

      playSound('message');

      // Check for keywords in outgoing message
      if (type === 'text' && (inputText.includes('2025') || inputText.includes('2026'))) {
          triggerYearCelebration();
      }

      const tempId = `temp_${Date.now()}`;
      const timestamp = Date.now();
      
      const msgData: ChatMessage = {
          id: tempId,
          tempId: tempId,
          chatId: chatId,
          sender: user.uid,
          text: type === 'invite' ? 'CHALLENGE_INVITE' : inputText.trim(),
          type,
          inviteCode: inviteCode || undefined,
          subjectName: subjectName || undefined,
          timestamp: timestamp,
          status: type === 'invite' ? 'waiting' : undefined,
          msgStatus: 'sending'
      };

      if (type === 'text') setInputText('');

      setMessages(prev => [...prev, msgData]);
      // Force scroll after adding message
      setTimeout(scrollToBottom, 50);
      
      chatCache.saveMessage(msgData);
      
      try {
          const newRef = push(ref(db, `chats/${chatId}/messages`));
          const realId = newRef.key!;
          
          const finalMsg: any = { 
              ...msgData, 
              id: realId, 
              msgStatus: 'sent' as const 
          };
          delete finalMsg.tempId; 
          
          Object.keys(finalMsg).forEach(key => {
              if (finalMsg[key] === undefined) {
                  delete finalMsg[key];
              }
          });

          await set(newRef, finalMsg);
          chatCache.saveMessage({ ...finalMsg, chatId });

          setMessages(prev => prev.map(m => m.tempId === tempId ? { ...finalMsg, chatId } : m));

          await update(ref(db, `chats/${chatId}`), {
              lastMessage: msgData.text,
              lastTimestamp: serverTimestamp(),
              lastMessageSender: user.uid, 
              lastMessageStatus: 'sent',   
              participants: { [user.uid]: true, [uid!]: true }
          });

          const recipientUnreadRef = ref(db, `chats/${chatId}/unread/${uid}/count`);
          runTransaction(recipientUnreadRef, (c) => (c || 0) + 1);

      } catch (err) {
          console.error("SendMessage Error:", err);
          showToast("Failed to send message", "error");
      }
  };

  const openMatchSetup = () => {
      setShowGameSetup(true);
      playSound('click');
  };

  const confirmMatchInvite = async () => {
      if (!user || !selectedSubject || !selectedChapter || !chatId) {
          showToast("Please select a subject and chapter", "warning");
          return;
      }
      setSetupLoading(true);
      
      try {
          const subjectName = subjects.find(s => s.id === selectedSubject)?.name || "Unknown Subject";
          const code = Math.floor(1000 + Math.random() * 9000).toString();
          const newRef = push(ref(db, `chats/${chatId}/messages`));
          const msgId = newRef.key;

          await set(ref(db, `rooms/${code}`), { 
              host: user.uid, 
              sid: selectedSubject, 
              lid: selectedChapter, 
              questionLimit: 10, 
              createdAt: Date.now(),
              linkedChatPath: `chats/${chatId}/messages/${msgId}` 
          });
          
          // Send message directly to avoid tempId mismatch for linked path
          const timestamp = Date.now();
          const msgData: ChatMessage = {
              id: msgId!,
              chatId,
              sender: user.uid,
              text: 'CHALLENGE_INVITE',
              type: 'invite',
              inviteCode: code,
              subjectName,
              timestamp,
              status: 'waiting',
              msgStatus: 'sent'
          };
          
          await set(newRef, msgData);
          
          await update(ref(db, `chats/${chatId}`), {
              lastMessage: 'CHALLENGE_INVITE',
              lastTimestamp: serverTimestamp(),
              lastMessageSender: user.uid, 
              lastMessageStatus: 'sent',   
              participants: { [user.uid]: true, [uid!]: true }
          });

          const recipientUnreadRef = ref(db, `chats/${chatId}/unread/${uid}/count`);
          runTransaction(recipientUnreadRef, (c) => (c || 0) + 1);

          setShowGameSetup(false);
          playSound('correct');
          showToast('Invite sent!', 'success');
          
          navigate('/lobby', { state: { hostedCode: code } });
          
      } catch (e) {
          console.error(e);
          showAlert("Error", "Failed to create match invite.", "error");
      } finally {
          setSetupLoading(false);
      }
  };

  const acceptInvite = (code: string) => {
      playSound('click');
      navigate('/lobby', { state: { autoJoinCode: code } });
  };

  const formatTime = (timestamp: number) => {
      if (!timestamp) return '';
      return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessageStatus = (status: string | undefined, isInvite: boolean = false) => {
      const baseColor = "text-white/60";
      const readColor = isInvite ? "text-orange-400" : "text-blue-800";

      if (status === 'sending') return <i className={`fas fa-clock ${baseColor} text-[10px] ml-1 animate-pulse`}></i>;
      if (!status || status === 'sent') return <i className={`fas fa-check ${baseColor} text-[10px] ml-1`}></i>;
      if (status === 'delivered') return <i className={`fas fa-check-double ${baseColor} text-[10px] ml-1`}></i>;
      if (status === 'read') return <i className={`fas fa-check-double ${readColor} text-[10px] ml-1`}></i>;
      return null;
  };

  if (!targetUser) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 text-slate-500 dark:text-white font-bold">Loading...</div>;

  return (
    <div className="fixed inset-0 flex flex-col z-50 bg-slate-100 dark:bg-slate-900 transition-colors">
        
        {/* Dynamic Background Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none z-0" 
             style={{ 
                 backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236366f1' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` 
             }}
        ></div>

        {/* Header */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 p-4 shadow-sm flex items-center justify-between relative z-20">
            <div className="flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="text-gray-500 dark:text-gray-300 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><i className="fas fa-arrow-left"></i></button>
                <div className="relative">
                    <Avatar src={targetUser.avatar} seed={targetUser.uid} size="sm" isVerified={targetUser.isVerified} isSupport={targetUser.isSupport} isOnline={targetUser.isOnline} />
                </div>
                <div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1">
                        {targetUser.name}
                        {targetUser.isVerified && <i className="fas fa-check-circle text-blue-500 text-xs"></i>}
                        {targetUser.isSupport && <i className="fas fa-check-circle text-game-primary text-xs"></i>}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {isOffline ? <span className="text-red-500"><i className="fas fa-wifi"></i> Offline</span> : `@${targetUser.username}`}
                    </div>
                </div>
            </div>
            <button onClick={openMatchSetup} disabled={isOffline} className="bg-game-primary text-white px-4 py-2 rounded-xl text-xs font-bold uppercase shadow-lg shadow-indigo-500/30 active:scale-95 transition-transform hover:bg-indigo-600 disabled:opacity-50">
                <i className="fas fa-gamepad mr-2"></i> Play
            </button>
        </div>

        {/* Messages */}
        <div 
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-4 space-y-3 pb-28 md:pb-32 relative z-10 custom-scrollbar"
        >
            {messages.length === 0 && !loadingHistory && (
                <div className="flex items-center justify-center h-48 opacity-50">
                    <p className="text-sm font-bold">No messages yet. Say hi!</p>
                </div>
            )}
            
            {messages.map((msg, index) => {
                const isMe = msg.sender === user?.uid;
                const status = msg.status || 'waiting'; 
                const isInvite = msg.type === 'invite';
                
                return (
                    <div key={msg.id || `temp-${index}`} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate__animated animate__fadeInUp`}>
                        {isInvite ? (
                             <div className={`max-w-[85%] w-64 p-5 rounded-3xl ${isMe ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white dark:bg-slate-800 border-2 border-game-primary rounded-bl-sm'} shadow-xl relative overflow-hidden`}>
                                 <div className={`absolute top-0 right-0 p-2 opacity-10 pointer-events-none`}>
                                     <i className="fas fa-gamepad text-6xl"></i>
                                 </div>
                                 <div className={`font-black uppercase text-[10px] mb-3 ${isMe ? 'text-indigo-200' : 'text-game-primary'} tracking-widest border-b border-white/20 pb-2`}>Quiz Invitation</div>
                                 <div className="text-center">
                                     <h3 className={`text-lg font-bold leading-tight mb-1 ${isMe ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{msg.subjectName || "Unknown Subject"}</h3>
                                     <div className="my-3 bg-black/20 rounded-lg p-2 backdrop-blur-sm">
                                         <div className="text-[10px] uppercase font-bold opacity-70">Room Code</div>
                                         <div className="text-2xl font-mono font-black tracking-widest">{msg.inviteCode}</div>
                                     </div>
                                     
                                     {/* Invite Status Indicators */}
                                     {status === 'played' ? (
                                         <div className="bg-green-500/20 text-green-300 dark:text-green-400 font-bold px-4 py-2 rounded-xl text-xs border border-green-500/30 flex items-center justify-center gap-2"><i className="fas fa-check-circle"></i> Played</div>
                                     ) : status === 'canceled' ? (
                                         <div className="bg-red-500/20 text-red-300 dark:text-red-400 font-bold px-4 py-2 rounded-xl text-xs border border-red-500/30 flex items-center justify-center gap-2"><i className="fas fa-ban"></i> Canceled</div>
                                     ) : status === 'expired' ? (
                                         <div className="bg-gray-500/20 text-gray-300 dark:text-gray-400 font-bold px-4 py-2 rounded-xl text-xs border border-gray-500/30 flex items-center justify-center gap-2"><i className="fas fa-clock"></i> Expired</div>
                                     ) : !isMe ? (
                                         <button disabled={isOffline} onClick={() => acceptInvite(msg.inviteCode!)} className="bg-game-primary text-white px-4 py-2 rounded-xl font-bold w-full shadow-lg hover:brightness-110 active:scale-95 transition-all text-xs uppercase tracking-wider disabled:opacity-50">Join Match</button>
                                     ) : (
                                         <div className="text-[10px] font-bold italic opacity-70 flex items-center justify-center gap-2"><i className="fas fa-spinner fa-spin"></i> Waiting...</div>
                                     )}
                                 </div>
                                 <div className={`text-[9px] text-right mt-3 flex items-center justify-end gap-1 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                     {formatTime(msg.timestamp)}
                                     {isMe && renderMessageStatus(msg.msgStatus, true)}
                                 </div>
                             </div>
                        ) : (
                             <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm shadow-md ${isMe ? 'bg-game-primary text-white rounded-br-none' : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-none border border-slate-200 dark:border-slate-700'}`}>
                                 {msg.text}
                                 <div className={`text-[9px] text-right mt-1 font-medium flex items-center justify-end gap-1 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                     {formatTime(msg.timestamp)}
                                     {isMe && renderMessageStatus(msg.msgStatus, false)}
                                 </div>
                             </div>
                        )}
                    </div>
                );
            })}
            <div ref={messagesEndRef}></div>
        </div>

        {/* Scroll Button */}
        {showScrollButton && (
            <button onClick={scrollToBottom} className="fixed bottom-24 right-4 z-50 w-10 h-10 bg-slate-900/50 dark:bg-slate-700/50 text-white rounded-full shadow-lg backdrop-blur-md flex items-center justify-center animate__animated animate__fadeInUp hover:bg-slate-900 transition-colors">
                <i className="fas fa-arrow-down"></i>
                {messages.length > 0 && messages[messages.length - 1].sender !== user?.uid && <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white animate-pulse"></span>}
            </button>
        )}

        {/* Input Area */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 transition-all duration-300 pb-[env(safe-area-inset-bottom)]">
            <div className="max-w-4xl mx-auto w-full p-2 sm:p-3 md:p-4">
                <form onSubmit={(e) => sendMessage(e, 'text')} className="flex items-center gap-2">
                    <div className="flex-1 relative group">
                        <input 
                            className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-5 py-3 md:py-3.5 pl-5 pr-12 text-sm md:text-base text-slate-900 dark:text-white focus:outline-none focus:border-game-primary focus:ring-2 focus:ring-game-primary/20 transition-all font-medium placeholder-slate-400"
                            placeholder={isOffline ? "Waiting for connection..." : "Message..."}
                            value={inputText}
                            onChange={e => setInputText(e.target.value)}
                            disabled={isOffline}
                        />
                    </div>
                    <button type="submit" disabled={!inputText.trim() || isOffline} className="w-11 h-11 md:w-12 md:h-12 shrink-0 rounded-full bg-gradient-to-tr from-game-primary to-indigo-600 text-white flex items-center justify-center disabled:opacity-50 disabled:scale-95 shadow-lg hover:scale-105 active:scale-90 transition-all">
                        <i className="fas fa-paper-plane"></i>
                    </button>
                </form>
            </div>
        </div>

        {/* Game Setup Modal */}
        <Modal isOpen={showGameSetup} title="Start Battle" onClose={() => setShowGameSetup(false)}>
            <div className="space-y-4 pt-2">
                <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase mb-2">1. Select Subject</label>
                    <div className="relative">
                        <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} className="w-full p-4 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white border-2 border-transparent focus:border-game-primary rounded-xl appearance-none font-bold cursor-pointer">
                            <option value="">-- Choose Subject --</option>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"></i>
                    </div>
                </div>
                <div className={!selectedSubject ? 'opacity-50 pointer-events-none' : ''}>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase mb-2">2. Select Chapter</label>
                    <div className="relative">
                        <select value={selectedChapter} onChange={(e) => setSelectedChapter(e.target.value)} className="w-full p-4 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white border-2 border-transparent focus:border-game-primary rounded-xl appearance-none font-bold cursor-pointer" disabled={!selectedSubject}>
                            <option value="">-- Choose Chapter --</option>
                            {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"></i>
                    </div>
                </div>
                <div className="pt-4 flex gap-3">
                    <Button variant="secondary" fullWidth onClick={() => setShowGameSetup(false)}>Cancel</Button>
                    <Button fullWidth onClick={confirmMatchInvite} isLoading={setupLoading} disabled={!selectedChapter}>Send Invite</Button>
                </div>
            </div>
        </Modal>

        {/* 2026 Celebration Overlay */}
        {showYearAnim && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
                {/* Backdrop with slight blur but transparent enough to see chat */}
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate__animated animate__fadeIn"></div>
                
                <div className="relative z-10 flex flex-col items-center">
                    <div className="font-black text-9xl text-white drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] flex items-center" style={{ fontFamily: 'Impact, sans-serif' }}>
                        {/* 202 */}
                        <span className="text-yellow-400 tracking-tighter">202</span>
                        
                        <div className="relative w-[0.6em] h-[1em]">
                            {/* Number 5 - Exits */}
                            <span 
                                className={`absolute inset-0 text-yellow-400 flex justify-center transition-all duration-700 ease-in
                                    ${yearStep >= 2 ? 'translate-y-[200%] rotate-[120deg] opacity-0' : 'translate-y-0 rotate-0 opacity-100'}
                                `}
                            >
                                5
                            </span>
                            
                            {/* Number 6 - Enters */}
                            <span 
                                className={`absolute inset-0 text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-500 flex justify-center transition-all duration-500 cubic-bezier(0.34, 1.56, 0.64, 1)
                                    ${yearStep >= 2 ? 'translate-y-0 scale-100 opacity-100' : '-translate-y-[150%] scale-50 opacity-0'}
                                `}
                            >
                                6
                            </span>
                        </div>
                    </div>
                    
                    {yearStep >= 2 && (
                        <div className="mt-8 text-4xl font-black text-white uppercase tracking-widest animate__animated animate__jackInTheBox drop-shadow-lg text-center bg-game-primary px-6 py-2 rounded-full transform -rotate-2">
                            Happy New Year!
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
  );
};

export default ChatPage;
