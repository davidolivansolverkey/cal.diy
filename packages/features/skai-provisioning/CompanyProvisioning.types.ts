import { z } from "zod";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(SLUG_REGEX, "Must be lowercase alphanumeric words separated by single hyphens");

export const companyMemberInputSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email(),
  timeZone: z.string().min(1).optional(),
  // Host.priority is read by the booking engine's lucky-user selection and only
  // accepts 0-4; 2 is the value Cal.com's own event-type UI writes by default.
  priority: z.number().int().min(0).max(4).optional(),
  // Relative share of round-robin bookings. 100 is the engine's neutral weight.
  weight: z.number().int().min(0).max(1000).optional(),
});

export const provisionCompanyInputSchema = z.object({
  // SKAI Central's tenants.id, stored on the team so the two systems can be reconciled.
  tenantId: z.string().min(1).max(255),
  company: z.object({
    name: z.string().min(1).max(255),
    slug: slugSchema,
    timeZone: z.string().min(1).default("Europe/Madrid"),
  }),
  members: z.array(companyMemberInputSchema).min(1).max(50),
  eventType: z.object({
    title: z.string().min(1).max(255),
    slug: slugSchema,
    lengthInMinutes: z.number().int().positive().max(1440),
    schedulingType: z.enum(["ROUND_ROBIN", "COLLECTIVE"]).default("ROUND_ROBIN"),
  }),
});

export type ProvisionCompanyInput = z.infer<typeof provisionCompanyInputSchema>;
export type CompanyMemberInput = z.infer<typeof companyMemberInputSchema>;

export const issueSetupLinkInputSchema = z.object({
  email: z.string().email(),
});

export type IssueSetupLinkInput = z.infer<typeof issueSetupLinkInputSchema>;

export type SetupLinkDto = {
  email: string;
  /** Cal.diy's own /auth/forgot-password/:id flow, where the member sets a password. */
  passwordSetupUrl: string;
  expiresAt: string;
};

export type ProvisionedMemberDto = {
  userId: number;
  email: string;
  username: string;
  /** True when the email already existed and the user was linked instead of created. */
  linkedExistingUser: boolean;
  /**
   * Absent for linked accounts: they already have credentials, so handing out a
   * password-setup link for them would let a new company reset an existing login.
   */
  passwordSetupUrl?: string;
};

export type ProvisionedCompanyDto = {
  teamId: number;
  teamSlug: string;
  eventTypeId: number;
  eventTypeSlug: string;
  /** Only ever returned here: the database stores a SHA-256 hash, not the key. */
  apiKey: string;
  members: ProvisionedMemberDto[];
};

export type ResolvedMemberToProvision = {
  /** Set when an account with this email already exists and should be reused. */
  existingUserId?: number;
  name: string;
  email: string;
  username: string;
  timeZone: string;
  priority: number;
  weight: number;
};
