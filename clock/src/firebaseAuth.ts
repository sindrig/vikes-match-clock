import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  User,
  UserCredential,
} from "firebase/auth";
import { auth } from "./firebase";

export interface AuthState {
  isLoaded: boolean;
  isEmpty: boolean;
  uid?: string;
  email?: string | null;
}

const googleProvider = new GoogleAuthProvider();

export const firebaseAuth = {
  login: (email: string, password: string): Promise<UserCredential> =>
    signInWithEmailAndPassword(auth, email, password),

  loginWithGoogle: (): Promise<UserCredential> =>
    signInWithPopup(auth, googleProvider),

  logout: (): Promise<void> => signOut(auth),

  onAuthStateChanged: (callback: (user: User | null) => void) =>
    onAuthStateChanged(auth, callback),

  getCurrentUser: (): User | null => auth.currentUser,

  userToAuthState: (user: User | null): AuthState => {
    if (user === null) {
      return { isLoaded: true, isEmpty: true };
    }
    return {
      isLoaded: true,
      isEmpty: false,
      uid: user.uid,
      email: user.email,
    };
  },
};

export type { User, UserCredential };
