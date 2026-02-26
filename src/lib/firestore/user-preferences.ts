import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export type UserPreferences = {
  defaultModelType: "gemini" | "custom";
  defaultHoursLeft: number;
  updatedAt?: unknown;
};

const DEFAULT_PREFERENCES: Omit<UserPreferences, "updatedAt"> = {
  defaultModelType: "gemini",
  defaultHoursLeft: 6,
};

export async function getUserPreferences(uid: string): Promise<UserPreferences> {
  const db = getFirebaseDb();
  const ref = doc(db, "users", uid, "preferences", "settings");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { ...DEFAULT_PREFERENCES };
  }
  const data = snap.data() as UserPreferences;
  return {
    defaultModelType: data.defaultModelType ?? DEFAULT_PREFERENCES.defaultModelType,
    defaultHoursLeft: data.defaultHoursLeft ?? DEFAULT_PREFERENCES.defaultHoursLeft,
  };
}

export async function setUserPreferences(
  uid: string,
  prefs: Partial<Omit<UserPreferences, "updatedAt">>
): Promise<void> {
  const db = getFirebaseDb();
  const ref = doc(db, "users", uid, "preferences", "settings");
  await setDoc(ref, { ...prefs, updatedAt: serverTimestamp() }, { merge: true });
}
