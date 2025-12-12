
export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  points: number;
  avatar: string; // URL
  activeMatch?: string | null;
  role?: 'user' | 'admin';
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
  turn: string; // uid of current player
  currentQ: number; // index of DEMO_DATA
  scores: {
    [uid: string]: number;
  };
  players: {
    [uid: string]: {
      name: string;
      avatar: string;
    }
  };
  winner?: string | null; // 'draw', 'disconnect', or uid
  subject: string;
}

export interface Room {
  host: string;
  sid: string; // Subject ID
  code: string;
  createdAt: number;
}
