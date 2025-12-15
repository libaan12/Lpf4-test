import React from 'react';
import { User } from 'firebase/auth';
import { UserProfile } from './types';

// Context for User Data
export const UserContext = React.createContext<{
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}>({ user: null, profile: null, loading: true });

// Context for Theme
export const ThemeContext = React.createContext<{
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}>({ theme: 'light', setTheme: () => {} });