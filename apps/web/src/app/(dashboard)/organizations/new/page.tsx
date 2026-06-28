"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { OrganizationCreateSchema, type OrganizationCreateInput } from "@interview/shared";
import { useCreateOrganization } from "@/hooks/use-organizations";
import { useActiveOrg } from "@/hooks/use-organization";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Building2, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

const MAX_SIZE = 2 * 1024 * 1024;

async function processLogo(file: File): Promise<string> {
  if (file.size > MAX_SIZE) throw new Error("Image must be under 2 MB");
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = img.width / img.height;
      if (ratio < 0.5 || ratio > 2) {
        reject(new Error("Logo must be roughly square (aspect ratio 0.5–2)"));
        return;
      }
      const MAX = 512;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Invalid image")); };
    img.src = url;
  });
}

export default function NewOrganizationPage() {
  const router = useRouter();
  const { setActiveOrgId } = useActiveOrg();
  const { mutateAsync, isPending } = useCreateOrganization();
  const fileRef = useRef<HTMLInputElement>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<OrganizationCreateInput>({
    resolver: zodResolver(OrganizationCreateSchema),
  });

  const autoSlug = (n: string) =>
    n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue("name", e.target.value);
    setValue("slug", autoSlug(e.target.value));
  };

  const handleLogoFile = async (file: File) => {
    try {
      const b64 = await processLogo(file);
      setLogoPreview(b64);
      setValue("logo", b64);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const onSubmit = async (data: OrganizationCreateInput) => {
    try {
      const res = await mutateAsync({ ...data, logo: logoPreview });
      setActiveOrgId(res.data.id);
      toast.success(`Organization "${res.data.name}" created!`);
      router.push("/dashboard");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create organization");
    }
  };

  const slugVal = watch("slug", "");

  return (
    <div className="max-w-lg">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <h1 className="text-2xl font-bold text-foreground mb-1">Create organization</h1>
      <p className="text-muted-foreground text-sm mb-8">
        Organizations help you manage candidates, interviewers, and questions as a team.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Logo upload */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Logo <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-24 h-24 rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/30 flex items-center justify-center overflow-hidden transition group"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-primary transition">
                  <Building2 className="w-8 h-8" />
                  <span className="text-xs">Upload</span>
                </div>
              )}
              {logoPreview && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                  <Upload className="w-5 h-5 text-white" />
                </div>
              )}
            </button>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">PNG, JPG or WebP · Max 2 MB · Roughly square</p>
              {logoPreview && (
                <button
                  type="button"
                  onClick={() => { setLogoPreview(null); setValue("logo", null); }}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                >
                  <X className="w-3 h-3" /> Remove logo
                </button>
              )}
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleLogoFile(e.target.files[0])}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Organization name
          </label>
          <input
            {...register("name")}
            onChange={onNameChange}
            placeholder="Acme Corp"
            className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
          {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Website <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            {...register("website")}
            type="url"
            placeholder="https://acme.com"
            className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
          {errors.website && <p className="text-destructive text-xs mt-1">{errors.website.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            {...register("description")}
            rows={3}
            placeholder="What does your organization do?"
            className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Create organization
        </button>
      </form>
    </div>
  );
}
