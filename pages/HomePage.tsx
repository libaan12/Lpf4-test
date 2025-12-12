import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserContext } from '../App';
import { Avatar, Card } from '../components/UI';
import { playSound } from '../services/audioService';

const HomePage: React.FC = () => {
  const { profile } = useContext(UserContext);
  const navigate = useNavigate();

  const handleNav = (path: string) => {
    playSound('click');
    navigate(path);
  };

  // Level Logic: 10 points per level
  const level = Math.floor((profile?.points || 0) / 10) + 1;

  return (
    <div className="min-h-full bg-gray-50 dark:bg-gray-900 flex flex-col transition-colors pb-6">
      {/* Header */}
      <header className="bg-somali-blue p-6 rounded-b-[2rem] shadow-lg relative z-10">
        <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-4">
            <div>
                <h1 className="text-white text-xl font-bold">Hello, {profile?.name}!</h1>
                <p className="text-blue-200 text-sm">Ready to learn?</p>
            </div>
            <div onClick={() => handleNav('/profile')}>
                <Avatar src={profile?.avatar} seed={profile?.uid || 'guest'} size="sm" className="cursor-pointer border-2 border-white" />
            </div>
            </div>
            
            {/* Stats Summary */}
            <div className="flex gap-4">
            <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl flex-1 text-white">
                <div className="text-xs opacity-75">Level</div>
                <div className="text-2xl font-bold">{level}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm p-3 rounded-xl flex-1 text-white">
                <div className="text-xs opacity-75">Points</div>
                <div className="text-2xl font-bold">{profile?.points || 0}</div>
            </div>
            </div>
        </div>
      </header>

      {/* Main Menu */}
      <main className="flex-1 p-6 space-y-4 -mt-4 max-w-4xl mx-auto w-full">
        
        {/* Admin Button */}
        {profile?.role === 'admin' && (
          <Card className="bg-gray-800 dark:bg-gray-800 text-white transform hover:scale-[1.02] transition-transform cursor-pointer border-l-8 border-gray-600 shadow-xl">
             <div onClick={() => handleNav('/admin')} className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center text-gray-300">
                  <i className="fas fa-cogs text-xl"></i>
                </div>
                <div>
                  <h3 className="font-bold text-lg">Admin Panel</h3>
                  <p className="text-gray-400 text-sm">Manage Quizzes</p>
                </div>
             </div>
          </Card>
        )}

        <Card className="transform hover:scale-[1.02] transition-transform cursor-pointer border-l-8 border-yellow-400 shadow-md" >
          <div onClick={() => handleNav('/lobby')} className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-yellow-100 dark:bg-yellow-900 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
              <i className="fas fa-bolt text-xl"></i>
            </div>
            <div>
              <h3 className="font-bold text-lg dark:text-white">Battle Mode</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Play against real students</p>
            </div>
          </div>
        </Card>

        <Card className="transform hover:scale-[1.02] transition-transform cursor-pointer border-l-8 border-green-500 shadow-md">
          <div onClick={() => handleNav('/solo')} className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center text-green-600 dark:text-green-400">
              <i className="fas fa-brain text-xl"></i>
            </div>
            <div>
              <h3 className="font-bold text-lg dark:text-white">Solo Training</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Practice without pressure</p>
            </div>
          </div>
        </Card>

        <Card className="transform hover:scale-[1.02] transition-transform cursor-pointer border-l-8 border-purple-500 shadow-md">
          <div onClick={() => handleNav('/leaderboard')} className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <i className="fas fa-trophy text-xl"></i>
            </div>
            <div>
              <h3 className="font-bold text-lg dark:text-white">Leaderboard</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">See top players</p>
            </div>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default HomePage;