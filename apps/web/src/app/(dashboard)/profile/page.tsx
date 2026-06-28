"use client";

import { useState } from "react";
import { useSession } from "@/lib/auth-client";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { Loader2, User, Mail, Lock } from "lucide-react";

export default function ProfilePage() {
  const { data: session, isPending } = useSession();

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  if (isPending) {
    return <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const user = session?.user;

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingName(true);
    try {
      const res = await authClient.updateUser({ name: name.trim() });
      if ((res as any)?.error) throw new Error((res as any).error.message);
      toast.success("Name updated");
      setName("");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update name");
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim() || !emailPassword.trim()) return;
    setSavingEmail(true);
    try {
      const res = await authClient.changeEmail({ newEmail: newEmail.trim(), callbackURL: "/dashboard" });
      if ((res as any)?.error) throw new Error((res as any).error.message);
      toast.success("Verification email sent. Check your inbox to confirm the new email.");
      setNewEmail("");
      setEmailPassword("");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update email");
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setSavingPassword(true);
    try {
      const res = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      });
      if ((res as any)?.error) throw new Error((res as any).error.message);
      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update password");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Profile Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your personal account details.</p>
      </div>

      <div className="space-y-6">
        {/* Update Name */}
        <div className="bg-white border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <User className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Display Name</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Current name: <span className="font-medium text-foreground">{user?.name}</span>
          </p>
          <form onSubmit={handleUpdateName} className="flex gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New display name"
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <button
              type="submit"
              disabled={savingName || !name.trim()}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {savingName && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </form>
        </div>

        {/* Update Email */}
        <div className="bg-white border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Email Address</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Current email: <span className="font-medium text-foreground">{user?.email}</span>
          </p>
          <form onSubmit={handleChangeEmail} className="space-y-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="New email address"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <div className="flex gap-3">
              <input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder="Confirm with your password"
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <button
                type="submit"
                disabled={savingEmail || !newEmail.trim() || !emailPassword.trim()}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {savingEmail && <Loader2 className="w-4 h-4 animate-spin" />}
                Update
              </button>
            </div>
            <p className="text-xs text-muted-foreground">A verification link will be sent to the new email address.</p>
          </form>
        </div>

        {/* Change Password */}
        <div className="bg-white border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">Change Password</h2>
          </div>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <div className="flex gap-3">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <button
                type="submit"
                disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {savingPassword && <Loader2 className="w-4 h-4 animate-spin" />}
                Update
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
