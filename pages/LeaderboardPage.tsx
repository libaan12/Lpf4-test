import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { UserProfile } from '../types';
import { Avatar } from '../components/UI';

const LeaderboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const [players, setPlayers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
     // 1. Initial Load from Cache
     const cachedData = localStorage.getItem('leaderboard_cache');
     if (cachedData) {
         try {
            setPlayers(JSON.parse(cachedData));
            setLoading(false);
         } catch(e) {}
     }

     // 2. Subscribe to Live Updates
     const usersRef = ref(db, 'users');
     const handleUpdate = (snapshot: any) => {
         if (snapshot.exists()) {
             const data = snapshot.val();
             const list: UserProfile[] = Object.keys(data).map(key => ({
                 uid: key,
                 name: data[key].name || 'Unknown',
                 email: data[key].email || '',
                 points: typeof data[key].points === 'number' ? data[key].points : 0,
                 avatar: data[key].avatar || '',
             }));
             
             // Sort descending
             list.sort((a, b) => b.points - a.points);
             
             const top20 = list.slice(0, 20);
             setPlayers(top20);
             
             // Update Cache
             localStorage.setItem('leaderboard_cache', JSON.stringify(top20));
         }
         setLoading(false);
     };

     onValue(usersRef, handleUpdate);

     return () => {
         off(usersRef, 'value', handleUpdate);
     };
  }, []);

  const getRankStyle = (index: number) => {
     if (index === 0) return "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-600/50";
     if (index === 1) return "bg-gray-50 border-gray-200 dark:bg-gray-700/40 dark:border-gray-600/50";
     if (index === 2) return "bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-600/50";
     return "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700";
  };

  const getIcon = (index: number) => {
    if (index === 0) return <i className="fas fa-crown text-yellow-500 text-2xl drop-shadow-sm"></i>;
    if (index === 1) return <i className="fas fa-medal text-gray-400 dark:text-gray-300 text-xl"></i>;
    if (index === 2) return <i className="fas fa-medal text-orange-500 text-xl"></i>;
    return <span className="text-gray-400 font-bold text-lg w-6 text-center">{index + 1}</span>;
  }

  return (
    <div className="min-h-full p-4 flex flex-col pb-24 max-w-4xl mx-auto w-full">
       <div className="sticky top-0 z-30 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-md -mx-4 px-4 py-3 mb-6 border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm flex items-center gap-4 transition-colors">
        <button onClick={() => navigate('/')} className="text-gray-600 dark:text-gray-300 hover:text-game-primary dark:hover:text-blue-400 transition-colors">
            <i className="fas fa-arrow-left fa-lg"></i>
        </button>
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase italic">Top Students</h1>
      </div>

      {loading && players.length === 0 ? (
        <div className="space-y-3">
             {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 animate-pulse">
                    <div className="w-8 h-6 bg-gray-200 dark:bg-gray-700 rounded mr-3"></div>
                    <div className="w-10 h-10 bg-gray-200 dark:bg-gray-700 rounded-full mr-4"></div>
                    <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                    </div>
                    <div className="w-12 h-6 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
             ))}
        </div>
      ) : (
        <div className="space-y-3">
            {players.length === 0 && <div className="text-center text-gray-500 mt-10">No players found.</div>}
            {players.map((p, idx) => {
                const isMe = p.uid === user?.uid;
                const level = Math.floor(p.points / 10) + 1;
                
                return (
                    <div key={p.uid} className={`flex items-center p-3 md:p-4 rounded-2xl border shadow-sm ${getRankStyle(idx)} ${isMe ? 'ring-2 ring-game-primary ring-offset-2 dark:ring-offset-gray-900' : ''} animate__animated animate__fadeInUp transition-all hover:scale-[1.01]`} style={{animationDelay: `${idx * 0.05}s`}}>
                        {/* Rank Icon */}
                        <div className="w-10 flex justify-center items-center mr-2 shrink-0">
                            {getIcon(idx)}
                        </div>
                        
                        {/* Avatar */}
                        <Avatar src={p.avatar} seed={p.uid} size="sm" className="mr-3 shrink-0 border-2 border-white dark:border-slate-600 shadow-sm" />
                        
                        {/* Name & Level (Flex Grow) */}
                        <div className="flex-1 min-w-0 pr-2">
                            <div className="font-bold text-sm md:text-base text-slate-900 dark:text-white truncate flex items-center gap-2">
                                {p.name}
                                {isMe && <span className="bg-game-primary text-white text-[9px] px-1.5 py-0.5 rounded-md font-black tracking-wide">ME</span>}
                            </div>
                            <div className="text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                LVL {level}
                            </div>
                        </div>

                        {/* Points (Fixed Width) */}
                        <div className="text-right shrink-0">
                            <div className="font-black text-base md:text-lg text-game-primary dark:text-blue-400 leading-none">{p.points}</div>
                            <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">PTS</div>
                        </div>
                    </div>
                );
            })}
        </div>
      )}
    </div>
  );
};

export default LeaderboardPage;