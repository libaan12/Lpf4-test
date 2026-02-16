
import React, { useState, useContext } from 'react';
import { UserContext } from '../contexts';
import { UserProfile } from '../types';
import { Modal, Avatar, Button, VerificationBadge, Input } from './UI';
import { ref, update, push, serverTimestamp, remove } from 'firebase/database';
import { db } from '../firebase';
import { showToast, showConfirm, showPrompt, showAlert } from '../services/alert';
import { playSound } from '../services/audioService';

interface Props {
    user: UserProfile;
    onClose: () => void;
    actionLabel?: string;
    onAction?: () => void;
}

export const UserProfileModal: React.FC<Props> = ({ user: targetUser, onClose, actionLabel, onAction }) => {
    const { profile: myProfile, user: currentUser } = useContext(UserContext);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [pointsVal, setPointsVal] = useState(String(targetUser.points || 0));

    // --- Role Check ---
    const isSuperAdmin = myProfile?.roles?.superAdmin === true;
    const isSupport = myProfile?.isSupport || myProfile?.roles?.support === true;
    const isAdmin = myProfile?.role === 'admin' || myProfile?.roles?.admin === true;
    
    // Determine View Mode
    const hasAdminAccess = isSuperAdmin || isAdmin || isSupport;
    
    // Admin Specific Permissions
    const canManageRoles = isSuperAdmin && targetUser.uid !== currentUser?.uid;
    const canDelete = isSuperAdmin && targetUser.uid !== currentUser?.uid;
    const canEditPoints = isSuperAdmin || isAdmin;

    const toggleSection = (sec: string) => {
        setExpanded(expanded === sec ? null : sec);
        playSound('click');
    };

    // --- Admin Actions ---

    const safeUpdate = async (path: string, data: any, successMsg?: string) => {
        try {
            await update(ref(db, path), data);
            if (successMsg) showToast(successMsg, "success");
        } catch (e: any) {
            console.error(e);
            if (e.code === 'auth/network-request-failed') {
                showAlert("Connection Error", "Network request failed. Please check your internet connection.", "error");
            } else {
                showToast("Action Failed", "error");
            }
        }
    };

    const handleVerify = async () => {
        await safeUpdate(`users/${targetUser.uid}`, { 
            isVerified: !targetUser.isVerified,
            verificationNotificationPending: !targetUser.isVerified
        }, targetUser.isVerified ? 'Badge Removed' : 'User Verified');
    };

    const handleBan = async () => {
        if (!await showConfirm(targetUser.banned ? "Unban User?" : "Ban User?", "Confirm account status change.")) return;
        await safeUpdate(`users/${targetUser.uid}`, { 
            banned: !targetUser.banned, 
            activeMatch: null 
        }, targetUser.banned ? 'Unbanned' : 'Banned');
    };

    const savePoints = async () => {
        const pts = parseInt(pointsVal);
        if (isNaN(pts)) return;
        await safeUpdate(`users/${targetUser.uid}`, { points: pts }, "Points Updated");
    };

    const toggleRole = async (role: 'admin' | 'support' | 'superAdmin') => {
        if (!isSuperAdmin) return;
        const path = `users/${targetUser.uid}`;
        const updates: any = {};
        
        if (role === 'support') {
            const newVal = !targetUser.isSupport;
            updates[`${path}/isSupport`] = newVal;
            updates[`${path}/roles/support`] = newVal;
        } else if (role === 'admin') {
            const newVal = !targetUser.roles?.admin;
            updates[`${path}/role`] = newVal ? 'admin' : 'user';
            updates[`${path}/roles/admin`] = newVal;
        } else if (role === 'superAdmin') {
            const newVal = !targetUser.roles?.superAdmin;
            updates[`${path}/roles/superAdmin`] = newVal;
        }
        
        await update(ref(db), updates);
        showToast("Role Updated", "success");
    };

    const handleUsername = async () => {
        const val = await showPrompt("Change Username", "Enter new unique ID...");
        if (!val) return;
        const clean = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (clean.length < 3) { showToast("Too short", "error"); return; }
        
        await safeUpdate(`users/${targetUser.uid}`, { username: clean }, "Username Updated");
    };

    const handleResetPass = async () => {
       if(await showConfirm("Reset Credentials?", "Generate new login details and send via chat?")) {
           const newPass = Math.random().toString(36).slice(-8).toUpperCase();
           const participants = [currentUser!.uid, targetUser.uid].sort();
           const chatId = `${participants[0]}_${participants[1]}`;
           
           try {
               const msgRef = push(ref(db, `chats/${chatId}/messages`));
               const updates: any = {};
               updates[`chats/${chatId}/messages/${msgRef.key}`] = {
                   id: msgRef.key, sender: currentUser!.uid, text: "System: Security Update", type: 'credential',
                   newUsername: targetUser.username || targetUser.name.toLowerCase().replace(/\s/g, ''), newPassword: newPass, timestamp: serverTimestamp(), msgStatus: 'sent'
               };
               updates[`chats/${chatId}/participants/${currentUser!.uid}`] = true;
               updates[`chats/${chatId}/participants/${targetUser.uid}`] = true;
               updates[`chats/${chatId}/lastMessage`] = "SECURE_CREDENTIALS";
               updates[`chats/${chatId}/lastTimestamp`] = serverTimestamp();
               updates[`chats/${chatId}/unread/${targetUser.uid}/count`] = 1; 
               
               await update(ref(db), updates);
               showToast("Credentials Sent", "success");
           } catch(e) { showToast("Error sending", "error"); }
       }
    };

    const handleDeleteAccount = async () => {
        if(await showConfirm("DELETE ACCOUNT?", "This is irreversible. Are you sure?", "DELETE", "Cancel", "danger")) {
            try {
                await remove(ref(db, `users/${targetUser.uid}`));
                showToast("Account Deleted", "success");
                onClose();
            } catch(e) { showToast("Delete Failed", "error"); }
        }
    };

    const AccordionItem = ({ id, label, icon, color, children }: any) => (
        <div className="bg-[#0b1120] border border-slate-800 rounded-xl overflow-hidden mb-2 shadow-sm">
            <button 
                onClick={() => toggleSection(id)} 
                className="w-full flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors"
            >
                <span className="text-xs font-black text-slate-300 uppercase tracking-widest flex items-center gap-3">
                    <i className={`fas ${icon} ${color} text-sm`}></i> {label}
                </span>
                <i className={`fas fa-chevron-down text-slate-500 transition-transform duration-300 ${expanded === id ? 'rotate-180' : ''}`}></i>
            </button>
            {expanded === id && (
                <div className="p-4 border-t border-slate-800 bg-slate-900/30 animate__animated animate__fadeIn">
                    {children}
                </div>
            )}
        </div>
    );

    // --- VIEW 1: ADMIN MODE (User Manager) ---
    if (hasAdminAccess) {
        return (
            <Modal isOpen={true} onClose={onClose} title="User Manager">
                {/* Header Summary */}
                <div className="flex flex-col items-center mb-6 pt-2">
                    <div className="relative">
                        <Avatar 
                            src={targetUser.avatar} 
                            seed={targetUser.uid} 
                            size="xl" 
                            isVerified={targetUser.isVerified} 
                            isSupport={targetUser.isSupport} 
                            isOnline={targetUser.isOnline} 
                            className="mb-3 shadow-2xl border-4 border-[#1e293b]" 
                        />
                        {targetUser.banned && <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase border border-red-800">Banned</div>}
                    </div>
                    
                    <h2 className="text-xl font-black text-white text-center flex items-center gap-2">
                        {targetUser.name}
                        {targetUser.roles?.superAdmin && <i className="fas fa-user-astronaut text-purple-500" title="Super Admin"></i>}
                        {targetUser.isSupport && !targetUser.roles?.superAdmin && <i className="fas fa-headset text-orange-500" title="Staff"></i>}
                    </h2>
                    <div className="bg-slate-800 text-slate-400 font-mono text-[10px] px-3 py-1 rounded-full mt-1 border border-slate-700 flex items-center gap-2">
                        <span>ID: {targetUser.uid.substring(0, 8)}...</span>
                        <i className="fas fa-copy cursor-pointer hover:text-white" onClick={() => { navigator.clipboard.writeText(targetUser.uid); showToast("ID Copied"); }}></i>
                    </div>
                </div>

                {/* Manager Controls */}
                <div className="space-y-1">
                    <AccordionItem id="profile" label="Profile & Security" icon="fa-user-lock" color="text-blue-400">
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={handleUsername} className="bg-slate-800 p-3 rounded-xl border border-slate-700 hover:border-blue-500 transition-all flex flex-col items-center gap-1 group">
                                <i className="fas fa-signature text-slate-500 group-hover:text-blue-400"></i>
                                <span className="text-[9px] font-black uppercase text-slate-400">Edit Username</span>
                            </button>
                            <button onClick={handleResetPass} className="bg-slate-800 p-3 rounded-xl border border-slate-700 hover:border-yellow-500 transition-all flex flex-col items-center gap-1 group">
                                <i className="fas fa-key text-slate-500 group-hover:text-yellow-400"></i>
                                <span className="text-[9px] font-black uppercase text-slate-400">Reset Pass</span>
                            </button>
                        </div>
                    </AccordionItem>

                    <AccordionItem id="roles" label="Roles & Privileges" icon="fa-user-shield" color="text-purple-400">
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={handleVerify} className={`py-3 px-3 rounded-xl text-[10px] font-black uppercase border transition-all ${targetUser.isVerified ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                    {targetUser.isVerified ? 'Revoke Badge' : 'Verify User'}
                                </button>
                                <button onClick={handleBan} className={`py-3 px-3 rounded-xl text-[10px] font-black uppercase border transition-all ${targetUser.banned ? 'bg-green-500/20 text-green-400 border-green-500/50' : 'bg-red-500/20 text-red-400 border-red-500/50'}`}>
                                    {targetUser.banned ? 'Unban User' : 'Ban User'}
                                </button>
                            </div>
                            
                            {canManageRoles && (
                                <>
                                    <div className="h-px bg-slate-800 my-2"></div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button onClick={() => toggleRole('support')} className={`py-2 rounded-lg text-[9px] font-black uppercase border transition-all ${targetUser.isSupport ? 'bg-orange-500/20 text-orange-400 border-orange-500/50' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                            Support
                                        </button>
                                        <button onClick={() => toggleRole('admin')} className={`py-2 rounded-lg text-[9px] font-black uppercase border transition-all ${targetUser.roles?.admin ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                            Admin
                                        </button>
                                        <button onClick={() => toggleRole('superAdmin')} className={`py-2 rounded-lg text-[9px] font-black uppercase border transition-all ${targetUser.roles?.superAdmin ? 'bg-purple-500/20 text-purple-400 border-purple-500/50' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                            Super
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </AccordionItem>

                    <AccordionItem id="game" label="Game Data" icon="fa-gamepad" color="text-green-400">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center bg-slate-800 p-3 rounded-xl border border-slate-700">
                                <span className="text-xs font-bold text-slate-400">Total XP</span>
                                <span className="text-xl font-black text-white">{targetUser.points}</span>
                            </div>
                            
                            {canEditPoints && (
                                <div className="flex gap-2">
                                    <Input 
                                        type="number" 
                                        value={pointsVal} 
                                        onChange={e => setPointsVal(e.target.value)} 
                                        className="!bg-slate-800 !border-slate-700 !text-white !mb-0 text-center" 
                                        placeholder="Set Points"
                                    />
                                    <Button size="sm" onClick={savePoints} className="!rounded-xl shadow-none border-none bg-slate-700 hover:bg-green-600"><i className="fas fa-save"></i></Button>
                                </div>
                            )}
                            
                            {targetUser.activeMatch && (
                                <button 
                                    onClick={async () => { await update(ref(db, `users/${targetUser.uid}`), { activeMatch: null }); showToast('Match Cleared'); }}
                                    className="w-full py-3 bg-red-900/20 text-red-400 text-[10px] font-black uppercase rounded-xl border border-red-900/30 hover:bg-red-900/40 transition-colors"
                                >
                                    Force Quit Active Match
                                </button>
                            )}
                        </div>
                    </AccordionItem>

                    <AccordionItem id="activity" label="Activity Log" icon="fa-clock" color="text-cyan-400">
                        <div className="space-y-3 text-xs text-slate-400 font-mono p-1">
                            <div className="flex justify-between border-b border-slate-800 pb-2">
                                <span>Status</span>
                                <span className={targetUser.isOnline ? "text-green-400 font-bold" : "text-slate-500"}>
                                    {targetUser.isOnline ? "Online Now" : "Offline"}
                                </span>
                            </div>
                            <div className="flex justify-between border-b border-slate-800 pb-2">
                                <span>Registered</span>
                                <span>{targetUser.createdAt ? new Date(targetUser.createdAt).toLocaleDateString() : 'Unknown'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Last Seen</span>
                                <span>{targetUser.lastSeen ? new Date(targetUser.lastSeen).toLocaleString() : 'Never'}</span>
                            </div>
                        </div>
                    </AccordionItem>
                </div>

                {/* Footer Buttons */}
                <div className="mt-6 space-y-3">
                    {canDelete && (
                        <button onClick={handleDeleteAccount} className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-red-900/20 transition-all active:scale-95">
                            Delete Account
                        </button>
                    )}
                    
                    <div className="flex gap-3">
                        <Button fullWidth onClick={onClose} variant="secondary" className="!bg-slate-800 !border-slate-700 !text-slate-400 hover:!text-white hover:!bg-slate-700">Close</Button>
                    </div>
                </div>
            </Modal>
        );
    }

    // --- VIEW 2: CLASSIC MODE (Regular Users) ---
    // Simple, clean, no admin tools
    const level = Math.floor((targetUser.points || 0) / 10) + 1;

    return (
        <Modal isOpen={true} onClose={onClose} title="Player Profile">
            <div className="flex flex-col items-center pt-2 pb-6">
                <Avatar 
                    src={targetUser.avatar} 
                    seed={targetUser.uid} 
                    size="xl" 
                    isVerified={targetUser.isVerified} 
                    isSupport={targetUser.isSupport}
                    isOnline={targetUser.isOnline}
                    className="mb-4 shadow-xl border-4 border-white dark:border-slate-700" 
                />
                
                <h2 className="text-2xl font-black text-slate-900 dark:text-white text-center flex items-center gap-2">
                    {targetUser.name}
                    {targetUser.isVerified && <VerificationBadge size="md" className="text-blue-500" />}
                    {targetUser.isSupport && <i className="fas fa-headset text-orange-500 text-lg" title="Support Team"></i>}
                </h2>
                
                <div className="text-slate-400 font-bold font-mono text-xs mt-1 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                    @{targetUser.username || 'guest'}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6 animate__animated animate__fadeIn">
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl text-center border border-slate-100 dark:border-slate-700">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Level</div>
                    <div className="text-2xl font-black text-slate-800 dark:text-white">{level}</div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl text-center border border-slate-100 dark:border-slate-700">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">XP Points</div>
                    <div className="text-2xl font-black text-game-primary">{targetUser.points || 0}</div>
                </div>
            </div>

            {targetUser.banned && (
                <div className="mb-6 text-center bg-red-100 dark:bg-red-900/20 p-2 rounded-lg">
                    <span className="text-xs font-black text-red-500 uppercase tracking-widest">Account Suspended</span>
                </div>
            )}

            <div className="flex gap-3">
                {onAction && actionLabel ? (
                    <Button fullWidth onClick={onAction} className="shadow-lg shadow-game-primary/20">{actionLabel}</Button>
                ) : (
                     <Button fullWidth onClick={onClose} variant="secondary">Close</Button>
                )}
            </div>
        </Modal>
    );
};
