"use client";

import { useState, useEffect, useCallback } from "react";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
  deleteUser,
} from "firebase/auth";
import {
  collection,
  getDocs,
  writeBatch,
  doc,
} from "firebase/firestore";
import { toast } from "sonner";
import { User, Mail, Shield, Trash2, Loader2, Save, Eye, EyeOff } from "lucide-react";

import { useAuth } from "@/components/AuthProvider";
import { RequireAuth } from "@/components/RequireAuth";
import { AuthenticatedNavBar } from "@/components/AuthenticatedNavBar";
import { Button } from "@/components/ui/button";
import { getFirebaseDb } from "@/lib/firebase";
import { getUserPreferences, setUserPreferences, UserPreferences } from "@/lib/firestore/user-preferences";

// ─── Tab types ────────────────────────────────────────────────────────────────
type Tab = "profile" | "preferences" | "security" | "danger";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "preferences", label: "Preferences", icon: Mail },
  { id: "security", label: "Security", icon: Shield },
  { id: "danger", label: "Danger Zone", icon: Trash2 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name: string | null | undefined, email: string | null | undefined) {
  if (name && name.trim()) {
    return name
      .trim()
      .split(" ")
      .map((p) => p[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  if (email) return email[0].toUpperCase();
  return "?";
}

// ─── Profile Tab ─────────────────────────────────────────────────────────────
function ProfileTab() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [saving, setSaving] = useState(false);

  const hasGoogle = user?.providerData.some((p) => p.providerId === "google.com");
  const hasEmail = user?.providerData.some((p) => p.providerId === "password");

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await updateProfile(user, { displayName: displayName.trim() || null });
      toast.success("Display name updated");
    } catch {
      toast.error("Failed to update display name");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        {user?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.photoURL}
            alt="Avatar"
            className="w-16 h-16 rounded-full object-cover ring-2 ring-white/10"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-orange-500/30 flex items-center justify-center text-xl font-bold text-orange-200">
            {getInitials(user?.displayName, user?.email)}
          </div>
        )}
        <div>
          <p className="font-medium text-white">{user?.displayName ?? "(no name set)"}</p>
          <p className="text-xs text-neutral-500">{user?.email}</p>
        </div>
      </div>

      {/* Display name */}
      <div className="space-y-1.5">
        <label className="text-sm text-neutral-400 font-medium">Display name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Your name"
          className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
        />
      </div>

      {/* Email (readonly) */}
      <div className="space-y-1.5">
        <label className="text-sm text-neutral-400 font-medium">Email</label>
        <input
          type="email"
          value={user?.email ?? ""}
          readOnly
          className="w-full bg-neutral-900/50 border border-white/5 rounded-lg px-3 py-2 text-sm text-neutral-500 cursor-not-allowed"
        />
      </div>

      {/* Provider badges */}
      <div className="space-y-1.5">
        <label className="text-sm text-neutral-400 font-medium">Linked accounts</label>
        <div className="flex gap-2 flex-wrap">
          {hasGoogle && (
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-neutral-300">
              Google
            </span>
          )}
          {hasEmail && (
            <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-neutral-300">
              Email / Password
            </span>
          )}
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="bg-orange-500 hover:bg-orange-600 text-black rounded-lg gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save changes
      </Button>
    </div>
  );
}

