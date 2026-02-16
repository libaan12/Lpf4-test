
import React, { useEffect, useState, useContext, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, onDisconnect, get, set, remove, serverTimestamp, push, onChildAdded, off, query, limitToLast } from 'firebase/database';
import { db } from '../firebase';
import { UserContext } from '../contexts';
import { POINTS_PER_QUESTION } from '../constants';
import { MatchState, Question, Chapter, UserProfile, MatchReaction } from '../types';
import { Avatar, Button, Card, Modal, VerificationBadge } from '../components/UI';
import { UserProfileModal } from '../components/UserProfileModal';
import { playSound } from '../services/audioService';
import { showToast, showConfirm, showAlert, showPrompt } from '../services/alert';
import confetti from 'canvas-confetti';
import { ReportModal } from '../components/ReportModal';
import html2canvas from 'html2canvas';

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
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);
  const [introShownOnce, setIntroShownOnce] = useState(false);
  const [showTurnAlert, setShowTurnAlert] = useState(false);
  const winnerAnimationPlayed = useRef(false);
  
  // Opponent Details Modal
  const [showOpponentModal, setShowOpponentModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  
  // Reaction States
  const [showReactionMenu, setShowReactionMenu] = useState(false);
  const [activeReactions, setActiveReactions] = useState<{id: number, senderId: string, value: string}[]>([]);
  const reactionCounter = useRef(0);
  
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
  const remoteCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);
  
  // Ref to track if user is holding the PTT button (handling async permission delay)
  const isHoldingButtonRef = useRef(false);
  
  const processingRef = useRef(false);
  const questionsLoadedRef = useRef(false);
  const resultCardRef = useRef<HTMLDivElement>(null);

  // Helper to unlock audio context on interactions
  const unlockAudio = () => {
      if (remoteAudioRef.current) {
          remoteAudioRef.current.play().catch(() => {});
      }
  };

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
    
    // Reset winner animation flag on new match load
    winnerAnimationPlayed.current = false;

    const matchRef = ref(db, `matches/${matchId}`);

    const unsubscribe = onValue(matchRef, async (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        if (!profile?.isSupport) set(ref(db, `users/${user.uid}/activeMatch`), null);
        navigate(profile?.isSupport ? '/support' : '/');
        return;
      }
      
      setMatch(data);

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

      // Check Winner (Once only)
      if (data.status === 'completed' && data.winner && !winnerAnimationPlayed.current) {
          winnerAnimationPlayed.current = true;
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

  // --- NEW REALTIME REACTIONS IMPLEMENTATION ---
  useEffect(() => {
      if (!matchId) return;
      const reactionsRef = query(ref(db, `matches/${matchId}/reactions`), limitToLast(3));
      
      const unsub = onChildAdded(reactionsRef, (snapshot) => {
          const data = snapshot.val();
          if (!data) return;
          
          if (data.senderId === user?.uid) return;

          if (Date.now() - data.timestamp < 5000) {
              triggerReactionAnimation(data);
          }
      });

      return () => off(reactionsRef);
  }, [matchId, user?.uid]);

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
      unlockAudio();
      playSound('click'); 

      const reaction: MatchReaction = {
          senderId: user.uid,
          value: val,
          timestamp: Date.now()
      };
      triggerReactionAnimation(reaction);

      const reactionsListRef = ref(db, `matches/${matchId}/reactions`);
      await push(reactionsListRef, reaction);
  };

  // 2. Presence Logic
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
                  isSpeaking: false 
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
  
  const initAudio = async () => {
      if (hasMicPermission) return true;
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = stream;
          stream.getAudioTracks().forEach(track => track.enabled = false);
          setHasMicPermission(true);
          return true;
      } catch (e) {
          console.warn("Microphone permission denied or not available", e);
          setHasMicPermission(false);
          return false;
      }
  };

  const processCandidateQueue = async () => {
      if (!peerConnectionRef.current || !peerConnectionRef.current.remoteDescription) return;
      while (remoteCandidatesQueue.current.length > 0) {
          const candidate = remoteCandidatesQueue.current.shift();
          if (candidate) {
              try {
                  await peerConnectionRef.current.addIceCandidate(candidate);
              } catch (e) { console.warn("Error adding queued candidate", e); }
          }
      }
  };

  useEffect(() => {
      if (isSpectator || !user || !rightProfile || !matchId) return;

      if (!peerConnectionRef.current) {
          const pc = new RTCPeerConnection(iceServers);
          peerConnectionRef.current = pc;

          if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));
          } else {
              pc.addTransceiver('audio', { direction: 'recvonly' });
          }

          pc.ontrack = (event) => {
              if (remoteAudioRef.current) {
                  remoteAudioRef.current.srcObject = event.streams[0];
                  remoteStreamRef.current = event.streams[0];
                  remoteAudioRef.current.play().catch(e => console.log("Audio play blocked", e));
              }
          };

          pc.onicecandidate = (event) => {
              if (event.candidate) {
                  push(ref(db, `matches/${matchId}/webrtc/candidates/${user.uid}`), event.candidate.toJSON());
              }
          };
      }

      const pc = peerConnectionRef.current;
      const signalingRef = ref(db, `matches/${matchId}/webrtc`);

      const isOfferer = user.uid < rightProfile.uid;

      const createOffer = async () => {
          if (!pc) return;
          try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              await set(ref(db, `matches/${matchId}/webrtc/offer`), {
                  type: 'offer',
                  sdp: offer.sdp,
                  sender: user.uid,
                  ts: Date.now()
              });
          } catch (e) { console.error("Error creating offer", e); }
      };

      if (isOfferer) {
          createOffer();
      }

      const handleSignaling = (snapshot: any) => {
          if (!snapshot.exists()) return;
          const data = snapshot.val();

          if (data.offer && data.offer.sender !== user.uid) {
              const processOffer = async () => {
                  try {
                      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                      await processCandidateQueue();
                      const answer = await pc.createAnswer();
                      await pc.setLocalDescription(answer);
                      await set(ref(db, `matches/${matchId}/webrtc/answer`), {
                          type: 'answer',
                          sdp: answer.sdp,
                          sender: user.uid,
                          ts: Date.now()
                      });
                  } catch(e) {
                      console.warn("Signaling Error", e);
                  }
              };
              processOffer();
          }

          if (data.answer && data.answer.sender !== user.uid) {
              try {
                  if (pc.signalingState === 'have-local-offer') {
                      pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                      processCandidateQueue();
                  }
              } catch(e) {}
          }
      };

      const unsubSignaling = onValue(signalingRef, handleSignaling);

      const candidatesRef = ref(db, `matches/${matchId}/webrtc/candidates/${rightProfile.uid}`);
      const unsubCandidates = onChildAdded(candidatesRef, async (snapshot) => {
          if (snapshot.exists()) {
              const candidate = snapshot.val();
              if (candidate && pc.remoteDescription && pc.signalingState !== 'closed') {
                  try {
                      await pc.addIceCandidate(candidate);
                  } catch (e) { console.warn("Error adding candidate", e); }
              } else {
                  remoteCandidatesQueue.current.push(candidate);
              }
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
  }, [user, rightProfile, matchId, isSpectator]); 

  useEffect(() => {
      if (hasMicPermission && peerConnectionRef.current && localStreamRef.current) {
          const pc = peerConnectionRef.current;
          let tracksAdded = false;
          
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          
          if (audioTrack) {
              const transceivers = pc.getTransceivers();
              const transceiver = transceivers.find(t => t.receiver.track.kind === 'audio');
              
              if (transceiver) {
                  if (transceiver.sender.track !== audioTrack) {
                      transceiver.sender.replaceTrack(audioTrack).catch(e => console.error("Replace track failed", e));
                      transceiver.direction = 'sendrecv';
                      tracksAdded = true;
                  }
              } else {
                  const senders = pc.getSenders();
                  const alreadyHas = senders.find(s => s.track === audioTrack);
                  if (!alreadyHas) {
                      pc.addTrack(audioTrack, localStreamRef.current!);
                      tracksAdded = true;
                  }
              }
          }

          if (tracksAdded) {
              const renegotiate = async () => {
                  try {
                      const offer = await pc.createOffer();
                      await pc.setLocalDescription(offer);
                      await set(ref(db, `matches/${matchId}/webrtc/offer`), {
                          type: 'offer',
                          sdp: offer.sdp,
                          sender: user?.uid,
                          ts: Date.now()
                      });
                  } catch(e) { console.error("Renegotiation failed", e); }
              };
              renegotiate();
          }
      }
  }, [hasMicPermission, matchId, user?.uid]);

  const handlePTTStart = async (e: React.SyntheticEvent) => {
      e.preventDefault();
      unlockAudio(); 
      isHoldingButtonRef.current = true;

      if (!hasMicPermission) {
          const granted = await initAudio();
          if (!granted || !isHoldingButtonRef.current) return;
      }

      if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks()[0].enabled = true;
          setIsTalking(true);
          update(ref(db, `matches/${matchId}/players/${user?.uid}`), { isSpeaking: true });
          playSound('click'); 
      }
  };

  const stopTalking = (e?: React.SyntheticEvent) => {
      if(e) e.preventDefault();
      isHoldingButtonRef.current = false;

      if (localStreamRef.current && isTalking) {
          localStreamRef.current.getAudioTracks()[0].enabled = false;
          setIsTalking(false);
          update(ref(db, `matches/${matchId}/players/${user?.uid}`), { isSpeaking: false });
      }
  };

  // --- End Voice Chat Implementation ---

  // Trigger Intro sequence when game is ready
  useEffect(() => {
      if (
          !introShownOnce && 
          questions.length > 0 && 
          leftProfile && 
          rightProfile && 
          match && 
          match.currentQ === 0 && 
          match.answersCount === 0 && 
          !isSpectator
      ) {
          setShowIntro(true);
          setIntroShownOnce(true);
          playSound('click');
      }
  }, [questions.length, leftProfile, rightProfile, match?.matchId, introShownOnce, isSpectator]);

  useEffect(() => {
      if (showIntro) {
          const timer = setTimeout(() => {
              setShowIntro(false);
              startCountdown();
          }, 3500); 
          return () => clearTimeout(timer);
      }
  }, [showIntro]);

  const startCountdown = () => {
      setShowCountdown(true);
      setCountdownValue(3);
      playSound('tick'); 
      
      const interval = setInterval(() => {
          setCountdownValue(prev => {
              if (prev === 1) {
                  clearInterval(interval);
                  playSound('fight'); 
                  setTimeout(() => setShowCountdown(false), 1000);
                  return 0; 
              }
              playSound('tick');
              return prev - 1;
          });
      }, 1000);
  };

  useEffect(() => {
      if (match?.turn === user?.uid && !match.winner && !isSpectator && !showIntro && !showCountdown) {
          setShowTurnAlert(true);
          playSound('turn'); 
          const timer = setTimeout(() => setShowTurnAlert(false), 2000);
          return () => clearTimeout(timer);
      } else {
          setShowTurnAlert(false);
      }
  }, [match?.turn, user?.uid, match?.winner, isSpectator, showIntro, showCountdown]);

  const handleOptionClick = async (index: number) => {
    if (isSpectator) return;
    if (!match || !user || !isMyTurn || selectedOption !== null || processingRef.current || !currentQuestion) return;
    
    unlockAudio(); 
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
      setShowReportModal(true);
  };

  const handleShare = async () => {
      if (!resultCardRef.current) return;
      try {
          const canvas = await html2canvas(resultCardRef.current, {
              backgroundColor: '#0f172a',
              scale: 2
          });
          canvas.toBlob(async (blob) => {
              if (!blob) return;
              const file = new File([blob], 'battle-result.png', { type: 'image/png' });
              
              if (navigator.canShare && navigator.canShare({ files: [file] })) {
                  await navigator.share({
                      files: [file],
                      title: 'LP-F4 Battle Result',
                      text: `I just battled ${rightProfile?.name}! #LPF4`
                  });
              } else {
                  const link = document.createElement('a');
                  link.href = canvas.toDataURL();
                  link.download = 'battle-result.png';
                  link.click();
                  showToast("Image Saved");
              }
          });
      } catch (e) {
          console.error(e);
          showToast("Share failed", "error");
      }
  };

  const handleLeave = async () => {
      if(!user || !matchId) return;
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
      const confirmed = await showConfirm("Exit Match?", "If you exit now, you will lose the match.", "Exit", "Stay", "warning");
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

  const getOptionStyles = (index: number) => {
      const isSelected = selectedOption === index;
      const isResult = showFeedback !== null;
      const isCorrect = isResult && showFeedback.answer === index;
      const isWrong = isResult && !showFeedback.correct && isSelected;
      
      let containerClass = "border-slate-800 bg-slate-900/50 text-slate-300";
      let letterBoxClass = "bg-slate-800 text-cyan-400 border border-slate-700";
      let glowClass = "shadow-none";
      let barClass = "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)]"; 

      if (isCorrect) {
          containerClass = "border-green-500 bg-green-500/10 text-white";
          letterBoxClass = "bg-green-500 text-white border-green-500";
          glowClass = "shadow-[0_0_20px_rgba(34,197,94,0.3)]";
          barClass = "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]";
      } else if (isWrong) {
          containerClass = "border-red-500 bg-red-500/10 text-white";
          letterBoxClass = "bg-red-500 text-white border-red-500";
          glowClass = "shadow-[0_0_20px_rgba(239,68,68,0.3)]";
          barClass = "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]";
      } else if (isSelected) {
          containerClass = "border-orange-500 bg-slate-900 text-white";
          letterBoxClass = "bg-orange-500 text-white border-orange-500";
          glowClass = "shadow-[0_0_20px_rgba(249,115,22,0.3)]";
          barClass = "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.8)]";
      }

      return { containerClass, letterBoxClass, glowClass, barClass };
  };

  if (!match || !leftProfile || !rightProfile || isLoadingError || (!currentQuestion && !isGameOver && !showIntro && !showCountdown && !isSpectator)) {
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
                           <i className="fas fa-gamepad text-cyan-400"></i>
                        </div>
                        <h2 className="font-bold text-xl text-cyan-400">{isSpectator ? 'Loading Match...' : 'Waiting for opponent...'}</h2>
                      </>
                  )}
             </div>
        </div>
    );
  }

  const leftLevel = Math.floor((leftProfile.points || 0) / 10) + 1;
  const rightLevel = Math.floor((rightProfile.points || 0) / 10) + 1;
  const safeScores = match.scores || {};
  const winnerUid = match.winner;
  
  const isLeftSpeaking = match.players?.[leftProfile.uid]?.isSpeaking || false;
  const isRightSpeaking = match.players?.[rightProfile.uid]?.isSpeaking || false;

  const myScore = safeScores[leftProfile.uid] || 0;
  const oppScore = safeScores[rightProfile.uid] || 0;
  const myCorrect = Math.floor(myScore / POINTS_PER_QUESTION);
  const oppCorrect = Math.floor(oppScore / POINTS_PER_QUESTION);
  const totalQs = questions.length; 
  const myWrong = Math.max(0, match.currentQ + 1 - myCorrect); 
  const oppWrong = Math.max(0, match.currentQ + 1 - oppCorrect);

  const myStats = { correct: myCorrect, wrong: totalQs - myCorrect, score: myScore };
  const oppStats = { correct: oppCorrect, wrong: totalQs - oppCorrect, score: oppScore };

  return (
    <div className="min-h-screen bg-[#050b14] font-sans overflow-hidden relative flex flex-col items-center select-none">
        
        <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-[#050b14] to-[#050b14] pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-[linear-gradient(to_bottom,transparent_0%,#0f172a_100%),linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] [transform:perspective(500px)_rotateX(60deg)_translateY(100px)] opacity-30 pointer-events-none origin-bottom"></div>

        {showIntro && !isSpectator && (
            <div className="fixed inset-0 z-[60] flex flex-col md:flex-row items-center justify-center bg-slate-900 overflow-hidden">
                <div className="w-full md:w-1/2 h-1/2 md:h-full bg-cyan-500 relative flex items-center justify-center animate__animated animate__slideInLeft z-10">
                    <div className="text-center z-20 transform scale-110">
                        <Avatar src={leftProfile.avatar} seed={leftProfile.uid} size="xl" className="border-[6px] border-white shadow-2xl mb-6 mx-auto" isVerified={leftProfile.isVerified} isSupport={leftProfile.isSupport} />
                        <h2 className="text-4xl font-black text-white uppercase">{leftProfile.name}</h2>
                    </div>
                </div>
                <div className="absolute z-30 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate__animated animate__zoomIn animate__delay-1s">
                    <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center border-8 border-slate-900 shadow-[0_0_50px_rgba(255,255,255,0.5)]">
                        <span className="font-black text-5xl italic text-slate-900 transform -skew-x-12">VS</span>
                    </div>
                </div>
                <div className="w-full md:w-1/2 h-1/2 md:h-full bg-orange-600 relative flex items-center justify-center animate__animated animate__slideInRight z-10">
                    <div className="text-center z-20 transform scale-110">
                        <Avatar src={rightProfile.avatar} seed={rightProfile.uid} size="xl" className="border-[6px] border-white shadow-2xl mb-6 mx-auto" isVerified={rightProfile.isVerified} isSupport={rightProfile.isSupport} />
                        <h2 className="text-4xl font-black text-white uppercase">{rightProfile.name}</h2>
                    </div>
                </div>
            </div>
        )}

        {showCountdown && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm animate__animated animate__fadeIn">
                <div className="text-[150px] font-black text-cyan-400 drop-shadow-[0_0_30px_rgba(34,211,238,0.8)] animate__animated animate__zoomIn animate__faster key={countdownValue}">
                    {countdownValue === 0 ? 'GO!' : countdownValue}
                </div>
            </div>
        )}

        {isGameOver && (
           <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-4 animate__animated animate__fadeIn">
              <div id="result-card" ref={resultCardRef} className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-700/50 rounded-[2.5rem] shadow-2xl overflow-hidden animate__animated animate__zoomInUp">
                  
                  <div className={`absolute top-0 left-0 right-0 h-1/2 opacity-20 pointer-events-none ${winnerUid === user?.uid ? 'bg-gradient-to-b from-yellow-500 to-transparent' : 'bg-gradient-to-b from-red-600 to-transparent'}`}></div>

                  <div className="relative pt-8 pb-4 text-center z-10">
                      <h1 className={`text-6xl font-black italic tracking-tighter uppercase drop-shadow-[0_0_20px_rgba(0,0,0,0.5)] ${winnerUid === user?.uid ? 'text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-orange-500' : winnerUid === 'draw' ? 'text-slate-300' : 'text-red-500'}`}>
                          {winnerUid === user?.uid ? 'VICTORY' : winnerUid === 'draw' ? 'DRAW' : 'DEFEAT'}
                      </h1>
                      <div className="text-white/60 font-black text-xs uppercase tracking-[0.4em] mt-2">{subjectName || 'Battle Arena'}</div>
                  </div>

                  <div className="grid grid-cols-3 items-end px-6 py-6 relative z-10">
                      <div className={`flex flex-col items-center ${winnerUid === user?.uid ? 'scale-110 -translate-y-4 z-20' : 'opacity-80 scale-90'}`}>
                          <Avatar src={leftProfile.avatar} size="xl" className={`border-4 shadow-2xl ${winnerUid === user?.uid ? 'border-yellow-400 ring-4 ring-yellow-400/20' : 'border-slate-600'}`} />
                          <div className="mt-5 text-center">
                              <div className="text-white font-black text-lg">{leftProfile.name}</div>
                              <div className="text-cyan-400 font-black text-xl">{myStats.score} PTS</div>
                          </div>
                      </div>

                      <div className="flex flex-col items-center justify-center pb-12">
                          <span className="text-4xl font-black text-slate-700 italic opacity-50">VS</span>
                      </div>

                      <div className={`flex flex-col items-center ${winnerUid === rightProfile.uid ? 'scale-110 -translate-y-4 z-20' : 'opacity-80 scale-90'}`}>
                          <Avatar src={rightProfile.avatar} size="xl" className={`border-4 shadow-2xl ${winnerUid === rightProfile.uid ? 'border-yellow-400 ring-4 ring-yellow-400/20' : 'border-slate-600'}`} />
                          <div className="mt-5 text-center">
                              <div className="text-white font-black text-lg">{rightProfile.name}</div>
                              <div className="text-orange-500 font-black text-xl">{oppStats.score} PTS</div>
                          </div>
                      </div>
                  </div>

                  <div className="p-6 pt-4 flex gap-4">
                      <Button onClick={handleShare} fullWidth size="lg" className="shadow-xl bg-blue-600 border-blue-800 hover:bg-blue-700">
                          SHARE RESULT
                      </Button>
                      <Button onClick={handleLeave} fullWidth size="lg" className="shadow-xl bg-slate-700 border-slate-800 hover:bg-slate-600">
                          CONTINUE
                      </Button>
                  </div>
              </div>
           </div>
        )}

        {showTurnAlert && !isGameOver && (
            <div className="absolute top-28 left-0 right-0 z-[45] flex justify-center pointer-events-none">
                <div className="animate-turn-alert bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-3 rounded-full shadow-[0_0_30px_rgba(6,182,212,0.5)] border-2 border-white flex items-center gap-3 transform">
                    <i className="fas fa-bolt text-yellow-300 animate-pulse text-xl"></i>
                    <span className="font-black text-xl uppercase tracking-widest italic drop-shadow-md">Your Turn!</span>
                </div>
            </div>
        )}

        <div className="w-full max-w-lg px-4 pt-8 pb-2 z-10 flex justify-between items-start relative">
            <div className="flex flex-col items-center w-24">
                <div className={`relative ${isLeftSpeaking ? 'ring-4 ring-green-500 rounded-full' : ''}`}>
                    <Avatar src={leftProfile.avatar} size="lg" className="border-2 border-cyan-400" />
                </div>
                <div className="mt-2 text-center text-white font-bold text-xs">You</div>
                <div className="text-cyan-400 font-black text-xs">{safeScores[leftProfile.uid] ?? 0}</div>
            </div>

            <div className="flex flex-col items-center mt-2">
                <span className="text-2xl font-black text-white italic">VS</span>
                <div className="mt-3 bg-slate-800/80 border border-orange-500/30 text-orange-400 px-4 py-1 rounded-full text-xs font-black">
                    {match.currentQ + 1}/{questions.length}
                </div>
            </div>

            <div className="flex flex-col items-center w-24" onClick={() => setShowOpponentModal(true)}>
                <div className={`relative ${isRightSpeaking ? 'ring-4 ring-green-500 rounded-full' : ''}`}>
                    <Avatar src={rightProfile.avatar} size="lg" className="border-2 border-orange-500" />
                </div>
                <div className="mt-2 text-center text-white font-bold text-xs truncate w-20">{rightProfile.name}</div>
                <div className="text-orange-500 font-black text-xs">{safeScores[rightProfile.uid] ?? 0}</div>
            </div>
        </div>

        <div className="w-full max-w-lg px-4 z-10 flex-1 flex flex-col justify-start pt-4 min-h-0 pb-24 overflow-y-auto custom-scrollbar">
            <div className="relative bg-slate-900/40 backdrop-blur-xl border border-cyan-500/30 rounded-[2rem] p-6 shadow-[0_0_40px_rgba(6,182,212,0.1)]">
                <button 
                    onClick={handleReport} 
                    className="absolute top-4 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-slate-800/50 text-slate-500 hover:text-red-500 hover:bg-slate-800 transition-all"
                    title="Report Issue"
                >
                    <i className="fas fa-flag text-xs"></i>
                </button>
                <div className="mt-3 flex items-center justify-center min-h-[50px]">
                    <h2 className="text-lg md:text-xl font-bold text-center text-white leading-snug drop-shadow-md">
                        {currentQuestion?.question}
                    </h2>
                </div>
            </div>

            <div className="mt-3 space-y-2">
                {!isMyTurn && !isSpectator && !isGameOver && (
                     <div className="absolute inset-x-0 bottom-24 z-30 flex items-center justify-center pointer-events-none animate__animated animate__fadeIn">
                         <div className="bg-slate-900/80 backdrop-blur-md border border-white/20 px-6 py-2 rounded-full shadow-2xl flex items-center gap-3">
                             <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
                             <span className="text-xs font-bold text-white uppercase tracking-widest">Opponent's Turn</span>
                         </div>
                     </div>
                )}

                {currentQuestion?.options.map((opt, idx) => {
                    const style = getOptionStyles(idx);
                    const showBar = selectedOption === idx || (showFeedback && showFeedback.answer === idx);
                    return (
                        <button
                            key={idx}
                            disabled={!isMyTurn || selectedOption !== null}
                            onClick={() => handleOptionClick(idx)}
                            className={`w-full relative group transition-all duration-200 transform active:scale-[0.98] ${!isMyTurn && !isSpectator ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                        >
                            <div className={`relative p-1 rounded-2xl border-2 transition-all duration-300 ${style.containerClass} ${style.glowClass}`}>
                                <div className="flex items-center gap-3 bg-transparent p-2 rounded-xl">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0 transition-colors ${style.letterBoxClass}`}>
                                        {String.fromCharCode(65 + idx)}
                                    </div>
                                    <span className={`flex-1 font-bold text-left text-sm leading-snug break-words ${selectedOption === idx || (showFeedback && showFeedback.answer === idx) ? 'text-white' : 'text-slate-300'}`}>{opt}</span>
                                </div>
                                {showBar && <div className={`absolute right-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-l-full ${style.barClass}`}></div>}
                            </div>
                        </button>
                    )
                })}
            </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-6 pointer-events-none bg-gradient-to-t from-[#050b14] via-[#050b14]/80 to-transparent pt-10">
            <div className="w-full max-w-lg px-8 flex justify-between items-end pointer-events-auto relative">
                <div className="relative">
                    <button onClick={() => setShowReactionMenu(!showReactionMenu)} className="w-14 h-14 rounded-full bg-slate-900 border-2 border-orange-500 text-orange-500 flex items-center justify-center text-2xl shadow-lg hover:bg-orange-500 hover:text-white transition-all active:scale-90">
                        <i className={`fas ${showReactionMenu ? 'fa-times' : 'fa-smile'}`}></i>
                    </button>
                    {showReactionMenu && (
                        <div className="absolute bottom-16 left-0 bg-slate-800/95 backdrop-blur-xl border border-orange-500/30 p-4 rounded-[2rem] w-64 shadow-2xl animate__animated animate__zoomIn animate__faster origin-bottom-left z-30 mb-2">
                            <div className="grid grid-cols-4 gap-2 mb-3">
                                {reactionEmojis.map(emoji => (
                                    <button key={emoji} onClick={() => sendReaction(emoji)} className="text-3xl hover:scale-125 transition-transform p-2">{emoji}</button>
                                ))}
                            </div>
                            <div className="space-y-2 pt-2 border-t border-white/10">
                                {reactionMessages.map(msg => (
                                    <button key={msg} onClick={() => sendReaction(msg)} className="w-full text-left px-3 py-1.5 rounded-lg bg-slate-700/50 text-[10px] font-bold text-slate-300 uppercase hover:bg-orange-500 hover:text-white transition-colors">{msg}</button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onMouseDown={handlePTTStart}
                    onMouseUp={stopTalking}
                    onMouseLeave={stopTalking}
                    onTouchStart={handlePTTStart}
                    onTouchEnd={stopTalking}
                    className={`w-20 h-20 rounded-full bg-slate-900 border-[3px] flex items-center justify-center text-3xl shadow-[0_0_30px_rgba(6,182,212,0.3)] transition-all active:scale-95 -mb-2 ${isTalking ? 'border-green-500 text-green-500 shadow-[0_0_40px_rgba(34,197,94,0.6)] scale-110' : 'border-cyan-500 text-cyan-400 hover:scale-105'}`}
                >
                    <i className={`fas ${isTalking ? 'fa-microphone-lines' : 'fa-microphone'}`}></i>
                </button>

                <button onClick={handleSurrender} className="w-14 h-14 rounded-full bg-slate-900 border-2 border-red-500/80 text-red-500 flex items-center justify-center text-2xl shadow-lg hover:bg-red-500 hover:text-white transition-all active:scale-90">
                    <i className="fas fa-sign-out-alt"></i>
                </button>
            </div>
        </div>

        {showOpponentModal && <UserProfileModal user={rightProfile} onClose={() => setShowOpponentModal(false)} />}
        
        {/* Fix: Pass correct chapterId */}
        {showReportModal && currentQuestion && (
            <ReportModal 
                question={currentQuestion} 
                chapterId={currentQuestion.subject || match?.subject || 'unknown'} 
                onClose={() => setShowReportModal(false)} 
            />
        )}
    </div>
  );
};

export default GamePage;
