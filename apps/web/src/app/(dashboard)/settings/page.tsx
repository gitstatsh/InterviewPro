"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { OrganizationUpdateSchema, type OrganizationUpdateInput } from "@interview/shared";
import { useOrganization, useUpdateOrganization, useDeleteOrganization } from "@/hooks/use-organizations";
import { useActiveOrg } from "@/hooks/use-organization";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useMyRole, isOwner, canInviteMembers } from "@/hooks/use-organizations";

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const MAX_DIMENSION = 512;

function validateLogoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      return reject("Only image files are allowed.");
    }
    if (file.size > MAX_FILE_SIZE) {
      return reject("Image must be smaller than 2MB.");
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
            const ratio = img.width / img.height;
        if (ratio < 0.5 || ratio > 2) {
          return reject("Logo should be roughly square (aspect ratio between 1:2 and 2:1).");
        }
        // Auto-resize to max 512px on the longest side while preserving aspect ratio
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject("Could not read image dimensions.");
      img.src = dataUrl;
    };
    reader.onerror = () => reject("Could not read file.");
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const { activeOrgId, setActiveOrgId } = useActiveOrg();
  const { data, isLoading } = useOrganization(activeOrgId);
  const { mutateAsync: update, isPending: updating } = useUpdateOrganization(activeOrgId!);
  const { mutateAsync: deleteOrg, isPending: deleting } = useDeleteOrganization();
  const router = useRouter();
  const myRole = useMyRole(activeOrgId);
  const iAmOwner = isOwner(myRole);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoChanged, setLogoChanged] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (myRole !== null && !canInviteMembers(myRole)) {
      router.replace("/dashboard");
    }
  }, [myRole, router]);

  const org = data?.data;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<OrganizationUpdateInput>({
    resolver: zodResolver(OrganizationUpdateSchema),
  });

  useEffect(() => {
    if (org) {
      reset({ name: org.name, website: org.website ?? "", description: org.description ?? "" });
      setLogoPreview(org.logo ?? null);
    }
  }, [org, reset]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    try {
      const dataUrl = await validateLogoFile(file);
      setLogoPreview(dataUrl);
      setLogoChanged(true);
    } catch (err: any) {
      setLogoError(err);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeLogo = () => {
    setLogoPreview(null);
    setLogoChanged(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSave = async (input: OrganizationUpdateInput) => {
    try {
      const payload: OrganizationUpdateInput = { ...input };
      if (logoChanged) payload.logo = logoPreview;
      await update(payload);
      setLogoChanged(false);
      toast.success("Settings saved");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    }
  };

  const onDelete = async () => {
    try {
      await deleteOrg(activeOrgId!);
      setActiveOrgId(null);
      toast.success("Organization deleted");
      router.push("/organizations/new");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete");
    }
  };

  if (!activeOrgId) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>No organization selected.</p>
        <Link href="/organizations/new" className="text-primary hover:underline text-sm mt-2 block">
          Create one first
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const isFormDirty = isDirty || logoChanged;

  return (
    <div className="max-w-xl">
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Delete organisation?</h2>
                <p className="text-sm text-muted-foreground">This is permanent and cannot be undone.</p>
              </div>
            </div>
            <div className="bg-muted rounded-lg px-4 py-3 mb-4 text-sm space-y-1">
              <p className="font-medium text-foreground">Everything will be deleted:</p>
              <ul className="text-muted-foreground text-xs list-disc list-inside space-y-0.5">
                <li>All candidates and their data</li>
                <li>All interview sessions, answers, and ratings</li>
                <li>All question banks and questions</li>
                <li>All members, roles, and reports</li>
              </ul>
            </div>
            <p className="text-sm text-muted-foreground mb-2">Type <span className="font-mono font-semibold text-foreground">{org?.name}</span> to confirm:</p>
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={org?.name}
              className="w-full px-3 py-2.5 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring mb-4 transition"
            />
            <div className="flex gap-3">
              <button
                onClick={onDelete}
                disabled={deleting || confirmName !== org?.name}
                className="flex items-center gap-2 bg-destructive text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete permanently
              </button>
              <button onClick={() => { setShowDeleteModal(false); setConfirmName(""); }} className="px-4 py-2.5 rounded-lg text-sm border border-border hover:bg-accent transition">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold text-foreground mb-1">Organization Settings</h1>
      <p className="text-muted-foreground text-sm mb-8">Manage your organization's profile.</p>

      <form onSubmit={handleSubmit(onSave)} className="bg-white border border-border rounded-xl p-6 space-y-5 mb-6">
        {/* Logo upload */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Organisation Logo</label>
          <div className="flex flex-col items-start gap-3">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group relative w-40 h-40 rounded-2xl border-2 border-dashed border-border bg-muted/20 flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary/50 hover:bg-muted/40 transition-all"
            >
              {logoPreview ? (
                <>
                  <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-2" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-2xl">
                    <Upload className="w-5 h-5 text-white" />
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                  <Upload className="w-6 h-6" />
                  <span className="text-[10px] font-medium">Upload</span>
                </div>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium bg-muted hover:bg-muted/80 border border-border rounded-lg px-3 py-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5" /> {logoPreview ? "Change logo" : "Upload logo"}
                </button>
                {logoPreview && (
                  <button
                    type="button"
                    onClick={removeLogo}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive hover:bg-destructive/5 border border-destructive/30 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">Max 2MB · Roughly square</p>
              {logoError && <p className="text-xs text-destructive mt-1">{logoError}</p>}
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
          <input {...register("name")} className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
          {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Website</label>
          <input {...register("website")} type="url" placeholder="https://..." className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
          {errors.website && <p className="text-destructive text-xs mt-1">{errors.website.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
          <textarea {...register("description")} rows={3} className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition resize-none" />
        </div>

        <button
          type="submit"
          disabled={updating || !isFormDirty}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {updating && <Loader2 className="w-4 h-4 animate-spin" />}
          Save changes
        </button>
      </form>

      {iAmOwner && (
        <div className="bg-white border border-destructive/30 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-destructive mb-1">Danger zone</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Deleting this organisation permanently removes all members, candidates, sessions, question banks, and reports. This cannot be undone.
          </p>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-destructive/90 transition"
          >
            <Trash2 className="w-4 h-4" /> Delete organisation
          </button>
        </div>
      )}
    </div>
  );
}
