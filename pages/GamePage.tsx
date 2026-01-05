
import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, onDisconnect, get, set, remove, serverTimestamp, push, onChildAdded } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { POINTS_PER_QUESTION } from '../constants';
import { MatchState, Question, Chapter, UserProfile, MatchReaction } from '../types';
import { Avatar, Button, Card, Modal } from '../components/UI';
import { playSound } from '../services/audioService';
import { showToast, showConfirm, showAlert } from '../services/alert';
import confetti from 'canvas-confetti';
import Swal from 'sweetalert2';

const DEFAULT_EMOJIS = ['😂', '😡', '👏', '😱', '🥲', '🔥', '🏆', '🤯'];
const DEFAULT_MESSAGES = ['Nasiib wacan!', 'Aad u fiican', 'Iska jir!', 'Hala soo baxo!', 'Mahadsanid'];

const createSeededRandom = (seedStr: string) => {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
        hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
        hash |= 0;
    }
    let seed = Math.abs(hash);
    return () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };
};

const shuffleArraySeeded = <T,>(array: T[], rng: () => number): T[] => {
    const newArr = [...array];
    for (let i = newArr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
    }
    return newArr;
};

// --- WebRTC Configuration ---
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const GamePage: React.FC = () => {
  const { matchId } = useParams();
  const { user, profile } = useContext(UserContext);
  const navigate = useNavigate();

  const [match, setMatch] = useState<MatchState | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjectName, setSubjectName] = useState('');
  
  // Players Data
  const [leftProfile, setLeftProfile] = useState<UserProfile | null>(null);
  const [rightProfile, setRightProfile] = useState<UserProfile | null>(null);
  const [isSpectator, setIsSpectator] = useState(false);

  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState<{correct: boolean, answer: number} | null>(null);
  
  // Animation State
  const [showIntro, setShowIntro] = useState(false);
  const [introShownOnce, setIntroShownOnce] = useState(false);
  const [showTurnAlert, setShowTurnAlert] = useState(false);
  
  // Opponent Details Modal
  const [showOpponentModal, setShowOpponentModal] = useState(false);
  
  // Reaction States
  const [showReactionMenu, setShowReactionMenu] = useState(false);
  const [activeReactions, setActiveReactions] = useState<{id: number, senderId: string, value: string}[]>([]);
  const reactionCounter = useRef(0);
  const lastProcessedReactionTime = useRef(0);
  
  // Dynamic Reactions from DB
  const [reactionEmojis, setReactionEmojis] = useState<string[]>(DEFAULT_EMOJIS);
  const [reactionMessages, setReactionMessages] = useState<string[]>(DEFAULT_MESSAGES);

  // Loading State
  const [isLoadingError, setIsLoadingError] = useState(false);
  
  // --- WebRTC & Audio State ---
  const [isTalking, setIsTalking] = useState(false);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const processingRef = useRef(false);
  const questionsLoadedRef = useRef(false);

  // Fetch Reactions Settings
  useEffect(() => {
      const reactionsRef = ref(db, 'settings/reactions');
      const unsub = onValue(reactionsRef, (snap) => {
          if (snap.exists()) {
              const data = snap.val();
              if (data.emojis) setReactionEmojis(Object.values(data.emojis));
              if (data.messages) setReactionMessages(Object.values(data.messages));
          }
      });
      return () => unsub();
  }, []);

  // 1. Sync Match Data
  useEffect(() => {
    if (!matchId || !user) return;
    const matchRef = ref(db, `matches/${matchId}`);

    const unsubscribe = onValue(matchRef, async (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        if (!profile?.isSupport) set(ref(db, `users/${user.uid}/activeMatch`), null);
        navigate(profile?.isSupport ? '/support' : '/');
        return;
      }
      
      setMatch(data);

      // Handle Reactions
      if (data.lastReaction && data.lastReaction.timestamp > lastProcessedReactionTime.current) {
          lastProcessedReactionTime.current = data.lastReaction.timestamp;
          triggerReactionAnimation(data.lastReaction);
      }

      // Determine Role
      const pIds = Object.keys(data.players || {});
      const userIsPlayer = pIds.includes(user.uid);
      
      if (!userIsPlayer) {
          if (profile?.isSupport) {
              setIsSpectator(true);
          } else {
              navigate('/');
              return;
          }
      }

      // Check Winner
      if (data.status === 'completed' && data.winner) {
          if (data.winner === user.uid) { 
              playSound('win'); 
              confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } }); 
          }
          else if (data.winner !== 'draw' && !isSpectator) playSound('wrong'); 
      }
    });

    return () => { 
        unsubscribe(); 
    };
  }, [matchId, user, navigate, profile?.isSupport, isSpectator]); 

  // 2. Presence Logic (Game specific)
  useEffect(() => {
      if (!matchId || !user || isSpectator) return;
      
      const connectedRef = ref(db, ".info/connected");
      const unsubscribeConnected = onValue(connectedRef, (snap) => {
          if (snap.val() === true) {
              const myStatusRef = ref(db, `matches/${matchId}/players/${user.uid}`);
              const myLevel = Math.floor((profile?.points || 0) / 10) + 1;
              
              onDisconnect(myStatusRef).update({
                  status: 'offline',
                  lastSeen: serverTimestamp(),
                  isSpeaking: false // Ensure we stop speaking if we disconnect
              }).then(() => {
                  update(myStatusRef, { 
                      status: 'online', 
                      lastSeen: serverTimestamp(),
                      level: myLevel 
                  });
              });
          }
      });

      return () => {
          unsubscribeConnected();
      };
  }, [matchId, user, isSpectator, profile?.points]);

  // 3. Load Profiles
  useEffect(() => {
      if (!match || !user) return;
      
      const loadProfiles = async () => {
          const pIds = Object.keys(match.players || {});
          
          if (isSpectator) {
              if (pIds.length >= 2) {
                  const p1Snap = await get(ref(db, `users/${pIds[0]}`));
                  const p2Snap = await get(ref(db, `users/${pIds[1]}`));
                  if (p1Snap.exists()) setLeftProfile({ uid: pIds[0], ...p1Snap.val() });
                  if (p2Snap.exists()) setRightProfile({ uid: pIds[1], ...p2Snap.val() });
              }
          } else {
              setLeftProfile(profile);
              const oppUid = pIds.find(uid => uid !== user.uid);
              if (oppUid) {
                  const oppSnap = await get(ref(db, `users/${oppUid}`));
                  if (oppSnap.exists()) {
                      setRightProfile({ uid: oppUid, ...oppSnap.val() });
                  }
              }
          }
      };
      loadProfiles();
  }, [match?.matchId, user?.uid, isSpectator, profile]);

  // 4. Load Questions
  useEffect(() => {
      if (!match || !match.subject || questions.length > 0 || questionsLoadedRef.current) return;
      loadQuestions();
  }, [match?.subject, match?.matchId]);

  const loadQuestions = async () => {
      if (!match) return;
      questionsLoadedRef.current = true;
      setIsLoadingError(false);
      let loadedQ: Question[] = [];
      const cacheKey = `questions_cache_${match.subject}`;
      const cachedData = localStorage.getItem(cacheKey);
      
      try {
        if (match.subjectTitle) setSubjectName(match.subjectTitle);

        if (match.subject.startsWith('ALL_')) {
            const subjectId = match.subject.replace('ALL_', '');
            if (!match.subjectTitle) {
                const subSnap = await get(ref(db, `subjects/${subjectId}`));
                if(subSnap.exists()) setSubjectName(subSnap.val().name);
            }
            const chaptersSnap = await get(ref(db, `chapters/${subjectId}`));
            if (chaptersSnap.exists()) {
                const chapters = Object.values(chaptersSnap.val() || {}) as Chapter[];
                const snaps = await Promise.all(chapters.map(c => get(ref(db, `questions/${c.id}`))));
                snaps.forEach(s => {
                    if (s.exists()) {
                        const data = s.val();
                        const chapterQ = Object.keys(data).map(key => ({ ...data[key], id: key }));
                        loadedQ.push(...chapterQ);
                    }
                });
            }
        } else {
            if (cachedData) try { loadedQ = JSON.parse(cachedData); } catch(e) {}
            if (loadedQ.length === 0) {
                const snap = await get(ref(db, `questions/${match.subject}`));
                if(snap.exists()) {
                    const data = snap.val();
                    loadedQ = Object.keys(data).map(key => ({ ...data[key], id: key }));
                    try { localStorage.setItem(cacheKey, JSON.stringify(loadedQ)); } catch(e) {}
                }
            }
            if(!match.subjectTitle) setSubjectName("Battle Arena"); 
        }

        if (loadedQ.length > 0) {
            const rng = createSeededRandom(match.matchId);
            let shuffledQ = shuffleArraySeeded(loadedQ, rng).map(q => {
                const opts = q.options.map((o, i) => ({ t: o, c: i === q.answer }));
                const sOpts = shuffleArraySeeded(opts, rng);
                return { ...q, options: sOpts.map(o => o.t), answer: sOpts.findIndex(o => o.c) };
            });
            const limit = match.questionLimit || 10;
            setQuestions(shuffledQ.slice(0, limit));
        } else {
            setIsLoadingError(true);
            questionsLoadedRef.current = false;
        }
      } catch(e) {
          setIsLoadingError(true);
          questionsLoadedRef.current = false;
      }
  };

  // --- VOICE CHAT IMPLEMENTATION ---
  
  // A. Initialize Audio & Permissions
  useEffect(() => {
      if (isSpectator || !user || !matchId) return;

      const initAudio = async () => {
          try {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              localStreamRef.current = stream;
              // Mute initially for PTT
              stream.getAudioTracks().forEach(track => track.enabled = false);
              setHasMicPermission(true);
          } catch (e) {
              console.warn("Microphone permission denied or not available", e);
              setHasMicPermission(false);
          }
      };

      initAudio();

      return () => {
          if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach(track => track.stop());
          }
      };
  }, [isSpectator, user, matchId]);

  // B. WebRTC Signaling Logic
  useEffect(() => {
      if (isSpectator || !user || !rightProfile || !matchId || !hasMicPermission) return;

      // Ensure PeerConnection is created
      if (!peerConnectionRef.current) {
          const pc = new RTCPeerConnection(iceServers);
          peerConnectionRef.current = pc;

          // Add Local Stream
          if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
          }

          // Handle Remote Stream
          pc.ontrack = (event) => {
              if (remoteAudioRef.current) {
                  remoteAudioRef.current.srcObject = event.streams[0];
                  remoteStreamRef.current = event.streams[0];
              }
          };

          // Handle ICE Candidates
          pc.onicecandidate = (event) => {
              if (event.candidate) {
                  push(ref(db, `matches/${matchId}/webrtc/candidates/${user.uid}`), event.candidate.toJSON());
              }
          };
      }

      const pc = peerConnectionRef.current;
      const signalingRef = ref(db, `matches/${matchId}/webrtc`);

      // 1. Negotiation Logic: User with Lower UID is the Offerer (Caller)
      const isOfferer = user.uid < rightProfile.uid;

      const createOffer = async () => {
          if (!pc) return;
          try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              await set(ref(db, `matches/${matchId}/webrtc/offer`), {
                  type: 'offer',
                  sdp: offer.sdp,
                  sender: user.uid
              });
          } catch (e) { console.error("Error creating offer", e); }
      };

      if (isOfferer) {
          // Trigger offer if not already done (check presence of remote peer logic could be added for robustness)
          // For simplicity, we trigger shortly after both present
          createOffer();
      }

      // 2. Listen for Signaling Messages
      const handleSignaling = (snapshot: any) => {
          if (!snapshot.exists()) return;
          const data = snapshot.val();

          // Handle Offer (Callee side)
          if (data.offer && data.offer.sender !== user.uid && !pc.currentRemoteDescription) {
              pc.setRemoteDescription(new RTCSessionDescription(data.offer)).then(async () => {
                  const answer = await pc.createAnswer();
                  await pc.setLocalDescription(answer);
                  await set(ref(db, `matches/${matchId}/webrtc/answer`), {
                      type: 'answer',
                      sdp: answer.sdp,
                      sender: user.uid
                  });
              });
          }

          // Handle Answer (Caller side)
          if (data.answer && data.answer.sender !== user.uid && !pc.currentRemoteDescription) {
              pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          }
      };

      const unsubSignaling = onValue(signalingRef, handleSignaling);

      // 3. Listen for ICE Candidates
      const candidatesRef = ref(db, `matches/${matchId}/webrtc/candidates/${rightProfile.uid}`);
      const unsubCandidates = onChildAdded(candidatesRef, (snapshot) => {
          if (snapshot.exists() && pc.remoteDescription) {
              try {
                  pc.addIceCandidate(new RTCIceCandidate(snapshot.val()));
              } catch (e) { console.error("Error adding candidate", e); }
          }
      });

      return () => {
          unsubSignaling();
          unsubCandidates();
          if (peerConnectionRef.current) {
              peerConnectionRef.current.close();
              peerConnectionRef.current = null;
          }
      };
  }, [user, rightProfile, matchId, hasMicPermission, isSpectator]);

  // C. Push-To-Talk Handlers
  const startTalking = () => {
      if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks()[0].enabled = true;
          setIsTalking(true);
          update(ref(db, `matches/${matchId}/players/${user?.uid}`), { isSpeaking: true });
          playSound('click'); // Subtle feedback
      }
  };

  const stopTalking = () => {
      if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks()[0].enabled = false;
          setIsTalking(false);
          update(ref(db, `matches/${matchId}/players/${user?.uid}`), { isSpeaking: false });
      }
  };

  // --- End Voice Chat Implementation ---

  // Trigger Intro sequence when game is ready
  useEffect(() => {
      if (!introShownOnce && questions.length > 0 && leftProfile && rightProfile && match && match.currentQ === 0 && match.answersCount === 0 && !isSpectator) {
          setShowIntro(true);
          setIntroShownOnce(true);
          playSound('click');
      }
  }, [questions.length, leftProfile, rightProfile, match?.matchId, introShownOnce, isSpectator]);

  // Turn Notification Logic
  useEffect(() => {
      if (match?.turn === user?.uid && !match.winner && !isSpectator && !showIntro) {
          setShowTurnAlert(true);
          playSound('turn'); // Play notification sound
          const timer = setTimeout(() => setShowTurnAlert(false), 2000);
          return () => clearTimeout(timer);
      } else {
          setShowTurnAlert(false);
      }
  }, [match?.turn, user?.uid, match?.winner, isSpectator, showIntro]);

  // Auto-dismiss VS screen
  useEffect(() => {
      if (showIntro) {
          const timer = setTimeout(() => {
              setShowIntro(false);
          }, 3500);
          return () => clearTimeout(timer);
      }
  }, [showIntro]);

  const triggerReactionAnimation = (reaction: MatchReaction) => {
    const id = ++reactionCounter.current;
    setActiveReactions(prev => {
        const filtered = prev.filter(r => r.senderId !== reaction.senderId);
        return [...filtered, { id, senderId: reaction.senderId, value: reaction.value }];
    });
    playSound('reaction');
    setTimeout(() => {
        setActiveReactions(prev => prev.filter(r => r.id !== id));
    }, 4000);
  };

  const sendReaction = async (val: string) => {
      if (!user || !matchId) return;
      setShowReactionMenu(false);
      playSound('click');
      await update(ref(db, `matches/${matchId}`), {
          lastReaction: {
              senderId: user.uid,
              value: val,
              timestamp: Date.now()
          }
      });
  };

  const handleOptionClick = async (index: number) => {
    if (isSpectator) return;
    if (!match || !user || !isMyTurn || selectedOption !== null || processingRef.current || !currentQuestion) return;
    
    const currentScores = match.scores || {};
    setSelectedOption(index);
    playSound('click');
    processingRef.current = true;

    const isCorrect = index === currentQuestion.answer;
    isCorrect ? playSound('correct') : playSound('wrong');
    setShowFeedback({ correct: isCorrect, answer: currentQuestion.answer });

    setTimeout(async () => {
        const oppUid = Object.keys(currentScores).find(uid => uid !== user.uid) || '';
        const newScores = { ...currentScores };
        if (isCorrect) newScores[user.uid] = (newScores[user.uid] || 0) + POINTS_PER_QUESTION;

        const currentAnswers = match.answersCount || 0;
        let nextQ = match.currentQ;
        let nextAnswersCount = currentAnswers + 1;
        let nextTurn = oppUid; 

        if (currentAnswers >= 1) {
            if (match.currentQ >= questions.length - 1) {
                let winner = 'draw';
                const myScore = newScores[user.uid] || 0;
                const oppScore = newScores[oppUid] || 0;
                
                if (myScore > oppScore) winner = user.uid;
                else if (oppScore > myScore) winner = oppUid;

                const myPts = (await get(ref(db, `users/${user.uid}/points`))).val() || 0;
                await update(ref(db, `users/${user.uid}`), { points: myPts + myScore, activeMatch: null });
                if (oppUid) {
                    const oppPts = (await get(ref(db, `users/${oppUid}/points`))).val() || 0;
                    await update(ref(db, `users/${oppUid}`), { points: oppPts + oppScore, activeMatch: null });
                }

                await update(ref(db, `matches/${matchId}`), { scores: newScores, status: 'completed', winner, answersCount: 2 });
                return;
            }
            nextQ = match.currentQ + 1;
            nextAnswersCount = 0;
        }

        await update(ref(db, `matches/${matchId}`), { 
            scores: newScores, currentQ: nextQ, turn: nextTurn, answersCount: nextAnswersCount 
        });

        setSelectedOption(null); setShowFeedback(null); processingRef.current = false;
    }, 1000); 
  };

  const handleReport = async () => {
      if (!currentQuestion || !user) return;
      playSound('click');
      const { value: reason } = await Swal.fire({
          title: 'Report Question',
          input: 'select',
          inputOptions: {
              'wrong_answer': 'Jawaabta ayaa qaldan (Wrong answer)',
              'typo': 'Qoraal ayaa qaldan (Typo/Error)',
              'other': 'Sabab kale (Other)'
          },
          inputPlaceholder: 'Dooro sababta...',
          showCancelButton: true,
          confirmButtonText: 'Dir (Send)',
          // Validation: Disable send until valid selection
          inputValidator: (value) => {
              return !value && 'Fadlan dooro sababta (Please select a reason)';
          },
          customClass: {
              popup: 'glass-swal-popup',
              title: 'glass-swal-title',
              confirmButton: 'glass-swal-btn-confirm',
              cancelButton: 'glass-swal-btn-cancel'
          }
      });

      if (reason) {
          try {
              const reportRef = push(ref(db, 'reports'));
              await set(reportRef, {
                  id: reportRef.key,
                  questionId: currentQuestion.id,
                  chapterId: match?.subject || 'unknown',
                  reason: reason,
                  reporterUid: user.uid,
                  timestamp: serverTimestamp(),
                  questionText: currentQuestion.question
              });
              showToast("Waad ku mahadsantahay soo sheegidda!", "success");
          } catch (e) {
              showToast("Waan ka xumahay, cilad ayaa dhacday.", "error");
          }
      }
  };

  const handleLeave = async () => {
      if(!user || !matchId) return;
      
      // Stop WebRTC audio if active
      if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      
      if (isSpectator) { navigate('/support'); return; }
      if (match?.status === 'completed') try { await remove(ref(db, `matches/${matchId}`)); } catch(e) {}
      await set(ref(db, `users/${user.uid}/activeMatch`), null);
      navigate('/');
  };

  const handleSurrender = async () => {
      if (isSpectator) { handleLeave(); return; }
      if (!match || !user || !rightProfile) return;
      const confirmed = await showConfirm("Exit Match?", "If you exit now, you will lose the match and forfeit points.", "Exit", "Stay", "warning");
      if (!confirmed) return;

      const oppPts = (await get(ref(db, `users/${rightProfile.uid}/points`))).val() || 0;
      await update(ref(db, `users/${rightProfile.uid}`), { points: oppPts + 20, activeMatch: null });
      await update(ref(db, `matches/${matchId}`), { status: 'completed', winner: rightProfile.uid });
      await set(ref(db, `users/${user.uid}/activeMatch`), null);
      navigate('/');
  };

  const handleRetry = () => {
      questionsLoadedRef.current = false;
      setIsLoadingError(false);
      loadQuestions();
  };

  const currentQuestion = match && questions.length > 0 ? questions[match.currentQ] : null;
  const isMyTurn = match?.turn === user?.uid;
  const isGameOver = match?.status === 'completed';

  if (!match || !leftProfile || !rightProfile || isLoadingError || (!currentQuestion && !isGameOver && !showIntro && !isSpectator)) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6 text-center">
             <div className="animate__animated animate__fadeIn">
                  {isLoadingError ? (
                      <div className="flex flex-col items-center gap-4">
                          <i className="fas fa-exclamation-circle text-5xl text-red-500 mb-2"></i>
                          <h2 className="font-bold text-xl">Connection Problem</h2>
                          <p className="text-slate-400 text-sm mb-4">Could not load match questions.</p>
                          <div className="flex gap-3">
                              <Button onClick={handleLeave} variant="secondary">Exit</Button>
                              <Button onClick={handleRetry}>Retry</Button>
                          </div>
                      </div>
                  ) : (
                      <>
                        <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                           <i className="fas fa-gamepad text-game-accent"></i>
                        </div>
                        <h2 className="font-bold text-xl">{isSpectator ? 'Loading Match...' : 'Waiting for opponent...'}</h2>
                      </>
                  )}
             </div>
        </div>
    );
  }

  const leftLevel = Math.floor((leftProfile.points || 0) / 10) + 1;
  const rightLevel = Math.floor((rightProfile.points || 0) / 10) + 1;
  const leftIsActive = match.turn === leftProfile.uid;
  const rightIsActive = match.turn === rightProfile.uid;
  const safeScores = match.scores || {};
  const winnerUid = match.winner;
  
  // Real-time Speaking Status from DB
  const isLeftSpeaking = match.players?.[leftProfile.uid]?.isSpeaking || false;
  const isRightSpeaking = match.players?.[rightProfile.uid]?.isSpeaking || false;

  return (
    <div className="min-h-screen relative flex flex-col font-sans overflow-hidden transition-colors pt-24">
       
      <style>{`
        @keyframes turnAlert {
            0% { transform: translateY(-200%); opacity: 0; }
            15% { transform: translateY(0); opacity: 1; }
            85% { transform: translateY(0); opacity: 1; }
            100% { transform: translateY(-200%); opacity: 0; }
        }
        .animate-turn-alert {
            animation: turnAlert 2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes ripple {
            0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
            100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
        .speaking-ripple {
            animation: ripple 1.5s infinite;
        }
      `}</style>
      
      {/* Hidden Audio Element for Remote Stream */}
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />
       
      {/* VS Screen Animation */}
      {showIntro && !isSpectator && (
          <div className="fixed inset-0 z-[60] flex flex-col md:flex-row items-center justify-center bg-slate-900 overflow-hidden">
              <div className="w-full md:w-1/2 h-1/2 md:h-full bg-orange-500 relative flex items-center justify-center animate__animated animate__slideInLeft">
                  <div className="text-center z-10">
                      <Avatar src={leftProfile.avatar} seed={leftProfile.uid} size="xl" className="border-4 border-white shadow-2xl mb-4 mx-auto" isVerified={leftProfile.isVerified} isSupport={leftProfile.isSupport} />
                      <h2 className="text-3xl font-black text-white uppercase drop-shadow-md flex items-center justify-center gap-2">
                          {leftProfile.name}
                          {leftProfile.isVerified && <i className="fas fa-check-circle text-white text-2xl"></i>}
                          {leftProfile.isSupport && <i className="fas fa-check-circle text-yellow-300 text-2xl"></i>}
                      </h2>
                      <div className="inline-block bg-black/30 px-3 py-1 rounded-full text-white font-bold mt-2">LVL {leftLevel}</div>
                  </div>
              </div>
              <div className="absolute z-20 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate__animated animate__zoomIn animate__delay-1s">
                  <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center border-4 border-slate-900 shadow-2xl">
                      <span className="font-black text-4xl italic text-slate-900">VS</span>
                  </div>
              </div>
              <div className="w-full md:w-1/2 h-1/2 md:h-full bg-blue-600 relative flex items-center justify-center animate__animated animate__slideInRight">
                  <div className="text-center z-10">
                      <Avatar src={rightProfile.avatar} seed={rightProfile.uid} size="xl" className="border-4 border-white shadow-2xl mb-4 mx-auto" isVerified={rightProfile.isVerified} isSupport={rightProfile.isSupport} />
                      <h2 className="text-3xl font-black text-white uppercase drop-shadow-md flex items-center justify-center gap-2">
                          {rightProfile.name}
                          {rightProfile.isVerified && <i className="fas fa-check-circle text-white text-2xl"></i>}
                          {rightProfile.isSupport && <i className="fas fa-check-circle text-yellow-300 text-2xl"></i>}
                      </h2>
                      <div className="inline-block bg-black/30 px-3 py-1 rounded-full text-white font-bold mt-2">LVL {rightLevel}</div>
                  </div>
              </div>
          </div>
      )}

      {/* Turn Alert */}
      {showTurnAlert && (
        <div className="fixed top-24 left-0 right-0 z-[70] flex justify-center pointer-events-none">
            <div className="animate-turn-alert bg-gradient-to-r from-orange-500 to-red-600 text-white px-8 py-3 rounded-full shadow-[0_10px_30px_rgba(249,115,22,0.5)] border-4 border-white dark:border-slate-800 flex items-center gap-3 transform">
                <i className="fas fa-bolt text-yellow-300 animate-pulse text-xl"></i>
                <span className="font-black text-xl uppercase tracking-widest italic drop-shadow-md">Your Turn!</span>
            </div>
        </div>
      )}

      {/* Exit Button Pill - Fixed Top Center */}
      {!isGameOver && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60]">
              <button onClick={handleSurrender} className="bg-[#e74c3c] hover:bg-red-600 text-white px-5 py-2 rounded-full font-black text-xs uppercase tracking-tighter shadow-2xl border-2 border-white/30 transition-all flex items-center gap-2 active:scale-95">
                  <i className="fas fa-sign-out-alt rotate-180"></i> EXIT
              </button>
          </div>
      )}

      {/* HEADER SCOREBOARD */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#2c3e50] border-b border-slate-700 shadow-xl p-3">
         <div className="max-w-4xl mx-auto flex justify-between items-center px-4">
            {/* Left Player (Me) */}
            <div className={`flex items-center gap-3 transition-all ${leftIsActive && !isGameOver ? 'scale-105' : 'opacity-80'}`}>
                 <div className="relative">
                     {/* Speaking Indicator Ring */}
                     <div className={`absolute -inset-1 rounded-full transition-all duration-300 ${isLeftSpeaking ? 'bg-green-500 speaking-ripple' : 'bg-transparent'}`}></div>
                     
                     <Avatar src={leftProfile.avatar} seed={leftProfile.uid} size="sm" className="border-2 border-slate-500 shadow-md relative z-10" />
                     <div className="absolute -bottom-1 -right-1 bg-[#1a252f] text-white text-[7px] px-1 rounded-sm font-black border border-white uppercase z-20">LVL {leftLevel}</div>
                     
                     {/* REACTIONS FOR LEFT */}
                     {activeReactions.filter(r => r.senderId === leftProfile.uid).map(r => (
                         <div key={r.id} className="absolute -bottom-14 left-0 z-50 animate__animated animate__bounceIn animate__faster">
                             <div className="bg-white px-3 py-1.5 rounded-2xl shadow-2xl border-2 border-game-primary whitespace-nowrap flex flex-col items-center relative">
                                <span className={r.value.length > 2 ? "text-[10px] font-black text-game-primary uppercase" : "text-3xl"}>{r.value}</span>
                                <div className="absolute -top-1.5 left-4 w-3 h-3 bg-white border-t-2 border-l-2 border-game-primary rotate-45"></div>
                             </div>
                         </div>
                     ))}
                 </div>
                 <div>
                     <div className="flex items-center gap-1.5">
                         <div className="text-[10px] font-black uppercase text-slate-300 truncate">{leftProfile.name}</div>
                         {leftProfile.isVerified && <i className="fas fa-check-circle text-blue-500 text-[10px]"></i>}
                         {isLeftSpeaking && <i className="fas fa-microphone text-green-400 text-[10px] animate-pulse"></i>}
                     </div>
                     <div className="text-2xl font-black text-orange-400 leading-none">{safeScores[leftProfile.uid] ?? 0}</div>
                 </div>
            </div>
            
            <div className="text-center">
                 <div className="text-lg font-black text-slate-100 italic tracking-tighter">VS</div>
                 <div className="text-[9px] font-bold text-slate-400 uppercase">Q {match.currentQ + 1}/{questions.length}</div>
            </div>
            
            {/* Right Player (Opponent) */}
            <div className={`flex items-center gap-3 flex-row-reverse text-right transition-all ${rightIsActive && !isGameOver ? 'scale-105' : 'opacity-80'}`}>
                 <div className="relative">
                    {/* Speaking Indicator Ring */}
                    <div className={`absolute -inset-1 rounded-full transition-all duration-300 ${isRightSpeaking ? 'bg-green-500 speaking-ripple' : 'bg-transparent'}`}></div>

                    <Avatar src={rightProfile.avatar} seed={rightProfile.uid} size="sm" className="border-2 border-slate-500 shadow-md relative z-10" />
                    <div className="absolute -bottom-1 -right-1 bg-[#1a252f] text-white text-[7px] px-1 rounded-sm font-black border border-white uppercase z-20">LVL {rightLevel}</div>

                    {/* REACTIONS FOR RIGHT */}
                    {activeReactions.filter(r => r.senderId === rightProfile.uid).map(r => (
                         <div key={r.id} className="absolute -bottom-14 right-0 z-50 animate__animated animate__bounceIn animate__faster">
                             <div className="bg-white px-3 py-1.5 rounded-2xl shadow-2xl border-2 border-game-primary whitespace-nowrap flex flex-col items-center relative">
                                <span className={r.value.length > 2 ? "text-[10px] font-black text-game-primary uppercase" : "text-3xl"}>{r.value}</span>
                                <div className="absolute -top-1.5 right-4 w-3 h-3 bg-white border-t-2 border-l-2 border-game-primary rotate-45"></div>
                             </div>
                         </div>
                     ))}
                 </div>
                 <div>
                     <div className="flex items-center gap-1.5 justify-end">
                         {isRightSpeaking && <i className="fas fa-microphone text-green-400 text-[10px] animate-pulse"></i>}
                         {rightProfile.isOnline && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>}
                         <div className="text-[10px] font-black uppercase text-slate-300 truncate">{rightProfile.name}</div>
                         {rightProfile.isVerified && <i className="fas fa-check-circle text-blue-500 text-[10px]"></i>}
                     </div>
                     <div className="text-2xl font-black text-orange-400 leading-none">{safeScores[rightProfile.uid] ?? 0}</div>
                 </div>
            </div>
         </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-3xl mx-auto z-10">
        {isGameOver ? (
           /* REDESIGNED RESULT UI */
           <div className="w-full max-w-lg animate__animated animate__zoomIn">
              <Card className="!p-0 overflow-hidden border-none shadow-[0_20px_50px_rgba(0,0,0,0.2)] bg-white dark:bg-slate-800 rounded-[2.5rem]">
                  {/* Header Banner */}
                  <div className={`py-10 px-6 relative text-center overflow-hidden ${winnerUid === user?.uid ? 'bg-gradient-to-br from-yellow-400 via-orange-500 to-red-600' : winnerUid === 'draw' ? 'bg-slate-700' : 'bg-gradient-to-br from-slate-700 to-slate-900'}`}>
                      {/* Decorative elements */}
                      <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                      <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/20 rounded-full blur-3xl"></div>
                      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-black/20 rounded-full blur-3xl"></div>
                      
                      <div className="relative z-10">
                          <div className="inline-block px-4 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black text-white uppercase tracking-[0.2em] mb-3">Match Summary</div>
                          <h1 className="text-5xl md:text-6xl font-black text-white uppercase italic tracking-tighter drop-shadow-lg leading-none">
                              {winnerUid === user?.uid ? 'VICTORY' : winnerUid === 'draw' ? 'DRAW' : 'DEFEAT'}
                          </h1>
                          <p className="text-white/80 font-bold mt-2 text-sm uppercase tracking-widest">{subjectName}</p>
                      </div>
                  </div>

                  {/* Summary Content */}
                  <div className="p-8">
                      {/* Comparison Bar */}
                      <div className="flex justify-between items-center mb-10 gap-4">
                          {/* Me */}
                          <div className="flex-1 flex flex-col items-center">
                              <div className="relative mb-3">
                                  <Avatar src={leftProfile.avatar} size="lg" className={`border-4 ${winnerUid === leftProfile.uid ? 'border-yellow-400 ring-4 ring-yellow-400/20' : 'border-slate-100 dark:border-slate-700'}`} isVerified={leftProfile.isVerified} isSupport={leftProfile.isSupport} />
                                  {winnerUid === leftProfile.uid && <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-3xl animate-bounce">👑</div>}
                              </div>
                              <div className="text-center">
                                  <div className="font-black text-slate-800 dark:text-white uppercase text-xs truncate max-w-[80px]">You</div>
                                  <div className="text-3xl font-black text-game-primary">{safeScores[leftProfile.uid] ?? 0}</div>
                              </div>
                          </div>

                          <div className="text-slate-200 dark:text-slate-600 font-black text-2xl italic px-4">VS</div>

                          {/* Opponent */}
                          <div className="flex-1 flex flex-col items-center">
                              <div className="relative mb-3">
                                  <Avatar src={rightProfile.avatar} size="lg" className={`border-4 ${winnerUid === rightProfile.uid ? 'border-yellow-400 ring-4 ring-yellow-400/20' : 'border-slate-100 dark:border-slate-700'}`} isVerified={rightProfile.isVerified} isSupport={rightProfile.isSupport} />
                                  {winnerUid === rightProfile.uid && <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-3xl animate-bounce">👑</div>}
                              </div>
                              <div className="text-center">
                                  <div className="font-black text-slate-800 dark:text-white uppercase text-xs truncate max-w-[80px]">{rightProfile.name.split(' ')[0]}</div>
                                  <div className="text-3xl font-black text-slate-400">{safeScores[rightProfile.uid] ?? 0}</div>
                              </div>
                          </div>
                      </div>

                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-4 mb-10">
                          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-3xl border border-slate-100 dark:border-slate-700 flex flex-col items-center">
                              <span className="text-[10px] font-black text-slate-400 uppercase mb-1">XP Gained</span>
                              <div className="flex items-center gap-2">
                                  <i className="fas fa-bolt text-game-primary"></i>
                                  <span className="text-2xl font-black text-slate-800 dark:text-white">+{safeScores[user?.uid || ''] ?? 0}</span>
                              </div>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-3xl border border-slate-100 dark:border-slate-700 flex flex-col items-center">
                              <span className="text-[10px] font-black text-slate-400 uppercase mb-1">New Level</span>
                              <div className="flex items-center gap-2">
                                  <i className="fas fa-star text-amber-500"></i>
                                  <span className="text-2xl font-black text-slate-800 dark:text-white">{leftLevel}</span>
                              </div>
                          </div>
                      </div>

                      <Button onClick={handleLeave} size="lg" fullWidth className="py-5 shadow-xl !rounded-2xl text-lg shadow-orange-500/20">
                          CONTINUE <i className="fas fa-arrow-right ml-2"></i>
                      </Button>
                  </div>
              </Card>
           </div>
        ) : (
            <>
                 {/* Question Card */}
                 <div className={`relative w-full bg-slate-100 dark:bg-slate-800 rounded-[1.5rem] p-6 shadow-xl mb-6 min-h-[180px] flex flex-col items-center justify-center text-center border-t-4 transition-colors duration-300 ${isMyTurn ? 'border-orange-500 shadow-orange-500/10' : 'border-slate-300 dark:border-slate-600'}`}>
                     <button onClick={handleReport} className="absolute top-4 right-6 text-slate-300 hover:text-red-500 transition-colors z-30" title="Report Question">
                         <i className="fas fa-flag text-lg opacity-50 hover:opacity-100"></i>
                     </button>

                     <div className="mb-4">
                         <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest">
                             <i className="fas fa-layer-group text-game-primary"></i> {subjectName}
                         </span>
                     </div>
                     <h2 className="relative z-10 text-xl md:text-2xl font-black text-[#2c3e50] dark:text-white leading-snug drop-shadow-sm">
                        {currentQuestion && currentQuestion.question}
                     </h2>
                 </div>

                 {/* Options Grid */}
                 <div className="relative w-full grid grid-cols-1 gap-3">
                     {!isMyTurn && !isSpectator && (
                         <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                             <div className="backdrop-blur-xl bg-white/30 dark:bg-slate-900/40 border border-white/50 px-10 py-6 rounded-[2rem] shadow-[0_15px_50px_rgba(0,0,0,0.15)] flex flex-col items-center gap-3 animate__animated animate__fadeIn transform scale-110">
                                 <div className="w-12 h-12 rounded-full bg-[#f1f1ff] dark:bg-indigo-900/30 flex items-center justify-center">
                                     <i className="fas fa-hourglass-half text-[#6366f1] animate-bounce"></i>
                                 </div>
                                 <div className="text-center">
                                     <div className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-1">Waiting for</div>
                                     <div className="text-lg font-black text-[#2c3e50] dark:text-white tracking-tight">{rightProfile.name}</div>
                                 </div>
                             </div>
                         </div>
                     )}

                     {currentQuestion && currentQuestion.options.map((opt, idx) => {
                        let bgClass = "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200";
                        let animateClass = "";
                        
                        // Default blocked style for opponent's turn
                        if (!isMyTurn && !isSpectator) {
                            bgClass = "bg-slate-50 dark:bg-slate-800/50 border-transparent text-slate-400 blur-[2px] opacity-60 grayscale pointer-events-none";
                        }

                        if (showFeedback) {
                            if (idx === showFeedback.answer) {
                                bgClass = "bg-green-500 text-white border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.6)] z-10 scale-[1.02]";
                                animateClass = "animate__animated animate__shakeY animate__faster";
                            }
                            else if (selectedOption === idx) {
                                bgClass = "bg-red-500 text-white border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.6)] z-10 scale-[1.02]";
                                animateClass = "animate__animated animate__shakeX animate__faster";
                            }
                            else {
                                bgClass = "opacity-50 grayscale blur-[1px] scale-95";
                            }
                        }

                        return (
                            <button 
                                key={idx} 
                                disabled={!isMyTurn || selectedOption !== null} 
                                onClick={() => handleOptionClick(idx)} 
                                className={`w-full p-4 rounded-2xl text-left transition-all duration-200 flex items-center gap-4 border-2 shadow-sm ${bgClass} ${animateClass}`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0 bg-slate-50 dark:bg-slate-700 text-slate-400 ${showFeedback ? 'bg-white/20 text-white' : ''}`}>
                                    {String.fromCharCode(65 + idx)}
                                </div>
                                <span className="font-bold text-base leading-tight flex-1">{opt}</span>
                            </button>
                        );
                    })}
                 </div>
            </>
        )}
      </div>

      {/* Push-to-Talk Button */}
      {!isGameOver && !isSpectator && hasMicPermission && (
          <div className="fixed bottom-24 left-4 z-[60]">
              <button
                  onMouseDown={startTalking}
                  onMouseUp={stopTalking}
                  onMouseLeave={stopTalking}
                  onTouchStart={startTalking}
                  onTouchEnd={stopTalking}
                  className={`w-16 h-16 rounded-full shadow-2xl border-4 transition-all duration-200 flex items-center justify-center transform active:scale-95 ${
                      isTalking 
                      ? 'bg-green-500 border-green-400 scale-110 shadow-[0_0_30px_rgba(34,197,94,0.6)]' 
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
              >
                  <i className={`fas fa-microphone text-2xl ${isTalking ? 'text-white animate-pulse' : 'text-slate-400'}`}></i>
                  {isTalking && (
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-sm whitespace-nowrap">
                          Speaking
                      </span>
                  )}
              </button>
          </div>
      )}

      {/* Reaction Toggle Button */}
      {!isGameOver && !isSpectator && (
          <div className="fixed bottom-24 right-4 z-[60]">
               <button 
                onClick={() => setShowReactionMenu(!showReactionMenu)}
                className="w-16 h-16 rounded-full bg-white shadow-2xl border-4 border-[#f97316] text-3xl flex items-center justify-center transition-all active:scale-95 hover:bg-orange-50"
               >
                   <i className={`fas ${showReactionMenu ? 'fa-times text-red-500' : 'fa-smile text-[#f97316]'}`}></i>
               </button>
               
               {showReactionMenu && (
                   <div className="absolute bottom-20 right-0 w-64 p-4 bg-white/95 rounded-3xl shadow-2xl border-2 border-slate-100 animate__animated animate__bounceIn">
                       <div className="grid grid-cols-4 gap-3 mb-4">
                           {reactionEmojis.map(emoji => (
                               <button key={emoji} onClick={() => sendReaction(emoji)} className="text-3xl hover:scale-125 transition-transform p-1">{emoji}</button>
                           ))}
                       </div>
                       <div className="space-y-2 border-t border-slate-100 pt-3">
                           {reactionMessages.map(msg => (
                               <button key={msg} onClick={() => sendReaction(msg)} className="w-full text-left px-4 py-2 rounded-xl bg-slate-50 text-[11px] font-black text-slate-600 uppercase tracking-wide hover:bg-game-primary hover:text-white transition-colors">{msg}</button>
                           ))}
                       </div>
                   </div>
               )}
          </div>
      )}

      {showOpponentModal && (
          <Modal isOpen={true} onClose={() => setShowOpponentModal(false)} title="Opponent Profile">
               <div className="flex flex-col items-center mb-6">
                   <Avatar src={rightProfile.avatar} seed={rightProfile.uid} size="xl" isVerified={rightProfile.isVerified} className="mb-4 shadow-xl border-4 border-white" />
                   <h2 className="text-2xl font-black text-slate-900 text-center">{rightProfile.name}</h2>
               </div>
               <Button fullWidth onClick={() => setShowOpponentModal(false)}>Close</Button>
          </Modal>
      )}
    </div>
  );
};

export default GamePage;
