import React, { useState, useEffect } from 'react';
import { ref, update, onValue, off } from 'firebase/database';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { Button, Card, Input } from '../components/UI';
import Swal from 'sweetalert2';

const SuperAdminPage: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

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
        return () => off(userRef, 'value', handleData);
    }
  }, [isAuthenticated]);

  const checkPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1234') { setIsAuthenticated(true); } else {
        const isDark = document.documentElement.classList.contains('dark');
        Swal.fire({
            icon: 'error',
            title: 'Access Denied', 
            text: 'Incorrect PIN',
            background: isDark ? '#1e293b' : '#fff',
            color: isDark ? '#fff' : '#000'
        });
    }
  };

  const toggleRole = async (uid: string, currentRole?: string) => {
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      try {
        await update(ref(db, `users/${uid}`), { role: newRole });
        const isDark = document.documentElement.classList.contains('dark');
        Swal.fire({
            icon: 'success',
            title: 'Success',
            text: `User is now ${newRole}`,
            toast: true,
            position: 'top-end',
            timer: 2000,
            showConfirmButton: false,
            background: isDark ? '#1e293b' : '#fff',
            color: isDark ? '#fff' : '#000'
        });
      } catch (e) {
        Swal.fire('Error', 'Failed to update role', 'error');
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
                    <p className="text-gray-500 dark:text-gray-400">Manage roles and permissions</p>
                </div>
                <Button onClick={() => {}} isLoading={loading} variant="secondary" className="opacity-50 cursor-default bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    <i className="fas fa-satellite-dish mr-2"></i> Realtime
                </Button>
            </div>
            
            <Card className="!bg-white dark:!bg-gray-800 overflow-hidden shadow-lg border-0 p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                                <th className="p-4 pl-6">User</th>
                                <th className="p-4">Stats</th>
                                <th className="p-4">Role</th>
                                <th className="p-4 text-right pr-6">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {users.map(u => (
                                <tr key={u.uid} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                    <td className="p-4 pl-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                                <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-800 dark:text-white">{u.name}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className="font-mono font-bold text-somali-blue dark:text-blue-400">{u.points}</span> <span className="text-gray-500 dark:text-gray-400 text-sm">pts</span>
                                    </td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold border ${
                                            u.role === 'admin' 
                                            ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800' 
                                            : 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-900/50 dark:text-gray-400 dark:border-gray-700'
                                        }`}>
                                            {u.role || 'user'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right pr-6">
                                        <button 
                                            onClick={() => toggleRole(u.uid, u.role)}
                                            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors border ${
                                                u.role === 'admin' 
                                                ? 'bg-white border-red-200 text-red-600 hover:bg-red-50 dark:bg-transparent dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-900/20' 
                                                : 'bg-somali-blue text-white border-transparent hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500'
                                            }`}
                                        >
                                            {u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    </div>
  );
};

export default SuperAdminPage;