import React, { useState, useEffect, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, push, set, serverTimestamp, update, get } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { ChatMessage, UserProfile } from '../types';
import { Avatar } from '../components/UI';
import { playSound } from '../services/audioService';
import { showToast } from '../services/alert';

const ChatPage: React.FC = () => {
  const { uid } = useParams(); // Target user ID
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [targetUser, setTargetUser] = useState<UserProfile | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  
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

  const sendMatchInvite = async () => {
      if (!user || !uid) return;
      // Create Room
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      // NOTE: We rely on LobbyPage logic to handle room creation. 
      // For simplicity here, we assume standard room structure.
      // But to make it robust, we should create the room node here.
      
      const roomData = { 
          host: user.uid, 
          sid: 'general', // Default or prompt
          lid: 'ALL_general', 
          questionLimit: 10, 
          createdAt: Date.now() 
      };
      
      await set(ref(db, `rooms/${code}`), roomData);
      
      sendMessage(undefined, 'invite', code);
      showToast('Invite sent! Waiting in lobby...', 'success');
      
      // Redirect host to lobby with code prepopulated or handle separately
      // For now, let's navigate them to lobby with state
      navigate('/lobby'); // User needs to "Host Party" there or handle it automatically. 
      // Ideally, LobbyPage should detect hostedCode. 
      // But simpler: Just navigate host to lobby, they see "Room Created" if we update state there.
      // Better flow: Just send code, stay in chat? No, Match logic is in GamePage/Lobby.
  };

  const acceptInvite = async (code: string) => {
      // Copy code to clipboard or auto-join logic
      // Simplest: Navigate to LobbyPage and pre-fill code logic (requires updating LobbyPage to accept state)
      // Or manually replicate join logic here.
      // Let's copy to clipboard and notify.
      navigator.clipboard.writeText(code);
      showToast("Code Copied! Go to Lobby -> Join Room", "success");
      navigate('/lobby');
  };

  if (!targetUser) return <div className="min-h-screen flex items-center justify-center dark:text-white">Loading...</div>;

  return (
    <div className="fixed inset-0 bg-gray-50 dark:bg-slate-900 flex flex-col z-50">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 p-4 shadow-sm flex items-center justify-between border-b border-gray-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
                <button onClick={() => navigate(-1)} className="text-gray-500 dark:text-gray-300"><i className="fas fa-arrow-left"></i></button>
                <Avatar src={targetUser.avatar} seed={targetUser.uid} size="sm" isVerified={targetUser.isVerified} isOnline={targetUser.isOnline} />
                <div>
                    <div className="font-bold text-slate-900 dark:text-white text-sm">{targetUser.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">@{targetUser.username}</div>
                </div>
            </div>
            <button 
                onClick={sendMatchInvite}
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
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        {msg.type === 'invite' ? (
                             <div className={`max-w-[80%] p-4 rounded-2xl ${isMe ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 border-2 border-game-primary'} shadow-md`}>
                                 <div className="font-black uppercase text-xs mb-2 opacity-80">Battle Challenge</div>
                                 <div className="text-center py-2">
                                     <i className="fas fa-trophy text-3xl mb-2 text-yellow-400"></i>
                                     <div className="font-bold text-lg mb-2">Room Code: {msg.inviteCode}</div>
                                     {!isMe && (
                                         <button onClick={() => acceptInvite(msg.inviteCode!)} className="bg-game-primary text-white px-4 py-2 rounded-xl font-bold w-full shadow-lg">
                                             Join Match
                                         </button>
                                     )}
                                     {isMe && <div className="text-xs opacity-70 italic">Waiting for opponent...</div>}
                                 </div>
                             </div>
                        ) : (
                             <div className={`max-w-[75%] px-4 py-2 rounded-2xl text-sm shadow-sm ${
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
                className="flex-1 bg-gray-100 dark:bg-slate-900 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-game-primary transition-all font-medium"
                placeholder="Type a message..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
            />
            <button 
                type="submit" 
                disabled={!inputText.trim()}
                className="w-12 h-12 bg-game-primary text-white rounded-xl flex items-center justify-center disabled:opacity-50 shadow-md"
            >
                <i className="fas fa-paper-plane"></i>
            </button>
        </form>
    </div>
  );
};

export default ChatPage;