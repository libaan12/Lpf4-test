
export interface UserProfile {
  uid: string;
  name: string;
  email?: string; // Optional for guests
  username?: string; // Unique handle
  points: number;
  avatar: string; // URL
  gender?: 'male' | 'female';
  activeMatch?: string | null;
  role?: 'user' | 'admin';
  banned?: boolean;
  avatarUpdated?: boolean;
  isVerified?: boolean; // Blue tick
  isGuest?: boolean;
  isOnline?: boolean;
  lastSeen?: number;
  friends?: { [uid: string]: boolean };
}

export interface Subject {
  id: string;
  name: string;
}

export interface Chapter {
  id: string;
  name: string;
  subjectId: string;
}

export interface Question {
  id: string | number;
  question: string;
  options: string[];
  answer: number; // Index of correct answer
  subject: string; // This will now typically refer to the chapterId
}

export interface MatchState {
  matchId: string;
  status: 'active' | 'completed' | 'cancelled';
  mode: 'auto' | 'custom';
  turn: string; // uid of current player
  currentQ: number; // index of DEMO_DATA
  answersCount?: number; // 0 = 1st player needs to answer, 1 = 2nd player needs to answer
  scores: {
    [uid: string]: number;
  };
  players: {
    [uid: string]: {
      name: string;
      avatar: string;
      level?: number;
      status?: 'online' | 'offline';
      lastSeen?: number;
    }
  };
  winner?: string | null; // 'draw', 'disconnect', or uid
  subject: string;
  questionLimit?: number; // Total quizzes to play
}

export interface Room {
  host: string;
  sid: string; // Subject ID
  lid: string; // Chapter ID (lid was used in LobbyPage)
  code: string;
  questionLimit: number;
  createdAt: number;
  linkedChatPath?: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  type?: 'text' | 'invite'; // Invite for match
  inviteCode?: string; // Room code if type is invite
  subjectName?: string; // Subject name for the invite
  status?: 'waiting' | 'played' | 'canceled';
}