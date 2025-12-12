import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../App';
import { UserProfile } from '../types';
import { Avatar } from '../components/UI';

const LeaderboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const [players, setPlayers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
        try {
            // Fetch all users and sort client-side to avoid "Index not defined" error.
            // Note: For large production apps, configure ".indexOn": "points" in Firebase rules 
            // and use query(ref(db, 'users'), orderByChild('points'), limitToLast(20)) for efficiency.
            const usersRef = ref(db, 'users');
            const snapshot = await get(usersRef);
            
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
                
                // Display top 20
                setPlayers(list.slice(0, 20));
            }
        } catch (e) {
            console.error("Leaderboard error", e);
        } finally {
            setLoading(false);
        }
    };
    fetchLeaderboard();
  }, []);

  const getRankStyle = (index: number, isMe: boolean) => {
     if (isMe) return "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-700";
     if (index === 0) return "border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10";
     if (index === 1) return "border-gray-400 bg-gray-50 dark:bg-gray-800";
     if (index === 2) return "border-orange-400 bg-orange-50 dark:bg-orange-900/10";
     return "border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800";
  };

  const getIcon = (index: number) => {
    if (index === 0) return <i className="fas fa-crown text-yellow-500"></i>;
    if (index === 1) return <i className="fas fa-medal text-gray-500"></i>;
    if (index === 2) return <i className="fas fa-medal text-orange-500"></i>;
    return <span className="text-gray-400 dark:text-gray-500 font-bold">{index + 1}</span>;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 flex flex-col transition-colors">
       <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/')} className="text-gray-600 dark:text-gray-300"><i className="fas fa-arrow-left fa-lg"></i></button>
        <h1 className="text-2xl font-bold dark:text-white">Top Students</h1>
      </div>

      {loading ? (
        <div className="flex justify-center mt-20"><i className="fas fa-spinner fa-spin text-somali-blue text-2xl"></i></div>
      ) : (
        <div className="space-y-3 pb-20">
            {players.length === 0 && <div className="text-center text-gray-500 dark:text-gray-400">No players found.</div>}
            {players.map((p, idx) => {
                const isMe = p.uid === user?.uid;
                return (
                    <div key={p.uid} className={`flex items-center p-4 rounded-xl border-2 shadow-sm ${getRankStyle(idx, isMe)} animate__animated animate__fadeInUp`} style={{animationDelay: `${idx * 0.05}s`}}>
                        <div className="w-8 text-center text-xl mr-2">
                            {getIcon(idx)}
                        </div>
                        <Avatar src={p.avatar} seed={p.uid} size="sm" className="mr-4" />
                        <div className="flex-1">
                            <div className="font-bold flex items-center gap-2 dark:text-white">
                                {p.name}
                                {isMe && <span className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-[10px] px-2 py-0.5 rounded-full">YOU</span>}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Level {Math.floor(p.points/100) + 1}</div>
                        </div>
                        <div className="font-mono font-bold text-somali-blue dark:text-blue-400">{p.points} pts</div>
                    </div>
                );
            })}
        </div>
      )}
    </div>
  );
};

export default LeaderboardPage;