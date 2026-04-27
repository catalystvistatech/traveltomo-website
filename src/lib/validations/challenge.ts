import { z } from "zod";

export const challengeDetailsSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(500),
  instructions: z.string().max(500).optional(),
  place_id: z.string().uuid("Select a valid place"),
  type: z.enum(["checkin", "photo", "qr", "quiz"]),
  xp_reward: z.coerce.number().min(10).max(500),
  radius_meters: z.coerce.number().min(10).max(1000),
});

export const challengeVerificationSchema = z
  .object({
    verification_type: z.enum(["gps", "qr_scan", "photo_upload", "quiz_answer"]),
    quiz_question: z.string().optional(),
    quiz_choices: z.array(z.string()).optional(),
    quiz_answer: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.verification_type === "quiz_answer") {
        return (
          data.quiz_question &&
          data.quiz_choices &&
          data.quiz_choices.length >= 2 &&
          data.quiz_answer
        );
      }
      return true;
    },
    { message: "Quiz requires a question, at least 2 choices, and an answer" }
  );

export const rewardSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().max(300).optional(),
  discount_type: z.enum(["percentage", "fixed", "freebie"]),
  discount_value: z.coerce.number().min(0).optional(),
  max_redemptions: z.coerce.number().min(1).optional(),
  expires_at: z.string().optional(),
});

