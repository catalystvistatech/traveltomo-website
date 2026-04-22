"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPlaces,
  createChallenge,
  submitChallengeForReview,
} from "@/lib/actions/challenges";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import QRCode from "qrcode";

const STEPS = ["Details", "Verification", "Reward", "QR Preview", "Review"];

const challengeTypes = [
  { value: "checkin", label: "Check-in" },
  { value: "photo", label: "Photo" },
  { value: "qr", label: "QR Scan" },
  { value: "quiz", label: "Quiz" },
];

const verificationTypes = [
  { value: "gps", label: "GPS Location" },
  { value: "qr_scan", label: "QR Code Scan" },
  { value: "photo_upload", label: "Photo Upload" },
  { value: "quiz_answer", label: "Quiz Answer" },
];

const discountTypes = [
  { value: "percentage", label: "Percentage Off" },
  { value: "fixed", label: "Fixed Amount Off" },
  { value: "freebie", label: "Freebie" },
];

type Place = { id: string; name: string; city: string | null; category: string | null };

export default function NewChallengePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const [details, setDetails] = useState({
    title: "",
    description: "",
    instructions: "",
    place_id: "",
    type: "",
    xp_reward: 50,
    radius_meters: 50,
  });

  const [verification, setVerification] = useState({
    verification_type: "",
    quiz_question: "",
    quiz_choices: ["", "", "", ""],
    quiz_answer: "",
  });

  const [reward, setReward] = useState({
    title: "",
    description: "",
    discount_type: "",
    discount_value: 0,
    max_redemptions: 100,
    expires_at: "",
  });

  useEffect(() => {
    getPlaces().then(setPlaces);
  }, []);

  useEffect(() => {
    if (step === 3) {
      const previewValue = `TT-PREVIEW-${details.title || "challenge"}`;
      QRCode.toDataURL(previewValue, {
        width: 256,
        color: { dark: "#ffffff", light: "#00000000" },
      }).then(setQrDataUrl);
    }
  }, [step, details.title]);

  function updateDetails(field: string, value: string | number) {
    setDetails((prev) => ({ ...prev, [field]: value }));
  }

  function updateVerification(field: string, value: string) {
    setVerification((prev) => ({ ...prev, [field]: value }));
  }

  function updateQuizChoice(index: number, value: string) {
    setVerification((prev) => {
      const choices = [...prev.quiz_choices];
      choices[index] = value;
      return { ...prev, quiz_choices: choices };
    });
  }

  function updateReward(field: string, value: string | number) {
    setReward((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setLoading(true);

    const verificationPayload =
      verification.verification_type === "quiz_answer"
        ? verification
        : {
            verification_type: verification.verification_type,
            quiz_question: null,
            quiz_choices: null,
            quiz_answer: null,
          };

    const result = await createChallenge({
      details,
      verification: verificationPayload,
      reward,
    });

    if (result.error) {
      toast.error("Failed to create challenge. Check your inputs.");
      setLoading(false);
      return;
    }

    if (result.challengeId) {
      await submitChallengeForReview(result.challengeId);
    }

    toast.success("Challenge created and submitted for review!");
    router.push("/admin/challenges");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Create Challenge</h1>
        <p className="text-zinc-400 mt-1">
          Follow the steps to create a new challenge for travelers.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => i < step && setStep(i)}
            className="flex items-center gap-2"
          >
            <Badge
              className={
                i === step
                  ? "bg-red-600 text-white"
                  : i < step
                    ? "bg-green-600/20 text-green-400 cursor-pointer"
                    : "bg-zinc-700 text-zinc-400"
              }
            >
              {i + 1}. {label}
            </Badge>
          </button>
        ))}
      </div>

      {step === 0 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Challenge Details</CardTitle>
            <CardDescription className="text-zinc-400">
              Basic information about your challenge.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Title *</Label>
              <Input
                value={details.title}
                onChange={(e) => updateDetails("title", e.target.value)}
                placeholder="e.g. Visit the Hidden Garden"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Description</Label>
              <Textarea
                value={details.description}
                onChange={(e) => updateDetails("description", e.target.value)}
                rows={3}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Instructions</Label>
              <Textarea
                value={details.instructions}
                onChange={(e) => updateDetails("instructions", e.target.value)}
                rows={2}
                placeholder="What should the traveler do?"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-zinc-300">Place *</Label>
                <Select
                  value={details.place_id || undefined}
                  onValueChange={(v: string | null) => {
                    if (v) updateDetails("place_id", v);
                  }}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select place" />
                  </SelectTrigger>
                  <SelectContent>
                    {places.map((place) => (
                      <SelectItem key={place.id} value={place.id}>
                        {place.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Type *</Label>
                <Select
                  value={details.type || undefined}
                  onValueChange={(v: string | null) => {
                    if (v) updateDetails("type", v);
                  }}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {challengeTypes.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-zinc-300">XP Reward</Label>
                <Input
                  type="number"
                  value={details.xp_reward}
                  onChange={(e) =>
                    updateDetails("xp_reward", parseInt(e.target.value) || 0)
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Radius (meters)</Label>
                <Input
                  type="number"
                  value={details.radius_meters}
                  onChange={(e) =>
                    updateDetails(
                      "radius_meters",
                      parseInt(e.target.value) || 50
                    )
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Verification</CardTitle>
            <CardDescription className="text-zinc-400">
              How will travelers prove they completed the challenge?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Verification Type *</Label>
              <Select
                value={verification.verification_type || undefined}
                onValueChange={(v: string | null) => {
                  if (v) updateVerification("verification_type", v);
                }}
              >
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                  <SelectValue placeholder="Select verification method" />
                </SelectTrigger>
                <SelectContent>
                  {verificationTypes.map((vt) => (
                    <SelectItem key={vt.value} value={vt.value}>
                      {vt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {verification.verification_type === "quiz_answer" && (
              <>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Quiz Question *</Label>
                  <Input
                    value={verification.quiz_question}
                    onChange={(e) =>
                      updateVerification("quiz_question", e.target.value)
                    }
                    placeholder="e.g. What color is the main gate?"
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Answer Choices</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {verification.quiz_choices.map((choice, i) => (
                      <Input
                        key={i}
                        value={choice}
                        onChange={(e) => updateQuizChoice(i, e.target.value)}
                        placeholder={`Choice ${i + 1}`}
                        className="bg-zinc-800 border-zinc-700 text-white"
                      />
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-zinc-300">Correct Answer *</Label>
                  <Select
                    value={verification.quiz_answer || undefined}
                    onValueChange={(v: string | null) => {
                      if (v) updateVerification("quiz_answer", v);
                    }}
                  >
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                      <SelectValue placeholder="Select correct answer" />
                    </SelectTrigger>
                    <SelectContent>
                      {verification.quiz_choices
                        .filter((c) => c.trim())
                        .map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Reward</CardTitle>
            <CardDescription className="text-zinc-400">
              What do travelers get for completing this challenge?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-zinc-300">Reward Title *</Label>
              <Input
                value={reward.title}
                onChange={(e) => updateReward("title", e.target.value)}
                placeholder="e.g. 10% off your next meal"
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-300">Description</Label>
              <Textarea
                value={reward.description}
                onChange={(e) => updateReward("description", e.target.value)}
                rows={2}
                className="bg-zinc-800 border-zinc-700 text-white"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-zinc-300">Discount Type *</Label>
                <Select
                  value={reward.discount_type || undefined}
                  onValueChange={(v: string | null) => {
                    if (v) updateReward("discount_type", v);
                  }}
                >
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {discountTypes.map((dt) => (
                      <SelectItem key={dt.value} value={dt.value}>
                        {dt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Discount Value</Label>
                <Input
                  type="number"
                  value={reward.discount_value}
                  onChange={(e) =>
                    updateReward(
                      "discount_value",
                      parseFloat(e.target.value) || 0
                    )
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-zinc-300">Max Redemptions</Label>
                <Input
                  type="number"
                  value={reward.max_redemptions}
                  onChange={(e) =>
                    updateReward(
                      "max_redemptions",
                      parseInt(e.target.value) || 0
                    )
                  }
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-zinc-300">Expires At</Label>
                <Input
                  type="datetime-local"
                  value={reward.expires_at}
                  onChange={(e) => updateReward("expires_at", e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">QR Code Preview</CardTitle>
            <CardDescription className="text-zinc-400">
              This QR code will be generated for your challenge.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center py-8">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR Code Preview"
                className="w-64 h-64"
              />
            ) : (
              <div className="w-64 h-64 bg-zinc-800 rounded-lg animate-pulse" />
            )}
            <p className="text-zinc-400 text-sm mt-4">
              Travelers will scan this code to verify the challenge.
            </p>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Review</CardTitle>
            <CardDescription className="text-zinc-400">
              Review your challenge before submitting.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2">
                Details
              </h3>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Title</span>
                  <span className="text-white">{details.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Type</span>
                  <span className="text-white">{details.type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">XP Reward</span>
                  <span className="text-white">{details.xp_reward}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Place</span>
                  <span className="text-white">
                    {places.find((p) => p.id === details.place_id)?.name ??
                      "None"}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2">
                Verification
              </h3>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Method</span>
                  <span className="text-white">
                    {verification.verification_type}
                  </span>
                </div>
                {verification.verification_type === "quiz_answer" && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Question</span>
                    <span className="text-white truncate ml-4">
                      {verification.quiz_question}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2">
                Reward
              </h3>
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Title</span>
                  <span className="text-white">{reward.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Discount</span>
                  <span className="text-white">
                    {reward.discount_type === "percentage"
                      ? `${reward.discount_value}%`
                      : reward.discount_type === "fixed"
                        ? `$${reward.discount_value}`
                        : "Freebie"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Max Redemptions</span>
                  <span className="text-white">{reward.max_redemptions}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
        >
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            className="bg-red-600 hover:bg-red-700"
          >
            Next
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700"
          >
            {loading ? "Creating..." : "Create & Submit"}
          </Button>
        )}
      </div>
    </div>
  );
}
