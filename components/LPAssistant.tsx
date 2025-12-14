import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { playSound } from '../services/audioService';

const ASSISTANT_API_KEY = "AIzaSyBxS3g1glyhOy_z-i-5BLAn3Bs2xN8Q_Kk";

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

  useEffect(() => {
    const saved = localStorage.getItem('lp_assistant_history');
    if (saved) {
      setMessages(JSON.parse(saved));
    } else {
        setMessages([{ role: 'model', text: 'Soo dhawoow! Waxaan ahay Kaaliyaha LP. Waxaad i weydiin kartaa wax walba oo ku saabsan tartanka, app-ka, ama talooyin waxbarasho!' }]);
    }
  }, []);

  useEffect(() => {
    if(messages.length > 0) {
        localStorage.setItem('lp_assistant_history', JSON.stringify(messages));
    }
  }, [messages]);

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
    
    const newHistory: Message[] = [...messages, { role: 'user', text: userMsg }];
    setMessages(newHistory);
    setIsTyping(true);

    try {
      const ai = new GoogleGenAI({ apiKey: ASSISTANT_API_KEY });
      const systemPrompt = `You are LP Assistant, a helpful AI guide for the LP-F4 Quiz Battle app (Somali Student Quiz Battle). 
      IMPORTANT INSTRUCTION: Your primary language is Somali (Af-Soomaali). You must answer all questions in Somali unless the user explicitly requests another language.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userMsg,
        config: { systemInstruction: systemPrompt }
      });

      const reply = response.text || "Waan ka xumahay, hadda ma fikiri karo.";
      setMessages([...newHistory, { role: 'model', text: reply }]);
    } catch (error) {
      setMessages([...newHistory, { role: 'model', text: "Waan ka xumahay, kuma xirni karo maskaxdayda." }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      <button 
        onClick={toggleChat}
        className="fixed bottom-20 md:bottom-8 right-6 w-14 h-14 bg-somali-blue hover:bg-blue-600 rounded-full shadow-xl shadow-blue-500/30 flex items-center justify-center text-white z-50 transition-transform transform hover:scale-105 active:scale-95 border-2 border-white/20"
      >
        <i className={`fas ${isOpen ? 'fa-times' : 'fa-robot'} text-xl`}></i>
      </button>

      {isOpen && (
        <div className="fixed bottom-36 md:bottom-24 right-6 w-[90vw] md:w-96 h-[60vh] md:h-[500px] z-50 flex flex-col animate__animated animate__fadeInUp origin-bottom-right">
           <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700">
               {/* Header */}
               <div className="bg-somali-blue p-4 flex justify-between items-center text-white shadow-md">
                   <div className="flex items-center gap-3">
                       <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center border border-white/20">
                          <i className="fas fa-robot text-sm"></i>
                       </div>
                       <div>
                          <span className="font-bold block leading-none">LP Assistant</span>
                          <span className="text-[10px] opacity-80">Online</span>
                       </div>
                   </div>
                   <button onClick={() => setMessages([])} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full transition-colors border border-white/20">Clear</button>
               </div>

               {/* Messages Area */}
               <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900/50">
                   {messages.map((msg, i) => (
                       <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                           <div className={`max-w-[85%] p-3 rounded-2xl text-sm shadow-sm leading-relaxed ${
                               msg.role === 'user' 
                               ? 'bg-somali-blue text-white rounded-br-none' 
                               : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-bl-none'
                           }`}>
                               {msg.text}
                           </div>
                       </div>
                   ))}
                   {isTyping && (
                       <div className="flex justify-start">
                           <div className="bg-white dark:bg-gray-800 p-3 rounded-2xl rounded-bl-none flex gap-1 border border-gray-100 dark:border-gray-700 shadow-sm">
                               <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                               <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                               <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                           </div>
                       </div>
                   )}
                   <div ref={messagesEndRef}></div>
               </div>

               {/* Input Area */}
               <form onSubmit={handleSend} className="p-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-2">
                   <input 
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      placeholder="Weydii su'aal..."
                      className="flex-1 bg-gray-100 dark:bg-gray-900 border border-transparent focus:border-somali-blue/50 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-somali-blue text-gray-800 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 transition-all outline-none"
                   />
                   <button 
                      type="submit" 
                      disabled={!inputText.trim() || isTyping} 
                      className="w-11 h-11 rounded-xl bg-somali-blue text-white flex items-center justify-center hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
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
