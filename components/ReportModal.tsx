
import React, { useState, useContext } from 'react';
import { Modal, Button } from './UI';
import { push, ref, set, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { showToast } from '../services/alert';
import { Question } from '../types';

interface Props {
    question: Question;
    chapterId: string;
    onClose: () => void;
}

export const ReportModal: React.FC<Props> = ({ question, chapterId, onClose }) => {
    const { user } = useContext(UserContext);
    const [category, setCategory] = useState('Wrong Answer / Jawaab Qaldan');
    const [details, setDetails] = useState('');
    const [loading, setLoading] = useState(false);

    const categories = [
        "Wrong Answer / Jawaab Qaldan",
        "Typo or Spelling / Qoraal Qaldan",
        "Question Unclear / Su'aal aan fahneyn",
        "Duplicate Question / Su'aal soo noqnoqotay",
        "Other / Kale"
    ];

    const handleSubmit = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const reportRef = push(ref(db, 'reports'));
            await set(reportRef, {
                id: reportRef.key,
                questionId: question.id,
                chapterId: chapterId || 'unknown',
                category: category,
                reason: details,
                reporterUid: user.uid,
                timestamp: serverTimestamp(),
                questionText: question.question
            });
            showToast("Report Sent / Waad Mahadsantahay!", "success");
            onClose();
        } catch (e) {
            showToast("Error sending report", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={true} title="Report Issue" onClose={onClose}>
            <div className="space-y-4">
                <div className="bg-slate-100 dark:bg-slate-900 p-3 rounded-xl">
                    <p className="text-xs text-slate-500 font-bold uppercase mb-1">Question</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-white line-clamp-2">{question.question}</p>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Category</label>
                    <div className="relative">
                        <select 
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full p-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-800 dark:text-white appearance-none outline-none focus:border-game-primary"
                        >
                            {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                        <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"></i>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Details (Optional)</label>
                    <textarea 
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                        placeholder="Explain the issue..."
                        className="w-full p-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-medium text-slate-800 dark:text-white outline-none focus:border-game-primary h-24 resize-none"
                    />
                </div>

                <div className="flex gap-3 pt-2">
                    <Button variant="secondary" fullWidth onClick={onClose}>Cancel</Button>
                    <Button fullWidth onClick={handleSubmit} isLoading={loading}>Submit Report</Button>
                </div>
            </div>
        </Modal>
    );
};