// ─── Preferences Tab ──────────────────────────────────────────────────────────
function PreferencesTab() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences>({
    defaultModelType: "gemini",
    defaultHoursLeft: 6,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const p = await getUserPreferences(user.uid);
      setPrefs(p);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      await setUserPreferences(user.uid, {
        defaultModelType: prefs.defaultModelType,
        defaultHoursLeft: prefs.defaultHoursLeft,
      });
      toast.success("Preferences saved");
    } catch {
      toast.error("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading preferences…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Default AI model */}
      <div className="space-y-2">
        <label className="text-sm text-neutral-400 font-medium">Default AI model</label>
        <p className="text-xs text-neutral-600">Used when generating a new study strategy.</p>
        <div className="flex gap-3">
          {(["gemini", "custom"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setPrefs((p) => ({ ...p, defaultModelType: m }))}
              className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                prefs.defaultModelType === m
                  ? "border-orange-500/60 bg-orange-500/10 text-orange-300"
                  : "border-white/10 bg-white/5 text-neutral-400 hover:bg-white/10"
              }`}
            >
              {m === "gemini" ? "Gemini (default)" : "Custom model"}
            </button>
          ))}
        </div>
      </div>

      {/* Default study hours */}
      <div className="space-y-2">
        <label className="text-sm text-neutral-400 font-medium">
          Default study hours —{" "}
          <span className="text-white font-semibold">{prefs.defaultHoursLeft}h</span>
        </label>
        <p className="text-xs text-neutral-600">Pre-fills the &quot;hours left&quot; field on the strategy form.</p>
        <input
          type="range"
          min={1}
          max={48}
          step={1}
          value={prefs.defaultHoursLeft}
          onChange={(e) => setPrefs((p) => ({ ...p, defaultHoursLeft: Number(e.target.value) }))}
          className="w-full accent-orange-500"
        />
        <div className="flex justify-between text-xs text-neutral-600">
          <span>1h</span><span>48h</span>
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="bg-orange-500 hover:bg-orange-600 text-black rounded-lg gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save preferences
      </Button>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────────────────────────────────
function SecurityTab() {
  const { user } = useAuth();
  const hasEmail = user?.providerData.some((p) => p.providerId === "password");

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleChangePassword() {
    if (!user || !user.email) return;
    if (newPwd.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (newPwd !== confirmPwd) { toast.error("Passwords do not match"); return; }
    setSaving(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPwd);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPwd);
      toast.success("Password updated successfully");
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        toast.error("Current password is incorrect");
      } else {
        toast.error("Failed to update password");
      }
    } finally {
      setSaving(false);
    }
  }

  if (!hasEmail) {
    return (
      <div className="rounded-lg bg-neutral-900 border border-white/10 p-4 text-sm text-neutral-400">
        Password management is only available for accounts using email / password sign-in.
        Your account uses Google sign-in, so there is no password to change here.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-400">Change your account password below.</p>

      {/* Current password */}
      <div className="space-y-1.5">
        <label className="text-sm text-neutral-400 font-medium">Current password</label>
        <div className="relative">
          <input
            type={showCurrent ? "text" : "password"}
            value={currentPwd}
            onChange={(e) => setCurrentPwd(e.target.value)}
            className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white pr-10 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
          />
          <button
            type="button"
            onClick={() => setShowCurrent((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
          >
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* New password */}
      <div className="space-y-1.5">
        <label className="text-sm text-neutral-400 font-medium">New password</label>
        <div className="relative">
          <input
            type={showNew ? "text" : "password"}
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white pr-10 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
          />
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
          >
            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Confirm password */}
      <div className="space-y-1.5">
        <label className="text-sm text-neutral-400 font-medium">Confirm new password</label>
        <input
          type="password"
          value={confirmPwd}
          onChange={(e) => setConfirmPwd(e.target.value)}
          className="w-full bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500/50"
        />
      </div>

      <Button
        onClick={handleChangePassword}
        disabled={saving || !currentPwd || !newPwd || !confirmPwd}
        className="bg-orange-500 hover:bg-orange-600 text-black rounded-lg gap-2"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
        Update password
      </Button>
    </div>
  );
}

// ─── Danger Zone Tab ──────────────────────────────────────────────────────────
function DangerTab() {
  const { user } = useAuth();
  const hasEmail = user?.providerData.some((p) => p.providerId === "password");

  const [deletingData, setDeletingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [confirmDeleteData, setConfirmDeleteData] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [reauthPwd, setReauthPwd] = useState("");

  async function handleDeleteAllData() {
    if (!user) return;
    setDeletingData(true);
    try {
      const db = getFirebaseDb();
      const batch = writeBatch(db);

      // Delete all strategies (and their sub-collections would need individual deletes)
      const strategiesSnap = await getDocs(collection(db, "users", user.uid, "strategies"));
      for (const stratDoc of strategiesSnap.docs) {
        // Delete sources sub-collection
        const sourcesSnap = await getDocs(collection(db, "users", user.uid, "strategies", stratDoc.id, "sources"));
        sourcesSnap.docs.forEach((s) => batch.delete(s.ref));
        // Delete indexedChunks sub-collection
        const chunksSnap = await getDocs(collection(db, "users", user.uid, "strategies", stratDoc.id, "indexedChunks"));
        chunksSnap.docs.forEach((c) => batch.delete(c.ref));
        batch.delete(stratDoc.ref);
      }

      // Delete all study sessions
      const sessionsSnap = await getDocs(collection(db, "users", user.uid, "studySessions"));
      sessionsSnap.docs.forEach((s) => batch.delete(s.ref));

      await batch.commit();
      toast.success("All study data deleted");
      setConfirmDeleteData(false);
    } catch {
      toast.error("Failed to delete data");
    } finally {
      setDeletingData(false);
    }
  }

  async function handleDeleteAccount() {
    if (!user) return;
    setDeletingAccount(true);
    try {
      // Re-authenticate if email/password account
      if (hasEmail && user.email) {
        if (!reauthPwd) { toast.error("Enter your password to confirm"); setDeletingAccount(false); return; }
        const cred = EmailAuthProvider.credential(user.email, reauthPwd);
        await reauthenticateWithCredential(user, cred);
      }

      // Delete Firestore data first
      const db = getFirebaseDb();
      const batch = writeBatch(db);
      const strategiesSnap = await getDocs(collection(db, "users", user.uid, "strategies"));
      for (const stratDoc of strategiesSnap.docs) {
        const sourcesSnap = await getDocs(collection(db, "users", user.uid, "strategies", stratDoc.id, "sources"));
        sourcesSnap.docs.forEach((s) => batch.delete(s.ref));
        const chunksSnap = await getDocs(collection(db, "users", user.uid, "strategies", stratDoc.id, "indexedChunks"));
        chunksSnap.docs.forEach((c) => batch.delete(c.ref));
        batch.delete(stratDoc.ref);
      }
      const sessionsSnap = await getDocs(collection(db, "users", user.uid, "studySessions"));
      sessionsSnap.docs.forEach((s) => batch.delete(s.ref));
      // Delete preferences doc
      const prefDoc = doc(db, "users", user.uid, "preferences", "settings");
      batch.delete(prefDoc);
      await batch.commit();

      // Delete auth account
      await deleteUser(user);
      // Firebase auth state change will redirect via RequireAuth
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        toast.error("Incorrect password");
      } else if (code === "auth/requires-recent-login") {
        toast.error("Please sign out, sign back in, then try again");
      } else {
        toast.error("Failed to delete account");
      }
      setDeletingAccount(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Delete all data */}
      <div className="rounded-lg border border-red-900/40 bg-red-950/10 p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-red-400">Delete all study data</h3>
          <p className="text-xs text-neutral-500 mt-1">
            Permanently removes all your strategies, sources, indexed chunks, and study sessions.
            Your account will remain active.
          </p>
        </div>
        {!confirmDeleteData ? (
          <Button
            variant="outline"
            onClick={() => setConfirmDeleteData(true)}
            className="border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-lg"
          >
            Delete all study data
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-red-400 font-medium">Are you sure? This cannot be undone.</p>
            <div className="flex gap-2">
              <Button
                onClick={handleDeleteAllData}
                disabled={deletingData}
                className="bg-red-600 hover:bg-red-700 text-white rounded-lg gap-2"
              >
                {deletingData ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Yes, delete everything
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmDeleteData(false)}
                className="border-white/10 text-neutral-400 hover:bg-white/5 rounded-lg"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Delete account */}
      <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-5 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-red-400">Delete account</h3>
          <p className="text-xs text-neutral-500 mt-1">
            Permanently deletes your account and all associated data. This action is irreversible.
          </p>
        </div>
        {!confirmDeleteAccount ? (
          <Button
            variant="outline"
            onClick={() => setConfirmDeleteAccount(true)}
            className="border-red-500/40 text-red-400 hover:bg-red-500/10 rounded-lg"
          >
            Delete my account
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-red-400 font-medium">
              This will permanently delete your account and all data.
            </p>
            {hasEmail && (
              <input
                type="password"
                placeholder="Enter your password to confirm"
                value={reauthPwd}
                onChange={(e) => setReauthPwd(e.target.value)}
                className="w-full bg-neutral-900 border border-red-900/40 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-red-500/50"
              />
            )}
            <div className="flex gap-2">
              <Button
                onClick={handleDeleteAccount}
                disabled={deletingAccount || (hasEmail && !reauthPwd)}
                className="bg-red-700 hover:bg-red-800 text-white rounded-lg gap-2"
              >
                {deletingAccount ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Yes, delete my account
              </Button>
              <Button
                variant="outline"
                onClick={() => { setConfirmDeleteAccount(false); setReauthPwd(""); }}
                className="border-white/10 text-neutral-400 hover:bg-white/5 rounded-lg"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Settings Content (inner, expects auth) ───────────────────────────────────
function SettingsContent() {
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  const tabContent: Record<Tab, React.ReactNode> = {
    profile: <ProfileTab />,
    preferences: <PreferencesTab />,
    security: <SecurityTab />,
    danger: <DangerTab />,
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <AuthenticatedNavBar />
      <main className="max-w-3xl mx-auto px-4 pt-28 pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Account Settings</h1>
          <p className="text-sm text-neutral-500 mt-1">Manage your profile, preferences, and account security.</p>
        </div>

        <div className="flex gap-1 border-b border-white/10 mb-8 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === id
                  ? "border-orange-500 text-orange-400"
                  : "border-transparent text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div>{tabContent[activeTab]}</div>
      </main>
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────
export default function SettingsPage() {
  return (
    <RequireAuth redirectTo="/settings">
      <SettingsContent />
    </RequireAuth>
  );
}
