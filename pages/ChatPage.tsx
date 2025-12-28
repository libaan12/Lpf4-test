import React, { useState, useEffect, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, push, set, serverTimestamp, update, get } from 'firebase/database';
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

      // Listen for Messages
      const msgsRef = ref(db, `chats/${derivedChatId}/messages`);
      const unsub = onValue(msgsRef, (snap) => {
          if (snap.exists()) {
              const data = snap.val();
              const list = Object.keys(data).map(k => ({ id: k, ...data[k] })).sort((a,b) => a.timestamp - b.timestamp);
              setMessages(list);
              // Save to localStorage for simple offline history (optional enhancement)
              localStorage.setItem(`chat_${derivedChatId}`, JSON.stringify(list));
              playSound('click'); // Incoming msg sound
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

  const sendMessage = async (e?: React.FormEvent, type: 'text' | 'invite' = 'text', inviteCode?: string) => {
      e?.preventDefault();
      if ((!inputText.trim() && type === 'text') || !user || !chatId) return;

      const msgData = {
          sender: user.uid,
          text: type === 'invite' ? 'CHALLENGE_INVITE' : inputText.trim(),
          type,
          inviteCode: inviteCode || null,
          timestamp: serverTimestamp()
      };

      if (type === 'text') setInputText('');

      try {
          await push(ref(db, `chats/${chatId}/messages`), msgData);
          // Update last message metadata for chat lists if implemented
          await update(ref(db, `chats/${chatId}`), {
              lastMessage: msgData.text,
              lastTimestamp: serverTimestamp(),
              participants: { [user.uid]: true, [uid!]: true }
          });
      } catch (err) {
          console.error(err);
      }
  };

  const openMatchSetup = () => {
      setShowGameSetup(true);
      playSound('click');
  };

  const confirmMatchInvite = async () => {
      if (!user || !selectedSubject || !selectedChapter) {
          showToast("Please select a subject and chapter", "warning");
          return;
      }
      setSetupLoading(true);
      
      try {
          // Create Room
          const code = Math.floor(1000 + Math.random() * 9000).toString();
          const roomData = { 
              host: user.uid, 
              sid: selectedSubject, 
              lid: selectedChapter, 
              questionLimit: 10, 
              createdAt: Date.now() 
          };
          
          await set(ref(db, `rooms/${code}`), roomData);
          
          // Send Invite Message
          await sendMessage(undefined, 'invite', code);
          
          setShowGameSetup(false);
          playSound('correct');
          showToast('Invite sent! Redirecting to lobby...', 'success');
          
          // Redirect Host to Lobby in "Waiting" state
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
      // Navigate to Lobby with auto-join code
      // LobbyPage will handle the join logic and redirect to game
      navigate('/lobby', { state: { autoJoinCode: code } });
  };

  if (!targetUser) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 text-slate-500 dark:text-white font-bold">Loading Chat...</div>;

  return (
    <div className="fixed inset-0 bg-gray-50 dark:bg-slate-900 flex flex-col z-50">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 p-4 shadow-sm flex items-center justify-between border-b border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="text-gray-500 dark:text-gray-300 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"><i className="fas fa-arrow-left"></i></button>
                <div className="relative">
                    <Avatar src={targetUser.avatar} seed={targetUser.uid} size="sm" isVerified={targetUser.isVerified} isOnline={targetUser.isOnline} />
                </div>
                <div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm">{targetUser.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">@{targetUser.username}</div>
                </div>
            </div>
            <button 
                onClick={openMatchSetup}
                className="bg-game-primary text-white px-3 py-1.5 rounded-lg text-xs font-bold uppercase shadow-lg shadow-indigo-500/30 active:scale-95 transition-transform"
            >
                <i className="fas fa-gamepad mr-2"></i> Play
            </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-100 dark:bg-slate-900/50">
            {messages.map((msg) => {
                const isMe = msg.sender === user?.uid;
                return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate__animated animate__fadeInUp`}>
                        {msg.type === 'invite' ? (
                             <div className={`max-w-[85%] p-4 rounded-2xl ${isMe ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 border-2 border-game-primary'} shadow-md`}>
                                 <div className={`font-black uppercase text-[10px] mb-2 ${isMe ? 'text-indigo-200' : 'text-game-primary'} tracking-widest`}>Battle Challenge</div>
                                 <div className="text-center py-2">
                                     <div className="w-12 h-12 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-2 shadow-lg">
                                        <i className="fas fa-trophy text-white text-xl"></i>
                                     </div>
                                     <div className="font-black text-xl mb-3">Room: {msg.inviteCode}</div>
                                     {!isMe ? (
                                         <button onClick={() => acceptInvite(msg.inviteCode!)} className="bg-game-primary text-white px-6 py-3 rounded-xl font-bold w-full shadow-lg hover:brightness-110 active:scale-95 transition-all">
                                             Join Match
                                         </button>
                                     ) : (
                                         <div className="text-xs bg-black/20 px-3 py-1 rounded-full inline-block">Waiting for opponent...</div>
                                     )}
                                 </div>
                             </div>
                        ) : (
                             <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm shadow-sm ${
                                 isMe 
                                 ? 'bg-game-primary text-white rounded-br-none' 
                                 : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-bl-none border border-slate-200 dark:border-slate-700'
                             }`}>
                                 {msg.text}
                             </div>
                        )}
                    </div>
                );
            })}
            <div ref={messagesEndRef}></div>
        </div>

        {/* Input */}
        <form onSubmit={(e) => sendMessage(e, 'text')} className="p-3 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 flex gap-2">
            <input 
                className="flex-1 bg-gray-100 dark:bg-slate-900 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-game-primary transition-all font-medium placeholder-slate-400"
                placeholder="Type a message..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
            />
            <button 
                type="submit" 
                disabled={!inputText.trim()}
                className="w-12 h-12 bg-game-primary text-white rounded-xl flex items-center justify-center disabled:opacity-50 shadow-md hover:bg-indigo-600 transition-colors"
            >
                <i className="fas fa-paper-plane"></i>
            </button>
        </form>

        {/* Game Setup Modal */}
        <Modal isOpen={showGameSetup} title="Start Battle" onClose={() => setShowGameSetup(false)}>
            <div className="space-y-4 pt-2">
                <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">1. Select Subject</label>
                    <div className="relative">
                        <select 
                            value={selectedSubject} 
                            onChange={(e) => setSelectedSubject(e.target.value)}
                            className="w-full p-4 bg-slate-100 dark:bg-slate-700 dark:text-white border-2 border-transparent focus:border-game-primary rounded-xl appearance-none font-bold cursor-pointer"
                        >
                            <option value="">-- Choose Subject --</option>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"></i>
                    </div>
                </div>

                <div className={!selectedSubject ? 'opacity-50 pointer-events-none' : ''}>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">2. Select Chapter</label>
                    <div className="relative">
                        <select 
                            value={selectedChapter} 
                            onChange={(e) => setSelectedChapter(e.target.value)}
                            className="w-full p-4 bg-slate-100 dark:bg-slate-700 dark:text-white border-2 border-transparent focus:border-game-primary rounded-xl appearance-none font-bold cursor-pointer"
                            disabled={!selectedSubject}
                        >
                            <option value="">-- Choose Chapter --</option>
                            {chapters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"></i>
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