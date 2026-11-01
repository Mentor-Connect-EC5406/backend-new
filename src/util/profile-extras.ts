import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "must be YYYY-MM");
const year = z.string().regex(/^\d{4}$/, "must be YYYY");
const entryId = z.string().min(1, "must not be blank").max(64);

// links are shown as clickable, so only http and https are allowed
const link = text(500).refine((s) => s === "" || /^https?:\/\//i.test(s), { error: "must start with http:// or https://" });

export const skillsSchema = z.array(text(100).min(1, "must not be blank")).max(10, "must have 10 or fewer");

// sections shared by student and mentor profiles
export const profileExtrasSchema = z.object({
  headline: text(120).optional(),
  location: text(200).optional(),
  links: z.object({ linkedin: link, github: link, website: link }).optional(),
  experience: z
    .array(
      z.object({
        id: entryId,
        role: text(200),
        organization: text(200),
        startMonth: month,
        endMonth: month.nullable(),
        description: text(400),
      }),
    )
    .max(10, "must have 10 or fewer")
    .optional(),
  education: z
    .array(
      z.object({
        id: entryId,
        school: text(200),
        degree: text(200),
        field: text(200),
        startYear: year,
        endYear: year.nullable(),
      }),
    )
    .max(10, "must have 10 or fewer")
    .optional(),
  certificates: z
    .array(z.object({ id: entryId, name: text(200), issuer: text(200), issuedMonth: month, credentialUrl: link }))
    .max(10, "must have 10 or fewer")
    .optional(),
  projects: z
    .array(z.object({ id: entryId, title: text(200), description: text(400), url: link, skills: skillsSchema }))
    .max(10, "must have 10 or fewer")
    .optional(),
  languages: z
    .array(
      z.object({
        name: text(100).min(1, "must not be blank"),
        level: z.enum(["Basic", "Conversational", "Fluent", "Native"], {
          error: "must be Basic, Conversational, Fluent or Native",
        }),
      }),
    )
    .max(6, "must have 6 or fewer")
    .optional(),
});

export type ProfileExtras = Required<z.infer<typeof profileExtrasSchema>>;

export const EMPTY_PROFILE_EXTRAS: ProfileExtras = {
  headline: "",
  location: "",
  links: { linkedin: "", github: "", website: "" },
  experience: [],
  education: [],
  certificates: [],
  projects: [],
  languages: [],
};
