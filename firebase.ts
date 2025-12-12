import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

// REPLACE WITH YOUR FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyDKFpwQU9W4Njvtmtz6N_Jc2kZjdY_CIEc",
  authDomain: "connectsphare-a27d6.firebaseapp.com",
  databaseURL: "https://connectsphare-a27d6-default-rtdb.firebaseio.com",
  projectId: "connectsphare-a27d6",
  storageBucket: "connectsphare-a27d6.firebasestorage.app",
  messagingSenderId: "277886142393",
  appId: "1:277886142393:web:44fedcbec4e9cc5363d868"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);