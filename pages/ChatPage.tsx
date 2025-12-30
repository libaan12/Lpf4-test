
import React, { useState, useEffect, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, push, set, serverTimestamp, update, get, runTransaction } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { ChatMessage, UserProfile, Subject, Chapter } from '../types';
import { Avatar, Button, Modal, Card } from '../components/UI';
import { playSound } from '../services/audioService';
import { showToast, showAlert } from '../services/alert';

const ChatPage: React.FC = () => {
  const { uid } = useParams(); // Target user ID
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  
  // Match Setup State
  const [showGameSetup, setShowGameSetup] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [setupLoading, setSetupLoading] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Chat
  useEffect(() => {
      if (!user || !uid) return;
      
      // Fetch Target User Info
      get(ref(db, `users/${uid}`)).then(snap => {
          if (snap.exists()) setTargetUser({ uid, ...snap.val() });
      });

      // Construct Chat ID (lexicographically sorted to be unique for pair)
      const participants = [user.uid, uid].sort();
      const derivedChatId = `${participants[0]}_${participants[1]}`;
      setChatId(derivedChatId);

      // 1. Reset My Unread Count for this chat
      update(ref(db, `chats/${derivedChatId}/unread/${user.uid}`), { count: 0 });

      // 2. Load from Cache first
      const cachedMsgs = localStorage.getItem(`chat_${derivedChatId}`);
      if (cachedMsgs) {
          try {
              setMessages(JSON.parse(cachedMsgs));
          } catch(e) {}
      }

      // 3. Listen for Live Messages
      const msgsRef = ref(db, `chats/${derivedChatId}/messages`);
      const unsub = onValue(msgsRef, (snap) => {
          if (snap.exists()) {
              const data = snap.val();
              const list = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a,b) => a.timestamp - b.timestamp);
              setMessages(list);
              // Save to localStorage immediately on updates
              localStorage.setItem(`chat_${derivedChatId}`, JSON.stringify(list));
              
              // Reset unread count again if we are actively viewing and a new message comes in
              update(ref(db, `chats/${derivedChatId}/unread/${user.uid}`), { count: 0 });
              
              // Mark incoming messages as read if I am the recipient
              const updates: any = {};
              let hasReadUpdates = false;
              let latestMsgId = list[list.length - 1]?.id;

              list.forEach(m => {
                  if (m.sender !== user.uid && m.msgStatus !== 'read') {
                      // Update Message Status
                      updates[`chats/${derivedChatId}/messages/${m.id}/msgStatus`] = 'read';
                      hasReadUpdates = true;
                      
                      // If this is the LATEST message, update root status too so sender sees blue tick in list
                      if (m.id === latestMsgId) {
                          updates[`chats/${derivedChatId}/lastMessageStatus`] = 'read';
                      }
                  }
              });

              if (hasReadUpdates) {
                  update(ref(db), updates);
              }
          }
      });

      return () => unsub();
  }, [user, uid]);

  // Load Subjects for Match Setup
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

  // Load Chapters when Subject Selected
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

  useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Persist messages to LocalStorage whenever state changes
  useEffect(() => {
      if (chatId && messages.length > 0) {
          localStorage.setItem(`chat_${chatId}`, JSON.stringify(messages));
      }
  }, [messages, chatId]);

  const sendMessage = async (e?: React.FormEvent, type: 'text' | 'invite' = 'text', inviteCode?: string, subjectName?: string) => {
      e?.preventDefault();
      if ((!inputText.trim() && type === 'text') || !user || !chatId) return;

      const tempId = `temp_${Date.now()}`;
      
      const msgData: any = {
          sender: user.uid,
          text: type === 'invite' ? 'CHALLENGE_INVITE' : inputText.trim(),
          type,
          inviteCode: inviteCode || null,
          subjectName: subjectName || null,
          timestamp: Date.now(),
          status: type === 'invite' ? 'waiting' : null,
          msgStatus: 'sent'
      };

      if (type === 'text') setInputText('');

      // Optimistic Update
      const optimisticMsg: ChatMessage = { id: tempId, ...msgData };
      setMessages(prev => [...prev, optimisticMsg]);
      
      try {
          // Push to Firebase
          await push(ref(db, `chats/${chatId}/messages`), msgData);
          
          // Update last message metadata AND Root Status
          await update(ref(db, `chats/${chatId}`), {
              lastMessage: msgData.text,
              lastTimestamp: serverTimestamp(),
              lastMessageSender: user.uid, 
              lastMessageStatus: 'sent',   
              participants: { [user.uid]: true, [uid!]: true }
          });

          // Increment Unread Count for Recipient
          const recipientUnreadRef = ref(db, `chats/${chatId}/unread/${uid}/count`);
          runTransaction(recipientUnreadRef, (currentCount) => {
              return (currentCount || 0) + 1;
          });

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
          
          const msgsRef = ref(db, `chats/${chatId}/messages`);
          const newMsgRef = push(msgsRef);
          
          const roomData = { 
              host: user.uid, 
              sid: selectedSubject, 
              lid: selectedChapter, 
              questionLimit: 10, 
              createdAt: Date.now(),
              linkedChatPath: `chats/${chatId}/messages/${newMsgRef.key}`
          };
          
          await set(ref(db, `rooms/${code}`), roomData);
          
          const msgData = {
              sender: user.uid,
              text: 'CHALLENGE_INVITE',
              type: 'invite',
              inviteCode: code,
              subjectName: subjectName,
              timestamp: serverTimestamp(),
              status: 'waiting',
              msgStatus: 'sent'
          };
          
          // Optimistic update
          setMessages(prev => [...prev, { id: newMsgRef.key || `temp_${Date.now()}`, ...msgData, timestamp: Date.now() } as any]);

          await set(newMsgRef, msgData);
          
          // Update root metadata
          await update(ref(db, `chats/${chatId}`), {
              lastMessage: msgData.text,
              lastTimestamp: serverTimestamp(),
              lastMessageSender: user.uid,
              lastMessageStatus: 'sent',
              participants: { [user.uid]: true, [uid!]: true }
          });

           // Increment Unread Count for Recipient
           const recipientUnreadRef = ref(db, `chats/${chatId}/unread/${uid}/count`);
           runTransaction(recipientUnreadRef, (count) => (count || 0) + 1);
          
          setShowGameSetup(false);
          playSound('correct');
          showToast('Invite sent! Redirecting to lobby...', 'success');
          
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

  // Improved Tick Rendering: High Contrast Colors
  const renderMessageStatus = (status: string | undefined, isInvite: boolean = false) => {
      // Base color for Sent/Delivered (White transparent works on both Orange and Blue backgrounds)
      const baseColor = "text-white/60";
      
      // Read Color Logic:
      // If Invite (Blue BG) -> Orange Tick (text-orange-400)
      // If Text (Orange BG) -> Blue Tick (text-blue-800)
      const readColor = isInvite ? "text-orange-400" : "text-blue-800";

      if (!status || status === 'sent') {
          return <i className={`fas fa-check ${baseColor} text-[10px] ml-1`} title="Sent"></i>;
      }
      if (status === 'delivered') {
          return <i className={`fas fa-check-double ${baseColor} text-[10px] ml-1`} title="Delivered"></i>;
      }
      if (status === 'read') {
          return <i className={`fas fa-check-double ${readColor} text-[10px] ml-1`} title="Read"></i>;
      }
      return null;
  };

  if (!targetUser) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 text-slate-500 dark:text-white font-bold">Loading Chat...</div>;

  return (
    <div className="fixed inset-0 flex flex-col z-50 bg-slate-100 dark:bg-slate-900 transition-colors">
        
        {/* Dynamic Background Pattern */}
        <div className="absolute inset-0 opacity-10 pointer-events-none z-0" 
             style={{ 
                 backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%236366f1' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` 
             }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/50 dark:to-black/50 pointer-events-none z-0"></div>

        {/* Header - Fixed Glass */}
        <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 p-4 shadow-sm flex items-center justify-between relative z-20 transition-colors duration-300">
            <div className="flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="text-gray-500 dark:text-gray-300 w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><i className="fas fa-arrow-left"></i></button>
                <div className="relative">
                    <Avatar src={targetUser.avatar} seed={targetUser.uid} size="sm" isVerified={targetUser.isVerified} isOnline={targetUser.isOnline} />
                </div>
                <div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1">
                        {targetUser.name}
                        {targetUser.isVerified && <i className="fas fa-check-circle text-blue-500 text-xs"></i>}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">@{targetUser.username}</div>
                </div>
            </div>
            <button 
                onClick={openMatchSetup}
                className="bg-game-primary text-white px-4 py-2 rounded-xl text-xs font-bold uppercase shadow-lg shadow-indigo-500/30 active:scale-95 transition-transform hover:bg-indigo-600"
            >
                <i className="fas fa-gamepad mr-2"></i> Play
            </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-28 md:pb-32 relative z-10 custom-scrollbar">
            {messages.map((msg) => {
                const isMe = msg.sender === user?.uid;
                const status = msg.status || 'waiting'; 
                const isInvite = msg.type === 'invite';
                
                return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate__animated animate__fadeInUp`}>
                        {isInvite ? (
                             <div className={`max-w-[85%] w-64 p-5 rounded-3xl ${isMe ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-white dark:bg-slate-800 border-2 border-game-primary rounded-bl-sm'} shadow-xl relative overflow-hidden`}>
                                 <div className={`absolute top-0 right-0 p-2 opacity-10 pointer-events-none`}>
                                     <i className="fas fa-gamepad text-6xl"></i>
                                 </div>
                                 <div className={`font-black uppercase text-[10px] mb-3 ${isMe ? 'text-indigo-200' : 'text-game-primary'} tracking-widest border-b border-white/20 pb-2`}>
                                     Quiz Invitation
                                 </div>
                                 <div className="text-center">
                                     <h3 className={`text-lg font-bold leading-tight mb-1 ${isMe ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                                         {msg.subjectName || "Unknown Subject"}
                                     </h3>
                                     <div className="my-3 bg-black/20 rounded-lg p-2 backdrop-blur-sm">
                                         <div className="text-[10px] uppercase font-bold opacity-70">Room Code</div>
                                         <div className="text-2xl font-mono font-black tracking-widest">{msg.inviteCode}</div>
                                     </div>
                                     
                                     {/* Status Rendering */}
                                     {status === 'played' ? (
                                         <div className="bg-green-500/20 text-green-300 dark:text-green-400 font-bold px-4 py-2 rounded-xl text-xs border border-green-500/30 flex items-center justify-center gap-2">
                                             <i className="fas fa-check-circle"></i> Played
                                         </div>
                                     ) : status === 'canceled' ? (
                                         <div className="bg-red-500/20 text-red-300 dark:text-red-400 font-bold px-4 py-2 rounded-xl text-xs border border-red-500/30 flex items-center justify-center gap-2">
                                             <i className="fas fa-ban"></i> Canceled
                                         </div>
                                     ) : !isMe ? (
                                         <button onClick={() => acceptInvite(msg.inviteCode!)} className="bg-game-primary text-white px-4 py-2 rounded-xl font-bold w-full shadow-lg hover:brightness-110 active:scale-95 transition-all text-xs uppercase tracking-wider">
                                             Join Match
                                         </button>
                                     ) : (
                                         <div className="text-[10px] font-bold italic opacity-70 flex items-center justify-center gap-2">
                                             <i className="fas fa-spinner fa-spin"></i> Waiting for opponent...
                                         </div>
                                     )}
                                 </div>
                                 <div className={`text-[9px] text-right mt-3 flex items-center justify-end gap-1 ${isMe ? 'text-indigo-200' : 'text-slate-400'}`}>
                                     {formatTime(msg.timestamp)}
                                     {isMe && renderMessageStatus(msg.msgStatus, true)}
                                 </div>
                             </div>
                        ) : (
                             <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm shadow-md ${
                                 isMe 
                                 ? 'bg-game-primary text-white rounded-br-none' 
                                 : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-none border border-slate-200 dark:border-slate-700'
                             }`}>
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

        {/* Modern Responsive Fixed Input Area */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 transition-all duration-300">
             {/* Safe area spacer for iOS */}
            <div className="pb-[env(safe-area-inset-bottom)]">
                <div className="max-w-4xl mx-auto w-full p-2 sm:p-3 md:p-4">
                    <form onSubmit={(e) => sendMessage(e, 'text')} className="flex items-center gap-2">
                        <div className="flex-1 relative group">
                            <input 
                                className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-5 py-3 md:py-3.5 pl-5 pr-12 text-sm md:text-base text-slate-900 dark:text-white focus:outline-none focus:border-game-primary focus:ring-2 focus:ring-game-primary/20 transition-all font-medium placeholder-slate-400 dark:placeholder-slate-500 shadow-inner"
                                placeholder="Message..."
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                            />
                        </div>
                        
                        <button 
                            type="submit" 
                            disabled={!inputText.trim()}
                            className="w-11 h-11 md:w-12 md:h-12 shrink-0 rounded-full bg-gradient-to-tr from-game-primary to-indigo-600 text-white flex items-center justify-center disabled:opacity-50 disabled:scale-95 shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-105 active:scale-90 transition-all duration-200"
                        >
                            <i className="fas fa-paper-plane text-sm md:text-base"></i>
                        </button>
                    </form>
                </div>
            </div>
        </div>

        {/* Game Setup Modal */}
        <Modal isOpen={showGameSetup} title="Start Battle" onClose={() => setShowGameSetup(false)}>
            <div className="space-y-4 pt-2">
                <div>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase mb-2">1. Select Subject</label>
                    <div className="relative">
                        <select 
                            value={selectedSubject} 
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            className="w-full p-4 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white border-2 border-transparent focus:border-game-primary rounded-xl appearance-none font-bold cursor-pointer"
                        >
                            <option value="">-- Choose Subject --</option>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"></i>
                    </div>
                </div>

                <div className={!selectedSubject ? 'opacity-50 pointer-events-none' : ''}>
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-300 uppercase mb-2">2. Select Chapter</label>
                    <div className="relative">
                        <select 
                            value={selectedChapter} 
                            onChange={(e) => setSelectedChapter(e.target.value)}
                            className="w-full p-4 bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white border-2 border-transparent focus:border-game-primary rounded-xl appearance-none font-bold cursor-pointer"
                            disabled={!selectedSubject}
                        >
                            <option value="">-- Choose Chapter --</option>
                            {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"></i>
                    </div>
                </div>

                <div className="pt-4 flex gap-3">
                    <Button variant="secondary" fullWidth onClick={() => setShowGameSetup(false)}>Cancel</Button>
                    <Button 
                        fullWidth 
                        onClick={confirmMatchInvite} 
                        isLoading={setupLoading} 
                        disabled={!selectedChapter}
                    >
                        Send Invite
                    </Button>
                </div>
            </div>
        </Modal>
    </div>
  );
};

export default ChatPage;
