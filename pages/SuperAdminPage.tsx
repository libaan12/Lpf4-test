import React, { useState, useEffect } from 'react';
import { ref, update, onValue, off, set, remove, get } from 'firebase/database';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { Button, Card, Input, Modal, Avatar } from '../components/UI';
import { showAlert, showToast, showConfirm } from '../services/alert';

const SuperAdminPage: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  
  // User Management Modal
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  
  // Settings State
  const [aiEnabled, setAiEnabled] = useState(true);

  useEffect(() => {
    if (isAuthenticated) {
        setLoading(true);
        const userRef = ref(db, 'users');
        const handleData = (snap: any) => {
            if (snap.exists()) {
                const data = snap.val();
                const list: UserProfile[] = Object.keys(data).map(key => ({ uid: key, ...data[key] }));
                setUsers(list);
            } else { setUsers([]); }
            setLoading(false);
        };
        const unsubscribe = onValue(userRef, handleData);

        // Listen for AI Settings
        const settingsRef = ref(db, 'settings/aiAssistantEnabled');
        const handleSettings = (snap: any) => {
             setAiEnabled(snap.exists() ? snap.val() : true);
        };
        const unsubSettings = onValue(settingsRef, handleSettings);

        return () => {
            off(userRef, 'value', handleData);
            off(settingsRef, 'value', handleSettings);
        }
    }
  }, [isAuthenticated]);

  const checkPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1234') { setIsAuthenticated(true); } else {
        showAlert('Access Denied', 'Incorrect PIN', 'error');
    }
  };

  const toggleRole = async (uid: string, currentRole?: string) => {
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      try {
        await update(ref(db, `users/${uid}`), { role: newRole });
        showToast(`User is now ${newRole}`, 'success');
        if (selectedUser && selectedUser.uid === uid) {
            setSelectedUser({ ...selectedUser, role: newRole as 'admin' | 'user' });
        }
      } catch (e) {
        showAlert('Error', 'Failed to update role', 'error');
      }
  };

  const toggleBan = async (uid: string, currentBanStatus?: boolean) => {
      const newStatus = !currentBanStatus;
      const action = newStatus ? 'Banned' : 'Unbanned';
      
      const confirmed = await showConfirm(
          `${action} User?`, 
          `Are you sure you want to ${newStatus ? 'BAN' : 'UNBAN'} this user? They will ${newStatus ? 'lose access immediately' : 'regain access'}.`
      );

      if (!confirmed) return;

      try {
          await update(ref(db, `users/${uid}`), { banned: newStatus });
          // If banning, also clear active match
          if (newStatus) {
              await update(ref(db, `users/${uid}`), { activeMatch: null });
          }
          showToast(`User ${action}`, 'success');
          if (selectedUser && selectedUser.uid === uid) {
              setSelectedUser({ ...selectedUser, banned: newStatus });
          }
      } catch (e) {
          showAlert('Error', `Failed to ${action} user`, 'error');
      }
  };

  const deleteUser = async (uid: string) => {
      const confirmed = await showConfirm(
          "Delete User Permanently?", 
          "This action cannot be undone. All user data (profile, points, history) will be wiped from the database.",
          "warning"
      );
      
      if (!confirmed) return;

      try {
          // 1. Check for active match and clean it up
          const userSnap = await get(ref(db, `users/${uid}`));
          if (userSnap.exists()) {
              const userData = userSnap.val();
              if (userData.activeMatch) {
                   // Remove player from the match so game logic handles disconnect/forfeit correctly
                   await remove(ref(db, `matches/${userData.activeMatch}/players/${uid}`));
              }
          }

          // 2. Delete User Record from Database
          await remove(ref(db, `users/${uid}`));
          
          setSelectedUser(null);
          showAlert('Deleted', 'User record deleted from database.', 'success');
      } catch (e) {
          console.error(e);
          showAlert('Error', 'Failed to delete user data.', 'error');
      }
  };

  const toggleAiFeature = async () => {
    try {
        await set(ref(db, 'settings/aiAssistantEnabled'), !aiEnabled);
        showToast(!aiEnabled ? 'AI Enabled' : 'AI Disabled', 'success');
    } catch (e) {
        console.error(e);
    }
  };

  if (!isAuthenticated) {
      return (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4 transition-colors">
              <Card className="w-full max-w-md bg-white dark:bg-gray-800 border-none shadow-2xl">
                  <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-200 dark:border-red-500/30">
                          <i className="fas fa-user-shield text-3xl text-red-500"></i>
                      </div>
                      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-1">Restricted Access</h1>
                      <p className="text-gray-500 dark:text-gray-400 text-sm">Super Admin Dashboard</p>
                  </div>
                  <form onSubmit={checkPin}>
                      <Input 
                        type="password" 
                        placeholder="Security PIN" 
                        value={pin} 
                        onChange={e => setPin(e.target.value)}
                        className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                        autoFocus
                      />
                      <Button fullWidth variant="danger" className="mt-4 shadow-red-500/30">Unlock System</Button>
                  </form>
              </Card>
          </div>
      );
  }

  return (
    <div className="min-h-full bg-gray-100 dark:bg-gray-900 p-4 absolute inset-0 overflow-y-auto transition-colors">
        <div className="max-w-6xl mx-auto pb-12">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-white">User Management</h1>
                    <p className="text-gray-500 dark:text-gray-400">Manage roles, bans, and system settings</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => window.location.reload()} variant="secondary" className="opacity-80">
                        <i className="fas fa-sync mr-2"></i> Refresh
                    </Button>
                </div>
            </div>

            {/* System Control Card */}
            <Card className="mb-8 border-l-4 border-indigo-500">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                            <i className="fas fa-robot text-xl"></i>
                        </div>
                        <div>
                            <h3 className="text-lg font-bold dark:text-white">AI Assistant</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Global Switch for Gemini AI</p>
                        </div>
                    </div>
                    <button 
                        onClick={toggleAiFeature}
                        className={`
                            relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2  focus-visible:ring-white/75
                            ${aiEnabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}
                        `}
                    >
                        <span className="sr-only">Use setting</span>
                        <span
                            aria-hidden="true"
                            className={`
                                pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out
                                ${aiEnabled ? 'translate-x-6' : 'translate-x-0'}
                            `}
                        />
                    </button>
                </div>
            </Card>
            
            <Card className="!bg-white dark:!bg-gray-800 overflow-hidden shadow-lg border-0 p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                                <th className="p-4 pl-6">User</th>
                                <th className="p-4">Stats</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right pr-6">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {users.map(u => (
                                <tr key={u.uid} className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${u.banned ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                                    <td className="p-4 pl-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                                <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                                    {u.name}
                                                    {u.role === 'admin' && <i className="fas fa-shield-alt text-somali-blue text-xs" title="Admin"></i>}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col">
                                            <span className="font-mono font-bold text-somali-blue dark:text-blue-400">{u.points} pts</span>
                                            <span className="text-[10px] text-gray-400 uppercase">LVL {Math.floor(u.points / 10) + 1}</span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        {u.banned ? (
                                            <span className="px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-600 border border-red-200">BANNED</span>
                                        ) : (
                                            <span className="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-600 border border-green-200">ACTIVE</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right pr-6">
                                        <Button size="sm" onClick={() => setSelectedUser(u)} variant="secondary">
                                            View
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>

        {/* User Detail Modal */}
        {selectedUser && (
            <Modal isOpen={true} title="User Control" onClose={() => setSelectedUser(null)}>
                <div className="flex flex-col items-center mb-6">
                    <div className="relative">
                        <Avatar src={selectedUser.avatar} seed={selectedUser.uid} size="xl" className="border-4 border-white dark:border-gray-700 shadow-xl" />
                        {selectedUser.banned && (
                            <div className="absolute inset-0 bg-red-500/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                                <i className="fas fa-ban text-4xl text-white"></i>
                            </div>
                        )}
                    </div>
                    <h2 className="text-2xl font-black mt-4 dark:text-white">{selectedUser.name}</h2>
                    <p className="text-gray-500 dark:text-gray-400 font-mono text-xs mb-1">{selectedUser.uid}</p>
                    <p className="text-gray-600 dark:text-gray-300 font-bold">{selectedUser.email}</p>
                    
                    <div className="grid grid-cols-2 gap-4 w-full mt-6">
                        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl text-center">
                            <div className="text-xs text-gray-400 uppercase font-bold">Points</div>
                            <div className="text-xl font-black text-somali-blue dark:text-blue-400">{selectedUser.points}</div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl text-center">
                            <div className="text-xs text-gray-400 uppercase font-bold">Role</div>
                            <div className="text-xl font-black text-gray-800 dark:text-white uppercase">{selectedUser.role || 'User'}</div>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <Button 
                        fullWidth 
                        onClick={() => toggleRole(selectedUser.uid, selectedUser.role)} 
                        variant={selectedUser.role === 'admin' ? 'secondary' : 'primary'}
                    >
                        <i className={`fas ${selectedUser.role === 'admin' ? 'fa-user-minus' : 'fa-user-shield'} mr-2`}></i>
                        {selectedUser.role === 'admin' ? 'Revoke Admin Access' : 'Grant Admin Access'}
                    </Button>
                    
                    <Button 
                        fullWidth 
                        onClick={() => toggleBan(selectedUser.uid, selectedUser.banned)} 
                        className={selectedUser.banned ? "bg-green-600 hover:bg-green-700 border-green-800" : "bg-orange-500 hover:bg-orange-600 border-orange-700"}
                    >
                        <i className={`fas ${selectedUser.banned ? 'fa-check' : 'fa-ban'} mr-2`}></i>
                        {selectedUser.banned ? 'Unban User' : 'Ban User (Prevent Login)'}
                    </Button>
                    
                    <div className="border-t border-gray-200 dark:border-gray-700 my-4"></div>
                    
                    <Button 
                        fullWidth 
                        onClick={() => deleteUser(selectedUser.uid)} 
                        variant="danger"
                    >
                        <i className="fas fa-trash-alt mr-2"></i> Permanently Delete Data
                    </Button>
                </div>
            </Modal>
        )}
    </div>
  );
};

export default SuperAdminPage;