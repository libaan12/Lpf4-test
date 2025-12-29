
export const AVATAR_BASE_URL = "https://api.dicebear.com/7.x/avataaars/svg?seed=";
export const POINTS_PER_QUESTION = 2;
export const MATCH_TIMEOUT_MS = 10000; // Ranked/Auto: 10 seconds
export const PRIVATE_ROOM_TIMEOUT_MS = 15000; // Social/Private: 15 seconds

export const generateAvatarUrl = (seed: string) => {
  // Enforce specific facial features for a neutral look
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&mouth=default&eyes=default&eyebrows=default&facialHairProbability=0`;
};
