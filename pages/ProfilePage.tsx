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
  const { theme, toggleTheme } = useContext(ThemeContext);
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

  if (!profile) return null;

  const level = Math.floor(profile.points / 100) + 1;
  const progress = profile.points % 100;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 flex flex-col transition-colors">
       <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/')} className="text-gray-600 dark:text-gray-300"><i className="fas fa-arrow-left fa-lg"></i></button>
        <h1 className="text-2xl font-bold dark:text-white">My Profile</h1>
        <div className="flex-1 text-right">
            {!isEditing && (
                <button onClick={() => setIsEditing(true)} className="text-somali-blue font-bold text-sm">
                    <i className="fas fa-edit mr-1"></i> Edit
                </button>
            )}
        </div>
      </div>

      <div className="flex flex-col items-center mb-8">
        <div className="relative">
            <div className={`relative rounded-full bg-gray-100 dark:bg-gray-800 border-4 border-white dark:border-gray-700 shadow-lg overflow-hidden w-32 h-32 mb-4`}>
                <img src={currentAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            {isEditing && (
                <button 
                    onClick={handleRandomizeAvatar}
                    className="absolute bottom-4 right-0 bg-gray-800 text-white p-2 rounded-full shadow-md hover:bg-black transition-colors"
                    title="Randomize Avatar"
                >
                    <i className="fas fa-random"></i>
                </button>
            )}
        </div>

        {isEditing ? (
            <div className="w-full max-w-xs animate__animated animate__fadeIn">
                <Input 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter new name"
                    className="text-center"
                    autoFocus
                />
                <div className="flex gap-2 mt-2">
                    <Button fullWidth variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
                    <Button fullWidth onClick={handleSaveProfile} isLoading={loading}>Save</Button>
                </div>
            </div>
        ) : (
            <>
                <h2 className="text-2xl font-bold dark:text-white">{profile.name}</h2>
                <p className="text-gray-500 dark:text-gray-400">{profile.email}</p>
            </>
        )}
      </div>

      <Card className="mb-6">
        <div className="flex justify-between items-end mb-2">
            <span className="font-bold text-gray-700 dark:text-gray-300">Level {level}</span>
            <span className="text-somali-blue font-bold">{profile.points} Total Points</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
            <div 
                className="bg-somali-blue h-4 rounded-full transition-all duration-1000 ease-out" 
                style={{ width: `${progress}%` }}
            ></div>
        </div>
        <div className="text-right text-xs text-gray-400 mt-1">{100 - progress} pts to next level</div>
      </Card>

      {/* Settings Section */}
      <div className="mb-6">
          <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 ml-1">Settings</h3>
          <Card className="flex items-center justify-between py-4">
              <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${theme === 'dark' ? 'bg-purple-900 text-purple-200' : 'bg-yellow-100 text-yellow-600'}`}>
                      <i className={`fas ${theme === 'dark' ? 'fa-moon' : 'fa-sun'}`}></i>
                  </div>
                  <span className="font-bold">Dark Mode</span>
              </div>
              <button 
                  onClick={toggleTheme}
                  className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${theme === 'dark' ? 'bg-somali-blue' : 'bg-gray-300'}`}
              >
                  <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300 ${theme === 'dark' ? 'translate-x-6' : ''}`}></div>
              </button>
          </Card>
      </div>

      {!isEditing && (
          <div className="mt-auto">
            <Button fullWidth variant="danger" onClick={handleLogout}>
                <i className="fas fa-sign-out-alt mr-2"></i> Logout
            </Button>
          </div>
      )}
    </div>
  );
};

export default ProfilePage;