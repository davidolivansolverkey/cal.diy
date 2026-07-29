import process from "node:process";
import { generateUniqueAPIKey } from "@calcom/features/api-keys-legacy/api-keys/lib/apiKeys";
import { ErrorWithCode } from "@calcom/lib/errors";
import type {
  ProvisionCompanyInput,
  ProvisionedCompanyDto,
  ResolvedMemberToProvision,
} from "../CompanyProvisioning.types";
import type { CompanyProvisioningRepository } from "../repositories/CompanyProvisioningRepository";

const DEFAULT_HOST_PRIORITY = 2;
const DEFAULT_HOST_WEIGHT = 100;

export interface ICompanyProvisioningServiceDeps {
  companyProvisioningRepo: CompanyProvisioningRepository;
}

export class CompanyProvisioningService {
  constructor(private deps: ICompanyProvisioningServiceDeps) {}

  async provisionCompany(input: ProvisionCompanyInput): Promise<ProvisionedCompanyDto> {
    const emails = input.members.map((member) => member.email.toLowerCase());
    const duplicateEmail = emails.find((email, index) => emails.indexOf(email) !== index);
    if (duplicateEmail) {
      throw ErrorWithCode.Factory.BadRequest(`Duplicate member email in request: ${duplicateEmail}`);
    }

    const existingTeamId = await this.deps.companyProvisioningRepo.findTeamIdBySlug(input.company.slug);
    if (existingTeamId !== null) {
      throw ErrorWithCode.Factory.BadRequest(
        `A company with slug "${input.company.slug}" is already provisioned`,
        { teamId: existingTeamId, alreadyProvisioned: true }
      );
    }

    const existingUsers = await this.deps.companyProvisioningRepo.findUserIdsByEmails(emails);
    const existingUserByEmail = new Map(existingUsers.map((user) => [user.email.toLowerCase(), user]));

    const members = await this.resolveMembers(input, existingUserByEmail);
    const [apiKeyHash, apiKey] = generateUniqueAPIKey();

    const created = await this.deps.companyProvisioningRepo.createCompany({
      team: {
        name: input.company.name,
        slug: input.company.slug,
        timeZone: input.company.timeZone,
        skaiTenantId: input.tenantId,
      },
      members,
      eventType: {
        title: input.eventType.title,
        slug: input.eventType.slug,
        length: input.eventType.lengthInMinutes,
        schedulingType: input.eventType.schedulingType,
      },
      apiKeyHash,
    });

    const apiKeyPrefix = process.env.API_KEY_PREFIX ?? "cal_";

    return {
      teamId: created.teamId,
      teamSlug: input.company.slug,
      eventTypeId: created.eventTypeId,
      eventTypeSlug: input.eventType.slug,
      apiKey: `${apiKeyPrefix}${apiKey}`,
      members: created.members,
    };
  }

  private async resolveMembers(
    input: ProvisionCompanyInput,
    existingUserByEmail: Map<string, { id: number; email: string; username: string | null }>
  ): Promise<ResolvedMemberToProvision[]> {
    const candidates = input.members.map((member) =>
      buildUsernameCandidate(input.company.slug, member.email)
    );
    const taken = new Set(await this.deps.companyProvisioningRepo.findTakenUsernames(candidates));

    return input.members.map((member, index) => {
      const existingUser = existingUserByEmail.get(member.email.toLowerCase());
      const username = existingUser?.username ?? claimUsername(candidates[index], taken);

      return {
        existingUserId: existingUser?.id,
        name: member.name,
        email: member.email,
        username,
        timeZone: member.timeZone ?? input.company.timeZone,
        priority: member.priority ?? DEFAULT_HOST_PRIORITY,
        weight: member.weight ?? DEFAULT_HOST_WEIGHT,
      };
    });
  }
}

export function buildUsernameCandidate(companySlug: string, email: string): string {
  const localPart = email.split("@")[0] ?? "";
  const sanitized = localPart
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${companySlug}-${sanitized || "member"}`;
}

/**
 * Usernames collide across the whole instance, not per company, because User has a
 * global unique([username, organizationId]) and we never set organizationId.
 */
export function claimUsername(candidate: string, taken: Set<string>): string {
  if (!taken.has(candidate)) {
    taken.add(candidate);
    return candidate;
  }

  let suffix = 2;
  while (taken.has(`${candidate}-${suffix}`)) {
    suffix++;
  }

  const claimed = `${candidate}-${suffix}`;
  taken.add(claimed);
  return claimed;
}
