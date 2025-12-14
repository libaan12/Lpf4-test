import React, { useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, updateProfile } from 'firebase/auth';
import { ref, update } from 'firebase/database';
import { auth, db } from '../firebase';
import { UserContext, ThemeContext } from '../App';
import { Avatar, Button, Card, Input } from '../components/UI';
import { playSound } from '../services/audioService';

const ProfilePage: React.FC = () => {
  const { profile, user } = useContext(UserContext);
  const { theme, setTheme } = useContext(ThemeContext);
  const navigate = useNavigate();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      setEditName(profile.name);
      setCurrentAvatarUrl(profile.avatar);
    }
  }, [profile]);

  const handleLogout = () => {
    signOut(auth);
    navigate('/auth');
  };

  const handleRandomizeAvatar = () => {
    const newSeed = Math.random().toString(36).substring(7);
    setCurrentAvatarUrl(`https://api.dicebear.com/7.x/avataaars/svg?seed=${newSeed}`);
    playSound('click');
  };

  const handleSaveProfile = async () => {
    if (!user || !editName.trim()) return;
    setLoading(true);
    try {
      // Update Auth Profile
      await updateProfile(user, { displayName: editName });
      
      // Update Database Profile
      await update(ref(db, `users/${user.uid}`), {
        name: editName,
        avatar: currentAvatarUrl
      });
      
      playSound('correct');
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      playSound('wrong');
    } finally {
      setLoading(false);
    }
  };

  const toggleTheme = () => {
      const newTheme = theme === 'light' ? 'dark' : 'light';
      setTheme(newTheme);
      playSound('click');
  };

  if (!profile) return null;

  // Level Logic: 10 points per level
  const level = Math.floor(profile.points / 10) + 1;
  const pointsInCurrentLevel = profile.points % 10;
  const progressPercent = (pointsInCurrentLevel / 10) * 100;
  const pointsToNext = 10 - pointsInCurrentLevel;

  return (
    <div className="min-h-full p-4 flex flex-col transition-colors max-w-3xl mx-auto w-full">
       <div className="sticky top-0 z-30 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-md -mx-4 px-4 py-3 mb-8 border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm flex items-center gap-4 transition-colors">
        <button onClick={() => navigate('/')} className="text-gray-600 dark:text-gray-300 hover:text-somali-blue dark:hover:text-blue-400 transition-colors">
            <i className="fas fa-arrow-left fa-lg"></i>
        </button>
        <h1 className="text-2xl font-bold dark:text-white">My Profile</h1>
        <div className="flex-1 text-right">
            {!isEditing && (
                <button onClick={() => setIsEditing(true)} className="text-somali-blue dark:text-blue-400 font-bold text-sm bg-blue-50 dark:bg-blue-500/10 px-3 py-1 rounded-full border border-blue-100 dark:border-blue-500/20">
                    <i className="fas fa-edit mr-1"></i> Edit
                </button>
            )}
        </div>
      </div>

      <div className="flex flex-col items-center mb-8">
        <div className="relative group">
            <Avatar src={currentAvatarUrl} seed={user?.uid} size="xl" className="mb-4 border-4 border-white dark:border-gray-800 shadow-xl" />
            {isEditing && (
                <button 
                    onClick={handleRandomizeAvatar}
                    className="absolute bottom-4 right-0 bg-gray-900 text-white p-2 rounded-full shadow-lg hover:scale-110 transition-transform"
                    title="Randomize Avatar"
                >
                    <i className="fas fa-random"></i>
                </button>
            )}
        </div>

        {isEditing ? (
            <div className="w-full max-w-xs animate__animated animate__fadeIn space-y-3">
                <Input 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter new name"
                    className="text-center font-bold text-lg"
                    autoFocus
                />
                <div className="flex gap-3">
                    <Button fullWidth variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                    <Button fullWidth onClick={handleSaveProfile} isLoading={loading}>Save</Button>
                </div>
            </div>
        ) : (
            <>
                <h2 className="text-2xl font-bold dark:text-white">{profile.name}</h2>
                <p className="text-gray-500 dark:text-gray-400 font-medium">{profile.email}</p>
            </>
        )}
      </div>

      <Card className="mb-6 relative overflow-hidden">
        <div className="flex justify-between items-end mb-2 relative z-10">
            <span className="font-bold text-gray-700 dark:text-gray-300">Level {level}</span>
            <span className="text-somali-blue dark:text-blue-400 font-bold">{profile.points} Total Points</span>
        </div>
        <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-4 overflow-hidden relative z-10 border border-gray-200 dark:border-gray-600">
             <div className="bg-somali-blue h-4 rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
        </div>
        <div className="text-right text-xs text-gray-500 dark:text-gray-400 mt-2 relative z-10">{pointsToNext} pts to Level {level + 1}</div>
      </Card>

      {/* Settings Section */}
      <div className="mb-6">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 ml-2">App Settings</h3>
          <Card className="flex items-center justify-between py-4">
              <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${theme === 'dark' ? 'bg-indigo-900/50 text-indigo-300' : 'bg-orange-100 text-orange-500'}`}>
                      <i className={`fas ${theme === 'dark' ? 'fa-moon' : 'fa-sun'} text-xl`}></i>
                  </div>
                  <div>
                    <div className="font-bold dark:text-white text-lg">Dark Mode</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{theme === 'dark' ? 'On' : 'Off'}</div>
                  </div>
              </div>
              
              <button 
                  onClick={toggleTheme}
                  className={`w-16 h-9 rounded-full p-1 transition-all duration-300 flex items-center shadow-inner ${theme === 'dark' ? 'bg-somali-blue justify-end' : 'bg-gray-300 justify-start'}`}
              >
                  <div className="w-7 h-7 rounded-full bg-white shadow-md transform transition-transform"></div>
              </button>
          </Card>
      </div>

      {!isEditing && (
          <div className="mt-auto mb-8">
            <Button fullWidth variant="danger" onClick={handleLogout}>
                <i className="fas fa-sign-out-alt mr-2"></i> Logout
            </Button>
          </div>
      )}
    </div>
  );
};

export default ProfilePage;