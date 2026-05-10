import { z } from "zod";

export const ESTABLISHMENT_TYPES = [
  "restaurant",
  "cafe",
  "hotel",
  "motel",
  "adventure",
  "bar",
  "shop",
  "spa",
  "other",
] as const;

export type EstablishmentType = (typeof ESTABLISHMENT_TYPES)[number];

export const ESTABLISHMENT_LABELS: Record<EstablishmentType, string> = {
  restaurant: "Restaurant",
  cafe: "Cafe",
  hotel: "Hotel",
  motel: "Motel",
  adventure: "Adventure",
  bar: "Bar",
  shop: "Shop",
  spa: "Spa",
  other: "Other",
};

export const WEEK_DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
] as const;

const optionalTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)")
  .optional()
  .or(z.literal(""));

export const templateSchema = z.object({
  title: z.string().min(3, "Title needs at least 3 characters").max(120, "Title is too long"),
  description: z.string().min(10, "Description needs at least 10 characters").max(500, "Description is too long"),
  instructions: z.string().max(500, "Instructions are too long").optional().or(z.literal("")),
  establishment_type: z.enum(ESTABLISHMENT_TYPES).optional(),
  suggested_xp: z.coerce.number().int().min(10).max(500).default(50),
  suggested_radius_meters: z.coerce.number().int().min(10).max(1000).default(50),
  verification_type: z
    .enum(["gps", "qr_scan", "photo_upload", "quiz_answer"])
    .optional(),
  quiz_question: z.string().max(300).optional().or(z.literal("")),
  quiz_choices: z.array(z.string().min(1)).optional(),
  quiz_answer: z.string().optional().or(z.literal("")),
  cover_url: z.string().url().optional().or(z.literal("")),
  is_published: z.boolean().default(true),
});

const dayHoursSchema = z.object({
  open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().or(z.literal("")),
  closed: z.boolean().default(false),
});

export const businessHoursSchema = z.object({
  monday: dayHoursSchema,
  tuesday: dayHoursSchema,
  wednesday: dayHoursSchema,
  thursday: dayHoursSchema,
  friday: dayHoursSchema,
  saturday: dayHoursSchema,
  sunday: dayHoursSchema,
});
export type BusinessHoursInput = z.infer<typeof businessHoursSchema>;

export const extendedBusinessSchema = z.object({
  name: z.string().min(2, "Business name is too short").max(100, "Business name is too long"),
  description: z.string().max(500, "Description is too long").optional().or(z.literal("")),
  address: z.string().min(5, "Please enter a full address").max(200, "Address is too long"),
  city: z.string().min(2, "Please enter a city").max(100, "City name is too long"),
  establishment_type: z.enum(ESTABLISHMENT_TYPES, { message: "Please select a business type" }),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  service_radius_meters: z.coerce.number().int().min(100, "Radius must be at least 100m").max(20000, "Radius cannot exceed 20km").default(2000),
  timezone: z.string().default("Asia/Manila"),
  contact_email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  contact_phone: z.string().max(30, "Phone number is too long").optional().or(z.literal("")),
  website: z.string().url("Please enter a valid URL (include https://)").optional().or(z.literal("")),
  hours: businessHoursSchema,
  google_place_id: z
    .string()
    .trim()
    .max(255)
    .optional()
    .or(z.literal(""))
    .nullable(),
});
export type ExtendedBusinessInput = z.infer<typeof extendedBusinessSchema>;

export const travelChallengeSchema = z.object({
  title: z.string().min(3, "Title needs at least 3 characters").max(120, "Title is too long"),
  description: z.string().max(500).optional().or(z.literal("")),
  cover_url: z.string().url().optional().or(z.literal("")),
  completion_mode: z.enum(["any", "all"]).default("any"),
  date_range_start: z.string().optional().or(z.literal("")),
  date_range_end: z.string().optional().or(z.literal("")),
  max_total_completions: z.coerce.number().int().positive().optional(),
  big_reward_title: z.string().max(100).optional().or(z.literal("")),
  big_reward_description: z.string().max(300).optional().or(z.literal("")),
  big_reward_discount_type: z
    .enum(["percentage", "fixed", "freebie"])
    .optional(),
  big_reward_discount_value: z.coerce.number().min(0).optional(),
});

export const childChallengeSchema = z.object({
  title: z.string().min(3, "Title needs at least 3 characters").max(120, "Title is too long"),
  description: z.string().min(10, "Challenge description needs at least 10 characters").max(500, "Description is too long"),
  instructions: z.string().max(500, "Instructions are too long").optional().or(z.literal("")),
  type: z.enum(["checkin", "photo", "qr", "quiz"]).default("checkin"),
  verification_type: z
    .enum(["gps", "qr_scan", "photo_upload", "quiz_answer"])
    .default("gps"),
  establishment_type: z.enum(ESTABLISHMENT_TYPES).optional(),
  xp_reward: z.coerce.number().int().min(10, "XP reward must be at least 10").max(500, "XP reward cannot exceed 500").default(50),
  radius_meters: z.coerce.number().int().min(10, "Radius must be at least 10m").max(1000, "Radius cannot exceed 1000m").default(50),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  duration_minutes: z.coerce.number().int().min(1, "Duration must be at least 1 minute").max(480, "Duration cannot exceed 8 hours").optional(),
  time_of_day_start: optionalTime,
  time_of_day_end: optionalTime,
  days_of_week: z.array(z.coerce.number().int().min(1).max(7)).default([1, 2, 3, 4, 5, 6, 7]),
  max_completions: z.coerce.number().int().positive("Max completions must be a positive number").optional(),
  quiz_question: z.string().max(300, "Question is too long").optional().or(z.literal("")),
  quiz_choices: z.array(z.string().min(1)).optional(),
  quiz_answer: z.string().optional().or(z.literal("")),
  reward_title: z.string().min(3, "Reward title needs at least 3 characters").max(100, "Reward title is too long"),
  reward_description: z.string().max(300, "Reward description is too long").optional().or(z.literal("")),
  reward_discount_type: z.enum(["percentage", "fixed", "freebie"]).default("freebie"),
  reward_discount_value: z.coerce.number().min(0, "Discount value cannot be negative").optional(),
  reward_max_redemptions: z.coerce.number().int().positive("Max redemptions must be a positive number").optional(),
  reward_expires_at: z.string().optional().or(z.literal("")),
});

export const subscriptionSchema = z.object({
  tier: z.enum(["basic", "featured", "premium"]),
  months: z.coerce.number().int().min(1).max(12).default(1),
});

export const DEFAULT_HOURS: BusinessHoursInput = {
  monday: { open: "09:00", close: "22:00", closed: false },
  tuesday: { open: "09:00", close: "22:00", closed: false },
  wednesday: { open: "09:00", close: "22:00", closed: false },
  thursday: { open: "09:00", close: "22:00", closed: false },
  friday: { open: "09:00", close: "22:00", closed: false },
  saturday: { open: "09:00", close: "22:00", closed: false },
  sunday: { open: "09:00", close: "22:00", closed: false },
};
