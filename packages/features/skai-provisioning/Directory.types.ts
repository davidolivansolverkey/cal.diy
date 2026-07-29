import { z } from "zod";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(SLUG_REGEX, "Must be lowercase alphanumeric words separated by single hyphens");

export const membershipRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER"]);
export type MembershipRoleInput = z.infer<typeof membershipRoleSchema>;

export const createOrganizationInputSchema = z.object({
  name: z.string().min(1).max(255),
  slug: slugSchema,
  /** SKAI's tenants.id, stored on the team so both systems can be reconciled. */
  tenantId: z.string().min(1).max(255).optional(),
  /**
   * Email domain whose users auto-join. OrganizationSettings requires the column,
   * so an empty string means "nobody joins automatically".
   */
  autoAcceptEmailDomain: z.string().max(255).default(""),
});

export const createTeamInputSchema = z.object({
  name: z.string().min(1).max(255),
  slug: slugSchema,
  /** Omit to create a standalone team; set it to nest the team under an organization. */
  organizationSlug: slugSchema.optional(),
  tenantId: z.string().min(1).max(255).optional(),
});

export const addMemberInputSchema = z.object({
  teamSlug: slugSchema,
  name: z.string().min(1).max(255),
  email: z.string().email(),
  role: membershipRoleSchema.default("MEMBER"),
  timeZone: z.string().min(1).optional(),
  priority: z.number().int().min(0).max(4).optional(),
  weight: z.number().int().min(0).max(1000).optional(),
  /** Also become a bookable host on the team's round-robin/collective event types. */
  assignToEventTypes: z.boolean().default(true),
});

export const updateMemberRoleInputSchema = z.object({
  teamSlug: slugSchema,
  email: z.string().email(),
  role: membershipRoleSchema,
});

export const removeMemberInputSchema = z.object({
  teamSlug: slugSchema,
  email: z.string().email(),
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationInputSchema>;
export type CreateTeamInput = z.infer<typeof createTeamInputSchema>;
export type AddMemberInput = z.infer<typeof addMemberInputSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleInputSchema>;
export type RemoveMemberInput = z.infer<typeof removeMemberInputSchema>;

export type TeamNodeDto = {
  id: number;
  name: string;
  slug: string | null;
  isOrganization: boolean;
  members: {
    userId: number;
    name: string | null;
    email: string;
    username: string | null;
    role: MembershipRoleInput;
    accepted: boolean;
  }[];
  teams: TeamNodeDto[];
};

export type DirectoryDto = {
  organizations: TeamNodeDto[];
  /** Teams with no parent organization, including the ones created by company provisioning. */
  standaloneTeams: TeamNodeDto[];
};
