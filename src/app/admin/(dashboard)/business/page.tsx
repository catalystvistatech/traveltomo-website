"use client";

import { useEffect, useState } from "react";
import { getBusiness, upsertBusiness } from "@/lib/actions/business";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const categories = ["Restaurant", "Hotel", "Attraction", "Nightlife", "Cafe", "Shop", "Tour Operator", "Spa & Wellness", "Other"];

export default function BusinessPage() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", address: "", city: "Angeles City",
    category: "", contact_email: "", contact_phone: "", website: "",
  });

  useEffect(() => {
    getBusiness().then((biz) => {
      if (biz) setForm({
        name: biz.name ?? "", description: biz.description ?? "", address: biz.address ?? "",
        city: biz.city ?? "Angeles City", category: biz.category ?? "",
        contact_email: biz.contact_email ?? "", contact_phone: biz.contact_phone ?? "", website: biz.website ?? "",
      });
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await upsertBusiness(form);
    setLoading(false);
    if (result.error) {
      const msg = "_form" in result.error ? (result.error as { _form: string[] })._form[0] : "Please check the form fields";
      toast.error(msg);
    } else {
      toast.success("Business profile saved");
    }
  }

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Business Profile</h1>
        <p className="text-zinc-400 mt-1">Complete your business information before creating challenges.</p>
      </div>
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">Business Details</CardTitle>
          <CardDescription className="text-zinc-400">This information is shown to travelers.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Business Name *</Label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} required className="bg-zinc-800 border-zinc-700 text-white" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Description</Label>
              <Textarea value={form.description} onChange={(e) => update("description", e.target.value)} rows={3} className="bg-zinc-800 border-zinc-700 text-white" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-zinc-300">Address *</Label>
                <Input value={form.address} onChange={(e) => update("address", e.target.value)} required className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">City</Label>
                <Input value={form.city} onChange={(e) => update("city", e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Category *</Label>
              <Select value={form.category || undefined} onValueChange={(v: string | null) => update("category", v ?? "")}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories.map((cat) => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-zinc-300">Contact Email</Label>
                <Input type="email" value={form.contact_email} onChange={(e) => update("contact_email", e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Contact Phone</Label>
                <Input value={form.contact_phone} onChange={(e) => update("contact_phone", e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Website</Label>
              <Input type="url" value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://" className="bg-zinc-800 border-zinc-700 text-white" />
            </div>
            <Button type="submit" disabled={loading} className="w-full bg-red-600 hover:bg-red-700 text-white">
              {loading ? "Saving..." : "Save Business Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
