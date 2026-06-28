"use client";

import { useState } from "react";
import { useRoles, usePermissions, useCreateRole, useUpdateRole, useDeleteRole } from "@/hooks/use-roles";
import { useActiveOrg } from "@/hooks/use-organization";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { RoleCreateSchema, type RoleCreateInput, PERMISSIONS } from "@interview/shared";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Shield, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

// Group permissions by resource for display
const PERMISSION_GROUPS = PERMISSIONS.reduce<Record<string, string[]>>((acc, p) => {
  const [resource] = p.split(":");
  (acc[resource] ??= []).push(p);
  return acc;
}, {});

function RoleForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<RoleCreateInput>;
  onSave: (data: RoleCreateInput) => Promise<void>;
  onCancel: () => void;
  isPending: boolean;
}) {
  const { control, register, handleSubmit, formState: { errors } } = useForm<RoleCreateInput>({
    resolver: zodResolver(RoleCreateSchema),
    defaultValues: { name: "", description: "", permissions: [], isGlobal: false, ...initial },
  });

  return (
    <form onSubmit={handleSubmit(onSave)} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Role name</label>
        <input {...register("name")} placeholder="e.g. Senior Interviewer" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
        {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">Description <span className="text-muted-foreground font-normal">(optional)</span></label>
        <input {...register("description")} placeholder="What can this role do?" className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-3">Permissions</label>
        <Controller
          control={control}
          name="permissions"
          render={({ field }) => (
            <div className="space-y-4">
              {Object.entries(PERMISSION_GROUPS).map(([resource, perms]) => (
                <div key={resource}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 capitalize">{resource}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {perms.map((perm) => {
                      const checked = field.value.includes(perm as any);
                      return (
                        <label key={perm} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors select-none", checked ? "border-primary bg-primary/5 text-primary" : "border-input hover:border-primary/50")}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                field.onChange([...field.value, perm]);
                              } else {
                                field.onChange(field.value.filter((p: string) => p !== perm));
                              }
                            }}
                            className="sr-only"
                          />
                          <div className={cn("w-4 h-4 rounded border flex items-center justify-center shrink-0", checked ? "bg-primary border-primary" : "border-input")}>
                            {checked && <span className="text-primary-foreground text-[10px]">✓</span>}
                          </div>
                          <span className="text-xs">{perm.split(":")[1]}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        />
        {errors.permissions && <p className="text-destructive text-xs mt-1">{errors.permissions.message}</p>}
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={isPending} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
          {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Save role
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border hover:bg-accent transition">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function RolesPage() {
  const { activeOrgId } = useActiveOrg();
  const { data, isLoading } = useRoles(activeOrgId, {});
  const { mutateAsync: create, isPending: creating } = useCreateRole(activeOrgId!);
  const { mutateAsync: update, isPending: updating } = useUpdateRole(activeOrgId!);
  const { mutateAsync: remove } = useDeleteRole(activeOrgId!);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const roles: any[] = data?.data ?? [];
  const globalRoles = roles.filter((r) => r.isGlobal);
  const orgRoles = roles.filter((r) => !r.isGlobal);

  const handleCreate = async (data: RoleCreateInput) => {
    try {
      await create(data);
      toast.success(`Role "${data.name}" created`);
      setShowCreate(false);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create role");
    }
  };

  const handleUpdate = async (id: string, data: RoleCreateInput) => {
    try {
      await update({ id, data });
      toast.success("Role updated");
      setEditingId(null);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update role");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete role "${name}"?`)) return;
    try {
      await remove(id);
      toast.success(`Role "${name}" deleted`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete role");
    }
  };

  if (!activeOrgId) {
    return <div className="text-center py-16 text-muted-foreground">No organization selected.</div>;
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Roles</h1>
          <p className="text-muted-foreground text-sm mt-1">Define what members can do within your organization.</p>
        </div>
        {!showCreate && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition">
            <Plus className="w-4 h-4" /> New role
          </button>
        )}
      </div>

      {showCreate && (
        <div className="bg-white border border-border rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-foreground mb-4">Create new role</h2>
          <RoleForm onSave={handleCreate} onCancel={() => setShowCreate(false)} isPending={creating} />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* Global roles (read-only) */}
          {globalRoles.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Global roles</h2>
              </div>
              <div className="space-y-3">
                {globalRoles.map((role: any) => (
                  <div key={role.id} className="bg-white border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Shield className="w-4 h-4 text-primary" />
                          <p className="font-medium text-foreground">{role.name}</p>
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">global</span>
                        </div>
                        {role.description && <p className="text-sm text-muted-foreground mt-0.5 ml-6">{role.description}</p>}
                        <div className="flex flex-wrap gap-1 mt-2 ml-6">
                          {role.permissions.slice(0, 6).map((rp: any) => (
                            <span key={rp.permission.id} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{rp.permission.action}</span>
                          ))}
                          {role.permissions.length > 6 && (
                            <span className="text-xs text-muted-foreground">+{role.permissions.length - 6} more</span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground">{role._count?.assignments ?? 0} assigned</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Org-specific roles */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Organization roles</h2>
            </div>
            {orgRoles.length === 0 ? (
              <div className="bg-white border border-dashed border-border rounded-xl p-8 text-center text-muted-foreground">
                <p className="font-medium">No custom roles yet</p>
                <p className="text-sm mt-1">Create a role to define custom permissions for your team.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {orgRoles.map((role: any) => (
                  <div key={role.id} className="bg-white border border-border rounded-xl p-4">
                    {editingId === role.id ? (
                      <RoleForm
                        initial={{ name: role.name, description: role.description ?? "", permissions: role.permissions.map((rp: any) => rp.permission.action) }}
                        onSave={(d) => handleUpdate(role.id, d)}
                        onCancel={() => setEditingId(null)}
                        isPending={updating}
                      />
                    ) : (
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-muted-foreground" />
                            <p className="font-medium text-foreground">{role.name}</p>
                          </div>
                          {role.description && <p className="text-sm text-muted-foreground mt-0.5 ml-6">{role.description}</p>}
                          <div className="flex flex-wrap gap-1 mt-2 ml-6">
                            {role.permissions.slice(0, 6).map((rp: any) => (
                              <span key={rp.permission.id} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{rp.permission.action}</span>
                            ))}
                            {role.permissions.length > 6 && (
                              <span className="text-xs text-muted-foreground">+{role.permissions.length - 6} more</span>
                            )}
                            {role.permissions.length === 0 && (
                              <span className="text-xs text-muted-foreground italic">No permissions assigned</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground mr-2">{role._count?.assignments ?? 0} assigned</span>
                          <button onClick={() => setEditingId(role.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDelete(role.id, role.name)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
