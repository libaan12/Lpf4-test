import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Card } from './UI';
import { playSound } from '../services/audioService';

// Specific API Key for Player Assistant
const ASSISTANT_API_KEY = "AIzaSyANNTSat_EsUKxz38GoyWWqUR5rEa5OHfY";

interface Message {
  role: 'user' | 'model';
  text: string;
}

export const LPAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize Messages from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem('lp_assistant_history');
    if (saved) {
      setMessages(JSON.parse(saved));
    } else {
        // Initial greeting in Somali
        setMessages([{ role: 'model', text: 'Soo dhawoow! Waxaan ahay Kaaliyaha LP. Waxaad i weydiin kartaa wax walba oo ku saabsan tartanka, app-ka, ama talooyin waxbarasho!' }]);
    }
  }, []);

  // Save to LocalStorage
  useEffect(() => {
    if(messages.length > 0) {
        localStorage.setItem('lp_assistant_history', JSON.stringify(messages));
    }
  }, [messages]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const toggleChat = () => {
    playSound('click');
    setIsOpen(!isOpen);
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    const userMsg = inputText.trim();
    setInputText('');
    
    // Add User Message
    const newHistory: Message[] = [...messages, { role: 'user', text: userMsg }];
    setMessages(newHistory);
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: ASSISTANT_API_KEY });
      
      const systemPrompt = `You are LP Assistant, a helpful AI guide for the LP-F4 Quiz Battle app (Somali Student Quiz Battle). 
      The app allows students to compete in real-time quizzes (Battle Mode), practice solo (Solo Mode), and view Leaderboards.
      Admins can manage quizzes.

      IMPORTANT INSTRUCTION: 
      Your primary language is Somali (Af-Soomaali). You must answer all questions in Somali unless the user explicitly requests another language (like English).
      
      Be concise, encouraging, and friendly. Answer questions about general knowledge or how to use the app.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userMsg,
        config: {
            systemInstruction: systemPrompt,
        }
      });

      const reply = response.text || "Waan ka xumahay, hadda ma fikiri karo. Fadlan isku day mar kale.";
      
      setMessages([...newHistory, { role: 'model', text: reply }]);
    } catch (error) {
      console.error(error);
      setMessages([...newHistory, { role: 'model', text: "Waan ka xumahay, kuma xirni karo maskaxdayda (Gemini API). Fadlan hubi API Key-ga." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button 
        onClick={toggleChat}
        className="fixed bottom-20 md:bottom-8 right-6 w-14 h-14 bg-somali-blue hover:bg-blue-600 rounded-full shadow-xl flex items-center justify-center text-white z-50 transition-transform transform hover:scale-105 active:scale-95 border-2 border-white/20"
      >
        <i className={`fas ${isOpen ? 'fa-times' : 'fa-robot'} text-xl`}></i>
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-36 md:bottom-24 right-6 w-[90vw] md:w-96 h-[60vh] md:h-[500px] z-50 flex flex-col animate__animated animate__fadeInUp origin-bottom-right">
           <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700">
               {/* Header */}
               <div className="bg-somali-blue p-4 flex justify-between items-center text-white shadow-md">
                   <div className="flex items-center gap-2">
                       <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                          <i className="fas fa-robot text-sm"></i>
                       </div>
                       <div>
                          <span className="font-bold block leading-none">LP Assistant</span>
                          <span className="text-[10px] opacity-80">Online</span>
                       </div>
                   </div>
                   <button onClick={() => setMessages([])} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors" title="Clear History">
                       Clear
                   </button>
               </div>

               {/* Messages */}
               <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
                   {messages.map((msg, i) => (
                       <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                           <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm ${
                               msg.role === 'user' 
                               ? 'bg-somali-blue text-white rounded-br-none' 
                               : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-bl-none'
                           }`}>
                               {msg.text}
                           </div>
                       </div>
                   ))}
                   {isTyping && (
                       <div className="flex justify-start">
                           <div className="bg-white dark:bg-gray-800 p-3 rounded-2xl rounded-bl-none flex gap-1 border border-gray-200 dark:border-gray-700 shadow-sm">
                               <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                               <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                               <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                           </div>
                       </div>
                   )}
                   <div ref={messagesEndRef}></div>
               </div>

               {/* Input */}
               <form onSubmit={handleSend} className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex gap-2">
                   <input 
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      placeholder="Weydii su'aal..."
                      className="flex-1 bg-gray-100 dark:bg-gray-800 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-somali-blue dark:text-white placeholder-gray-500 transition-all"
                   />
                   <button 
                      type="submit" 
                      disabled={!inputText.trim() || isTyping} 
                      className="w-10 h-10 rounded-xl bg-somali-blue text-white flex items-center justify-center hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                   >
                       <i className="fas fa-paper-plane"></i>
                   </button>
               </form>
           </div>
        </div>
      )}
    </>
  );
};