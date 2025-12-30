
import React, { useContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut, updateProfile } from 'firebase/auth';
import { ref, update, get } from 'firebase/database';
import { auth, db } from '../firebase';
import { UserContext, ThemeContext } from '../contexts';
import { Avatar, Button, Card, Input, Modal } from '../components/UI';
import { playSound } from '../services/audioService';
import { generateAvatarUrl } from '../constants';
import { showToast, showAlert } from '../services/alert';

const ProfilePage: React.FC = () => {
  const { profile, user } = useContext(UserContext);
  const { theme, setTheme } = useContext(ThemeContext);
  const navigate = useNavigate();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [currentAvatarUrl, setCurrentAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Avatar Selection State
  const [showAvatarSelector, setShowAvatarSelector] = useState(false);
  const [randomAvatars, setRandomAvatars] = useState<string[]>([]);
  
  // Custom Upload
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Username prompt state
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [newUsername, setNewUsername] = useState('');

  useEffect(() => {
    if (profile) {
      setEditName(profile.name);
      setCurrentAvatarUrl(profile.avatar);
      // Strictly prevent prompt if guest using robust check
      // Guests from AuthPage have 'isGuest: true'.
      if (!profile.username && !profile.isGuest) {
          setShowUsernamePrompt(true);
      }
    }
  }, [profile]);

  useEffect(() => {
      if (showAvatarSelector) {
          // Generate 9 random seeds
          const seeds = Array.from({length: 9}, () => Math.random().toString(36).substring(7));
          setRandomAvatars(seeds);
      }
  }, [showAvatarSelector]);

  const handleLogout = () => {
    playSound('click');
    signOut(auth);
    navigate('/auth');
  };

  const selectAvatar = (seed: string) => {
    const url = generateAvatarUrl(seed);
    setCurrentAvatarUrl(url);
    setShowAvatarSelector(false);
    playSound('click');
    // If we are not in edit mode, auto-save the avatar change immediately
    if (!isEditing) {
        handleSaveAvatarOnly(url);
    }
  };

  const handleSaveAvatarOnly = async (url: string) => {
      if (!user) return;
      try {
          await update(ref(db, `users/${user.uid}`), { avatar: url });
          playSound('correct');
      } catch (e) {
          console.error("Error saving avatar", e);
      }
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
        avatar: currentAvatarUrl,
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

  const handleSetUsername = async () => {
      if (!user || !newUsername.trim()) return;
      setLoading(true);
      const clean = newUsername.toLowerCase().replace(/[^a-z0-9_]/g, '');
      
      if (clean.length < 3) {
          showToast("Username too short", "error");
          setLoading(false);
          return;
      }

      // Check uniqueness via client-side filter
      const snapshot = await get(ref(db, 'users'));
      let exists = false;
      if (snapshot.exists()) {
          const users = snapshot.val();
          exists = Object.values(users).some((u: any) => (u.username || '').toLowerCase() === clean);
      }
      
      if (exists) {
           showToast("Username taken", "error");
           setLoading(false);
           return;
      }

      try {
          await update(ref(db, `users/${user.uid}`), { username: clean });
          setShowUsernamePrompt(false);
          showToast("Username set!", "success");
      } catch (e) {
          showAlert("Error", "Failed to set username", "error");
      } finally {
          setLoading(false);
      }
  };

  // Image Upload Handler
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
              // Resize logic to prevent DB bloat
              const canvas = document.createElement('canvas');
              const MAX_WIDTH = 300;
              const MAX_HEIGHT = 300;
              let width = img.width;
              let height = img.height;

              if (width > height) {
                  if (width > MAX_WIDTH) {
                      height *= MAX_WIDTH / width;
                      width = MAX_WIDTH;
                  }
              } else {
                  if (height > MAX_HEIGHT) {
                      width *= MAX_HEIGHT / height;
                      height = MAX_HEIGHT;
                  }
              }

              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
              setCurrentAvatarUrl(dataUrl);
              setShowAvatarSelector(false);
              
              if (!isEditing) {
                  handleSaveAvatarOnly(dataUrl);
              }
          };
          img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
  };

  const triggerFileUpload = () => {
      fileInputRef.current?.click();
  };

  if (!profile) return null;

  const currentPoints = profile.points || 0;
  const level = Math.floor(currentPoints / 10) + 1;
  const pointsInCurrentLevel = currentPoints % 10;
  const progressPercent = (pointsInCurrentLevel / 10) * 100;
  const pointsToNext = 10 - pointsInCurrentLevel;

  return (
    <div className="min-h-full p-4 flex flex-col transition-colors max-w-3xl mx-auto w-full pb-24 pt-24">
       <style>
           {`
             @keyframes progress-bar-stripes {
               from { background-position: 1rem 0; }
               to { background-position: 0 0; }
             }
           `}
       </style>
       <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 shadow-sm flex items-center gap-4 px-4 py-3 transition-colors duration-300">
        <button onClick={() => navigate('/')} className="text-gray-900 dark:text-gray-100 hover:text-game-primary dark:hover:text-blue-400 transition-colors">
            <i className="fas fa-arrow-left fa-lg"></i>
        </button>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">My Profile</h1>
        <div className="flex-1 text-right">
            {!isEditing && (
                <button onClick={() => setIsEditing(true)} className="font-bold text-sm px-3 py-1 rounded-full border transition-all text-game-primary dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/20">
                    <i className="fas fa-edit mr-1"></i> Edit
                </button>
            )}
        </div>
      </div>

      <div className="flex flex-col items-center mb-8">
        <div className="relative group">
            <Avatar 
                src={currentAvatarUrl} 
                seed={user?.uid} 
                size="xl" 
                isVerified={profile.isVerified}
                className="mb-4 border-4 border-white dark:border-gray-800 shadow-xl cursor-pointer hover:opacity-90 transition-opacity" 
                onClick={() => setShowAvatarSelector(true)}
            />
            <button 
                onClick={() => setShowAvatarSelector(true)}
                className="absolute bottom-4 right-0 bg-game-primary text-white p-2.5 rounded-full shadow-lg hover:scale-110 transition-transform border-2 border-white dark:border-gray-800"
                title="Choose Avatar"
            >
                <i className="fas fa-camera"></i>
            </button>
        </div>

        {isEditing ? (
            <div className="w-full max-w-xs animate__animated animate__fadeIn space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-800 dark:text-gray-200 mb-1 ml-1">Display Name</label>
                    <Input 
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Enter new name"
                        className="text-center font-bold text-lg"
                        autoFocus
                    />
                </div>

                <div className="flex gap-3 pt-2">
                    <Button fullWidth variant="secondary" onClick={() => { setIsEditing(false); setEditName(profile.name); setCurrentAvatarUrl(profile.avatar); }}>Cancel</Button>
                    <Button fullWidth onClick={handleSaveProfile} isLoading={loading}>Save</Button>
                </div>
            </div>
        ) : (
            <>
                <h2 
                    onClick={() => setIsEditing(true)}
                    className="text-2xl font-black text-gray-900 dark:text-white cursor-pointer hover:text-game-primary transition-colors flex items-center justify-center gap-2 group"
                    title="Click to edit name"
                >
                    {profile.name}
                    {profile.isVerified && <i className="fas fa-check-circle text-blue-500 text-lg" title="Verified"></i>}
                    <i className="fas fa-pencil-alt text-xs opacity-0 group-hover:opacity-100 transition-opacity text-game-primary"></i>
                </h2>
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300 font-bold font-mono bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full mt-2">
                    @{profile.username || 'unknown'}
                </div>
            </>
        )}
      </div>

      {/* Avatar Selection Modal */}
      <Modal isOpen={showAvatarSelector} title="Choose Avatar" onClose={() => setShowAvatarSelector(false)}>
          <div className="text-center mb-4">
              {profile.allowCustomAvatar && (
                  <div className="mb-6">
                      <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          accept="image/*" 
                          onChange={handleImageUpload}
                      />
                      <Button fullWidth onClick={triggerFileUpload} className="shadow-lg bg-indigo-600 border-indigo-800 hover:bg-indigo-700">
                          <i className="fas fa-upload mr-2"></i> Upload from Gallery
                      </Button>
                      <p className="text-xs text-gray-400 mt-2">Upload a profile picture (max 300px)</p>
                  </div>
              )}
              
              <div className="grid grid-cols-3 gap-4">
                  {randomAvatars.map((seed, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => selectAvatar(seed)}
                        className="aspect-square rounded-full overflow-hidden border-2 border-transparent hover:border-game-primary cursor-pointer transition-all hover:scale-110 bg-gray-100 dark:bg-gray-800"
                      >
                          <img src={generateAvatarUrl(seed)} alt="avatar" className="w-full h-full object-cover" />
                      </div>
                  ))}
              </div>
              <Button fullWidth variant="secondary" className="mt-6" onClick={() => setRandomAvatars(Array.from({length: 9}, () => Math.random().toString(36).substring(7)))}>
                 <i className="fas fa-sync mr-2"></i> Randomize
              </Button>
          </div>
      </Modal>
      
      {/* Username Modal */}
      <Modal isOpen={showUsernamePrompt} title="Set Username">
          <div className="space-y-4">
              <p className="text-sm text-gray-500 text-center">You need a unique username to use social features.</p>
              <Input 
                  placeholder="Username" 
                  value={newUsername} 
                  onChange={e => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="text-center font-bold"
              />
              <Button fullWidth onClick={handleSetUsername} isLoading={loading}>Save Username</Button>
          </div>
      </Modal>

      {/* Live Level Progress Card */}
      <Card className="mb-6 relative overflow-hidden bg-white dark:bg-slate-800 !p-6">
        <div className="flex justify-between items-end mb-4 relative z-10">
            <div>
                <span className="block text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Current Rank</span>
                <span className="font-black text-2xl text-gray-900 dark:text-white">Level {level}</span>
            </div>
            <div className="text-right">
                 <span className="block text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Total Score</span>
                 <span className="font-black text-2xl text-game-primary dark:text-orange-400">{currentPoints} XP</span>
            </div>
        </div>
        
        {/* Redesigned "Real" Progress Bar */}
        <div className="relative w-full h-6 bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden shadow-inner border border-slate-200 dark:border-slate-700">
            {/* Background Stripes */}
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(45deg, #000 25%, transparent 25%, transparent 50%, #000 50%, #000 75%, transparent 75%, transparent)', backgroundSize: '1rem 1rem' }}></div>
            
            {/* Active Bar */}
            <div 
                className="h-full bg-gradient-to-r from-orange-500 to-red-500 relative transition-all duration-1000 ease-out flex items-center justify-end pr-2"
                style={{ width: `${progressPercent}%` }}
            >
                {/* Glow at tip */}
                <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/50 blur-[2px]"></div>
                {/* Animated Stripes on Bar */}
                <div className="absolute inset-0 w-full h-full animate-[progress-bar-stripes_1s_linear_infinite]" 
                     style={{ 
                         backgroundImage: 'linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent)', 
                         backgroundSize: '1rem 1rem' 
                     }}
                ></div>
            </div>
        </div>
        
        <div className="flex justify-between mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <span>0 XP</span>
            <span className="text-game-primary">{pointsInCurrentLevel} / 10 XP</span>
            <span>10 XP</span>
        </div>
        
        <div className="text-center mt-4">
            <span className="inline-block bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-3 py-1 rounded-full text-xs font-bold">
                {pointsToNext} XP to Level {level + 1}
            </span>
        </div>
      </Card>

      {/* Settings Section */}
      <div className="mb-6">
          <h3 className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-widest mb-3 ml-2">App Settings</h3>
          <Card className="flex flex-col gap-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${theme === 'dark' ? 'bg-indigo-900/50 text-indigo-300' : 'bg-orange-100 text-orange-500'}`}>
                        <i className={`fas ${theme === 'dark' ? 'fa-moon' : 'fa-sun'} text-xl`}></i>
                    </div>
                    <div>
                        <div className="font-bold text-gray-900 dark:text-white text-lg">Dark Mode</div>
                        <div className="text-xs text-gray-700 dark:text-gray-300 font-bold">{theme === 'dark' ? 'On' : 'Off'}</div>
                    </div>
                </div>
                
                <button 
                    onClick={toggleTheme}
                    className={`w-16 h-9 rounded-full p-1 transition-all duration-300 flex items-center shadow-inner ${theme === 'dark' ? 'bg-game-primary justify-end' : 'bg-gray-300 justify-start'}`}
                >
                    <div className="w-7 h-7 rounded-full bg-white shadow-md transform transition-transform"></div>
                </button>
              </div>

              {!isEditing && (
                <>
                    <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                    <button 
                        onClick={handleLogout}
                        className="flex items-center gap-4 w-full text-left group"
                    >
                         <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center group-hover:bg-red-200 dark:group-hover:bg-red-900/50 transition-colors">
                            <i className="fas fa-sign-out-alt text-xl"></i>
                         </div>
                         <div>
                            <div className="font-bold text-red-600 dark:text-red-400 text-lg">Log Out</div>
                            <div className="text-xs text-red-400 dark:text-red-300/70 font-bold">Sign out of your account</div>
                         </div>
                    </button>
                </>
              )}
          </Card>
      </div>
    </div>
  );
};

export default ProfilePage;