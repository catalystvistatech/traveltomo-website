"use client";

import { useEffect, useState } from "react";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "@/lib/actions/templates";
import {
  ESTABLISHMENT_LABELS,
  ESTABLISHMENT_TYPES,
  type EstablishmentType,
} from "@/lib/validations/marketplace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Pencil, Plus } from "lucide-react";

type TemplateRow = Awaited<ReturnType<typeof listTemplates>>[number];

const empty = {
  title: "",
  description: "",
  instructions: "",
  establishment_type: undefined as EstablishmentType | undefined,
  suggested_xp: 50,
  suggested_radius_meters: 50,
  verification_type: "gps" as "gps" | "qr_scan" | "photo_upload" | "quiz_answer",
  cover_url: "",
  is_published: true,
};

export default function TemplatesPage() {
  const [list, setList] = useState<TemplateRow[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);

  async function reload() {
    setList(await listTemplates());
  }

  useEffect(() => {
    reload();
  }, []);

  function startNew() {
    setEditing("new");
    setForm({ ...empty });
  }

  function startEdit(t: TemplateRow) {
    setEditing(t.id as string);
    setForm({
      title: t.title as string,
      description: t.description as string,
      instructions: (t.instructions as string) ?? "",
      establishment_type:
        (t.establishment_type as EstablishmentType | null) ?? undefined,
      suggested_xp: t.suggested_xp as number,
      suggested_radius_meters: t.suggested_radius_meters as number,
      verification_type:
        (t.verification_type as
          | "gps"
          | "qr_scan"
          | "photo_upload"
          | "quiz_answer") ?? "gps",
      cover_url: (t.cover_url as string) ?? "",
      is_published: (t.is_published as boolean) ?? true,
    });
  }

  async function handleSave() {
    setSaving(true);
    const result =
      editing === "new"
        ? await createTemplate(form)
        : await updateTemplate(editing!, form);
    setSaving(false);
    if ("error" in result) {
      toast.error(
        "_form" in (result.error as Record<string, unknown>)
          ? (result.error as { _form: string[] })._form[0]
          : "Validation failed"
      );
      return;
    }
    toast.success(editing === "new" ? "Template created" : "Template saved");
    setEditing(null);
    await reload();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    const r = await deleteTemplate(id);
    if ("error" in r) {
      toast.error(r.error as string);
    } else {
      toast.success("Deleted");
      await reload();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Challenge Templates</h1>
          <p className="text-zinc-400 mt-1">
            Reusable challenges merchants can clone into their own Travel Challenges.
          </p>
        </div>
        <Button
          onClick={startNew}
          className="bg-red-600 hover:bg-red-700 text-white gap-2"
        >
          <Plus className="h-4 w-4" /> New Template
        </Button>
      </div>

      {editing && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">
              {editing === "new" ? "New Template" : "Edit Template"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-zinc-300">Title *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Establishment Type</Label>
                <Select
                  value={form.establishment_type ?? undefined}
                  onValueChange={(v: string | null) =>
                    setForm({
                      ...form,
                      establishment_type: (v ?? undefined) as
                        | EstablishmentType
                        | undefined,
                    })
                  }
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    {ESTABLISHMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ESTABLISHMENT_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Description *</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Instructions</Label>
              <Textarea
                rows={2}
                value={form.instructions}
                onChange={(e) =>
                  setForm({ ...form, instructions: e.target.value })
                }
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-zinc-300">Suggested XP</Label>
                <Input
                  type="number"
                  value={form.suggested_xp}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      suggested_xp: parseInt(e.target.value || "0"),
                    })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Suggested Radius (m)</Label>
                <Input
                  type="number"
                  value={form.suggested_radius_meters}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      suggested_radius_meters: parseInt(e.target.value || "0"),
                    })
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Verification</Label>
                <Select
                  value={form.verification_type}
                  onValueChange={(v: string | null) =>
                    v &&
                    setForm({
                      ...form,
                      verification_type: v as typeof form.verification_type,
                    })
                  }
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gps">GPS check-in</SelectItem>
                    <SelectItem value="qr_scan">QR scan</SelectItem>
                    <SelectItem value="photo_upload">Photo upload</SelectItem>
                    <SelectItem value="quiz_answer">Quiz answer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Cover Image URL</Label>
              <Input
                value={form.cover_url}
                onChange={(e) =>
                  setForm({ ...form, cover_url: e.target.value })
                }
                placeholder="https://"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="published"
                type="checkbox"
                checked={form.is_published}
                onChange={(e) =>
                  setForm({ ...form, is_published: e.target.checked })
                }
              />
              <Label htmlFor="published" className="text-zinc-300">
                Publish so merchants can clone
              </Label>
            </div>
            <div className="flex gap-3 pt-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {saving ? "Saving..." : "Save Template"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setEditing(null)}
                className="text-zinc-400"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {list.length === 0 && (
          <p className="text-zinc-500 text-sm">
            No templates yet. Create one to get started.
          </p>
        )}
        {list.map((t) => (
          <Card key={t.id as string} className="bg-zinc-900 border-zinc-800">
            <CardContent className="flex items-start justify-between gap-4 pt-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-white">
                    {t.title as string}
                  </h3>
                  {!(t.is_published as boolean) && (
                    <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                      Draft
                    </Badge>
                  )}
                  {t.establishment_type && (
                    <Badge className="bg-zinc-800 text-zinc-200">
                      {
                        ESTABLISHMENT_LABELS[
                          t.establishment_type as EstablishmentType
                        ]
                      }
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-zinc-400 line-clamp-2 mt-1">
                  {t.description as string}
                </p>
                <p className="text-xs text-zinc-500 mt-2">
                  XP {t.suggested_xp as number} ? Radius{" "}
                  {t.suggested_radius_meters as number}m ?{" "}
                  {(t.verification_type as string) ?? "gps"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => startEdit(t)}
                  className="text-zinc-400 hover:text-white"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(t.id as string)}
                  className="text-zinc-400 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
