"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPlaces, createChallenge, submitChallengeForReview } from "@/lib/actions/challenges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import QRCode from "qrcode";

type Place = { id: string; name: string; city: string | null; category: string | null };

const steps = ["Details", "Verification", "Reward", "QR Preview", "Review"];

export default function NewChallengePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const [details, setDetails] = useState({
    title: "",
    description: "",
    instructions: "",
    place_id: "",
    type: "checkin" as const,
    xp_reward: 50,
    radius_meters: 50,
  });

  const [verification, setVerification] = useState({
    verification_type: "gps" as string,
    quiz_question: "",
    quiz_choices: ["", "", "", ""],
    quiz_answer: "",
  });

  const [reward, setReward] = useState({
    title: "",
    description: "",
    discount_type: "percentage" as string,
    discount_value: 10,
    max_redemptions: 100,
    expires_at: "",
  });

  useEffect(() => {
    getPlaces().then(setPlaces);
  }, []);

  useEffect(() => {
    if (step === 3) {
      QRCode.toDataURL(`TT-PREVIEW-${details.title}`, {
        width: 256,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      }).then(setQrDataUrl);
    }
  }, [step, details.title]);

  function updateDetails(field: string, value: string | number) {
    setDetails((prev) => ({ ...prev, [field]: value }));
  }

  function updateVerification(field: string, value: string | string[]) {
    setVerification((prev) => ({ ...prev, [field]: value }));
  }

  function updateQuizChoice(index: number, value: string) {
    setVerification((prev) => {
      const choices = [...prev.quiz_choices];
      choices[index] = value;
      return { ...prev, quiz_choices: choices };
    });
  }

  async function handleSubmit() {
    setLoading(true);
    const result = await createChallenge({
      details,
      verification: {
        ...verification,
        quiz_choices: verification.quiz_choices.filter(Boolean),
      },
      reward,
    });

    if (result.error) {
      toast.error("Failed to create challenge. Check all fields.");
      setLoading(false);
      return;
    }

    if (result.challengeId) {
      await submitChallengeForReview(result.challengeId);
    }

    toast.success("Challenge submitted for review!");
    router.push("/challenges");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Create Challenge</h1>
        <p className="text-zinc-400 mt-1">
          Set up a new challenge for travelers to complete.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex gap-2">
        {steps.map((s, i) => (
          <Badge
            key={s}
            variant={i === step ? "default" : "outline"}
            className={
              i === step
                ? "bg-red-600 text-white"
                : i < step
                  ? "bg-green-600/20 text-green-400 border-green-600/30"
                  : "border-zinc-700 text-zinc-500"
            }
          >
            {i + 1}. {s}
          </Badge>
        ))}
      </div>

      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-white">{steps[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Step 1: Details */}
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label className="text-zinc-300">Title *</Label>
                <Input value={details.title} onChange={(e) => updateDetails("title", e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Description *</Label>
                <Textarea value={details.description} onChange={(e) => updateDetails("description", e.target.value)} rows={3} className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Instructions</Label>
                <Textarea value={details.instructions} onChange={(e) => updateDetails("instructions", e.target.value)} rows={2} className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Place *</Label>
                <Select value={details.place_id} onValueChange={(v: string | null) => v && updateDetails("place_id", v)}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select a place" />
                  </SelectTrigger>
                  <SelectContent>
                    {places.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} ({p.city})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Type</Label>
                  <Select value={details.type} onValueChange={(v: string | null) => v && updateDetails("type", v)}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checkin">Check-in</SelectItem>
                      <SelectItem value="photo">Photo</SelectItem>
                      <SelectItem value="qr">QR Scan</SelectItem>
                      <SelectItem value="quiz">Quiz</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">XP Reward</Label>
                  <Input type="number" value={details.xp_reward} onChange={(e) => updateDetails("xp_reward", Number(e.target.value))} className="bg-zinc-800 border-zinc-700 text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Radius (m)</Label>
                  <Input type="number" value={details.radius_meters} onChange={(e) => updateDetails("radius_meters", Number(e.target.value))} className="bg-zinc-800 border-zinc-700 text-white" />
                </div>
              </div>
            </>
          )}

          {/* Step 2: Verification */}
          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label className="text-zinc-300">Verification Method</Label>
                <Select value={verification.verification_type} onValueChange={(v: string | null) => v && updateVerification("verification_type", v)}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gps">GPS Location</SelectItem>
                    <SelectItem value="qr_scan">QR Code Scan</SelectItem>
                    <SelectItem value="photo_upload">Photo Upload</SelectItem>
                    <SelectItem value="quiz_answer">Quiz Answer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {verification.verification_type === "quiz_answer" && (
                <>
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Quiz Question</Label>
                    <Input value={verification.quiz_question} onChange={(e) => updateVerification("quiz_question", e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
                  </div>
                  {verification.quiz_choices.map((choice, i) => (
                    <div key={i} className="space-y-1">
                      <Label className="text-zinc-300 text-xs">Choice {i + 1}</Label>
                      <Input value={choice} onChange={(e) => updateQuizChoice(i, e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
                    </div>
                  ))}
                  <div className="space-y-2">
                    <Label className="text-zinc-300">Correct Answer</Label>
                    <Select value={verification.quiz_answer} onValueChange={(v: string | null) => v && updateVerification("quiz_answer", v)}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue placeholder="Select answer" /></SelectTrigger>
                      <SelectContent>
                        {verification.quiz_choices.filter(Boolean).map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </>
          )}

          {/* Step 3: Reward */}
          {step === 2 && (
            <>
              <div className="space-y-2">
                <Label className="text-zinc-300">Reward Title *</Label>
                <Input value={reward.title} onChange={(e) => setReward((p) => ({ ...p, title: e.target.value }))} className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Description</Label>
                <Textarea value={reward.description} onChange={(e) => setReward((p) => ({ ...p, description: e.target.value }))} rows={2} className="bg-zinc-800 border-zinc-700 text-white" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Discount Type</Label>
                  <Select value={reward.discount_type} onValueChange={(v: string | null) => { if (v) setReward((p) => ({ ...p, discount_type: v })); }}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage Off</SelectItem>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                      <SelectItem value="freebie">Freebie</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Discount Value</Label>
                  <Input type="number" value={reward.discount_value} onChange={(e) => setReward((p) => ({ ...p, discount_value: Number(e.target.value) }))} className="bg-zinc-800 border-zinc-700 text-white" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-zinc-300">Max Redemptions</Label>
                  <Input type="number" value={reward.max_redemptions} onChange={(e) => setReward((p) => ({ ...p, max_redemptions: Number(e.target.value) }))} className="bg-zinc-800 border-zinc-700 text-white" />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Expires At</Label>
                  <Input type="date" value={reward.expires_at} onChange={(e) => setReward((p) => ({ ...p, expires_at: e.target.value }))} className="bg-zinc-800 border-zinc-700 text-white" />
                </div>
              </div>
            </>
          )}

          {/* Step 4: QR Preview */}
          {step === 3 && (
            <div className="flex flex-col items-center gap-4 py-4">
              <p className="text-zinc-400 text-sm text-center">
                This QR code will be generated when the challenge is created.
                The actual code is generated server-side for security.
              </p>
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="QR Code Preview"
                  className="w-48 h-48 rounded-lg border border-zinc-700"
                />
              )}
              <p className="text-zinc-500 text-xs">Preview only</p>
            </div>
          )}

          {/* Step 5: Review */}
          {step === 4 && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-400">Title</span>
                <span className="text-white font-medium">{details.title}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-400">Type</span>
                <span className="text-white">{details.type}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-400">Verification</span>
                <span className="text-white">{verification.verification_type}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-400">XP Reward</span>
                <span className="text-white">{details.xp_reward}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-400">Reward</span>
                <span className="text-white">{reward.title} ({reward.discount_type})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Max Redemptions</span>
                <span className="text-white">{reward.max_redemptions}</span>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {loading ? "Submitting..." : "Submit for Review"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
