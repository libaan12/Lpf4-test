
import React, { useState, useContext } from 'react';
import { ref, update, get, push, serverTimestamp, increment } from 'firebase/database';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { UserContext } from '../contexts';
import { showToast, showConfirm, showPrompt } from '../services/alert';
import { playSound } from '../services/audioService';

interface Props {
    targetUser: UserProfile;
}

export const SupportActionPanel: React.FC<Props> = ({ targetUser }) => {
    const { user: currentStaff } = useContext(UserContext);
    const [pointsMode, setPointsMode] = useState(false);
    const [newPoints, setNewPoints] = useState(targetUser.points?.toString() || '0');

    const handleVerify = async () => {
        try {
            await update(ref(db, `users/${targetUser.uid}`), { 
                isVerified: !targetUser.isVerified,
                verificationNotificationPending: !targetUser.isVerified
            });
            showToast(targetUser.isVerified ? 'Verification Removed' : 'User Verified');
        } catch (e) { showToast("Error", "error"); }
    };

    const handleBan = async () => {
        const confirm = await showConfirm(
            targetUser.banned ? "Unban User?" : "Ban User?", 
            targetUser.banned ? "Restore access?" : "User will be logged out immediately."
        );
        if (!confirm) return;
        
        try {
            await update(ref(db, `users/${targetUser.uid}`), { 
                banned: !targetUser.banned,
                activeMatch: !targetUser.banned ? null : targetUser.activeMatch
            });
            showToast(targetUser.banned ? 'User Unbanned' : 'User Banned');
        } catch (e) { showToast("Error", "error"); }
    };

    const handleSavePoints = async () => {
        const pts = parseInt(newPoints);
        if (isNaN(pts)) return;
        try {
            await update(ref(db, `users/${targetUser.uid}`), { points: pts });
            setPointsMode(false);
            showToast("Points Updated");
        } catch(e) { showToast("Error", "error"); }
    };

    const handleChangeUsername = async () => {
        if (!currentStaff) return;
        
        const username = await showPrompt("New Username", "Enter unique username...");

        if (!username) return;
        const clean = username.toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (clean.length < 3) {
            showToast("Too short", "error");
            return;
        }

        // Check uniqueness
        const snapshot = await get(ref(db, 'users'));
        const exists = Object.values(snapshot.val() || {}).some((u: any) => u.username === clean);
        if (exists) {
            showToast("Username taken", "error");
            return;
        }

        try {
            await update(ref(db, `users/${targetUser.uid}`), { username: clean });
            await sendCredentialNotification(targetUser.uid, clean, null);
            showToast("Username Updated & Notified");
        } catch (e) { showToast("Sync failed", "error"); }
    };

    const handleResetPassword = async () => {
        if (!currentStaff) return;
        const confirm = await showConfirm("Reset Password?", "This will generate a new password and send it to the user's inbox.");
        if (!confirm) return;

        // Simulate secure password generation
        const newPass = Math.random().toString(36).slice(-8).toUpperCase() + Math.floor(Math.random() * 999);

        try {
            // Note: Since client SDK can't reset other users' Auth passwords, 
            // we simulate this by notifying them. In a real app, this would trigger a Cloud Function.
            await sendCredentialNotification(targetUser.uid, targetUser.username || '', newPass);
            showToast("Password Sent to User");
        } catch (e) { showToast("Action failed", "error"); }
    };

    const sendCredentialNotification = async (targetUid: string, username: string, password: string | null) => {
        if (!currentStaff) return;
        const participants = [currentStaff.uid, targetUid].sort();
        const chatId = `${participants[0]}_${participants[1]}`;
        
        const msgRef = push(ref(db, `chats/${chatId}/messages`));
        const msgId = msgRef.key!;
        
        const msgData = {
            id: msgId,
            sender: currentStaff.uid,
            text: "Your account credentials have been updated by Support.",
            type: 'credential',
            newUsername: username,
            newPassword: password || undefined,
            timestamp: serverTimestamp(),
            msgStatus: 'sent'
        };

        const updates: any = {};
        updates[`chats/${chatId}/messages/${msgId}`] = msgData;
        updates[`chats/${chatId}/lastMessage`] = "CREDENTIAL_UPDATE";
        updates[`chats/${chatId}/lastTimestamp`] = serverTimestamp();
        updates[`chats/${chatId}/lastMessageSender`] = currentStaff.uid;
        updates[`chats/${chatId}/unread/${targetUid}/count`] = increment(1);
        updates[`chats/${chatId}/participants/${currentStaff.uid}`] = true;
        updates[`chats/${chatId}/participants/${targetUid}`] = true;

        await update(ref(db), updates);
        playSound('sent');
    };

    return (
        <div className="mt-4 p-4 bg-slate-100 dark:bg-slate-200 rounded-2xl border-2 border-orange-200 dark:border-orange-900/50 w-full animate__animated animate__fadeIn">
            <div className="flex items-center gap-2 mb-4">
                <i className="fas fa-shield-alt text-game-primary"></i>
                <h4 className="font-black text-xs uppercase text-slate-500 tracking-wider">Support Actions</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-3 mb-3">
                <button onClick={handleChangeUsername} className="bg-slate-50 dark:bg-slate-100 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-300 hover:border-game-primary transition-all flex flex-col items-center gap-2">
                    <i className="fas fa-id-badge text-game-primary"></i>
                    Edit Username
                </button>
                <button onClick={handleResetPassword} className="bg-slate-50 dark:bg-slate-100 p-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase text-slate-600 dark:text-slate-300 hover:border-game-primary transition-all flex flex-col items-center gap-2">
                    <i className="fas fa-key text-game-primary"></i>
                    Reset Pass
                </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <button 
                    onClick={handleVerify}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${targetUser.isVerified ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}
                >
                    {targetUser.isVerified ? 'Unverify' : 'Verify'}
                </button>
                
                <button 
                    onClick={handleBan}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${targetUser.banned ? 'bg-green-50 text-green-600 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}
                >
                    {targetUser.banned ? 'Unban' : 'Ban'}
                </button>

                {pointsMode ? (
                    <div className="col-span-2 flex gap-2 mt-2">
                        <input 
                            type="number" 
                            value={newPoints}
                            onChange={(e) => setNewPoints(e.target.value)}
                            className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-100"
                        />
                        <button onClick={handleSavePoints} className="bg-green-500 text-white px-3 rounded-lg"><i className="fas fa-check"></i></button>
                        <button onClick={() => setPointsMode(false)} className="bg-gray-300 text-gray-700 px-3 rounded-lg"><i className="fas fa-times"></i></button>
                    </div>
                ) : (
                    <button 
                        onClick={() => setPointsMode(true)}
                        className="col-span-2 mt-2 px-3 py-2 rounded-xl text-xs font-bold bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100"
                    >
                        Adjust Points
                    </button>
                )}
            </div>
        </div>
    );
};
