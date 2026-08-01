import { ErrorWithCode } from "@calcom/lib/errors";
import type {
  AddMemberInput,
  CreateOrganizationInput,
  CreateTeamInput,
  DirectoryDto,
  DirectoryUserDto,
  RemoveMemberInput,
  TeamNodeDto,
  UpdateMemberRoleInput,
} from "../Directory.types";
import type { DirectoryRepository } from "../repositories/DirectoryRepository";
import { buildUsernameCandidate, claimUsername } from "./CompanyProvisioningService";

const DEFAULT_HOST_PRIORITY = 2;
const DEFAULT_HOST_WEIGHT = 100;
const DEFAULT_TIME_ZONE = "Europe/Madrid";

export interface IDirectoryServiceDeps {
  directoryRepo: DirectoryRepository;
}

export class DirectoryService {
  constructor(private deps: IDirectoryServiceDeps) {}

  async createOrganization(
    input: CreateOrganizationInput,
    ownerUserId?: number
  ): Promise<{ id: number; slug: string }> {
    await this.assertSlugFree(input.slug);

    const created = await this.deps.directoryRepo.createOrganization({
      name: input.name,
      slug: input.slug,
      tenantId: input.tenantId,
      autoAcceptEmailDomain: input.autoAcceptEmailDomain,
      ownerUserId,
    });

    return { id: created.id, slug: input.slug };
  }

  async createTeam(
    input: CreateTeamInput,
    ownerUserId?: number
  ): Promise<{ id: number; slug: string; parentId?: number }> {
    await this.assertSlugFree(input.slug);

    let parentId: number | undefined;
    if (input.organizationSlug) {
      const parent = await this.deps.directoryRepo.findTeamBySlug(input.organizationSlug);
      if (!parent) {
        throw ErrorWithCode.Factory.NotFound(`No organization with slug "${input.organizationSlug}"`);
      }
      if (!parent.isOrganization) {
        throw ErrorWithCode.Factory.BadRequest(
          `"${input.organizationSlug}" is a team, not an organization, so it cannot contain teams`
        );
      }
      parentId = parent.id;
    }

    const created = await this.deps.directoryRepo.createTeam({
      name: input.name,
      slug: input.slug,
      parentId,
      tenantId: input.tenantId,
      ownerUserId,
    });

    return { id: created.id, slug: input.slug, parentId };
  }

  async addMember(input: AddMemberInput): Promise<{
    userId: number;
    username: string;
    linkedExistingUser: boolean;
    assignedEventTypeIds: number[];
  }> {
    const team = await this.requireTeam(input.teamSlug);
    const email = input.email.toLowerCase();
    const existingUser = await this.deps.directoryRepo.findUserByEmail(email);

    if (existingUser) {
      const membership = await this.deps.directoryRepo.findMembership(team.id, existingUser.id);
      if (membership) {
        throw ErrorWithCode.Factory.BadRequest(`${email} already belongs to "${input.teamSlug}"`);
      }
    }

    if (!existingUser && !input.name) {
      throw ErrorWithCode.Factory.BadRequest(
        `${email} has no account yet, so a name is required to create one`
      );
    }

    const username = existingUser?.username ?? (await this.claimFreeUsername(input.teamSlug, email));

    const result = await this.deps.directoryRepo.addMember({
      teamId: team.id,
      existingUserId: existingUser?.id,
      name: input.name ?? email,
      email,
      username,
      timeZone: input.timeZone ?? DEFAULT_TIME_ZONE,
      role: input.role,
      priority: input.priority ?? DEFAULT_HOST_PRIORITY,
      weight: input.weight ?? DEFAULT_HOST_WEIGHT,
      assignToEventTypes: input.assignToEventTypes,
    });

    return {
      userId: result.userId,
      username,
      linkedExistingUser: existingUser !== null,
      assignedEventTypeIds: result.assignedEventTypeIds,
    };
  }

  async updateMemberRole(input: UpdateMemberRoleInput): Promise<{ userId: number }> {
    const { team, userId } = await this.requireMembership(input.teamSlug, input.email);
    await this.deps.directoryRepo.updateMemberRole(team.id, userId, input.role);
    return { userId };
  }

  async removeMember(input: RemoveMemberInput): Promise<{ userId: number; removedHostCount: number }> {
    const { team, userId } = await this.requireMembership(input.teamSlug, input.email);
    const { removedHostCount } = await this.deps.directoryRepo.removeMember(team.id, userId);
    return { userId, removedHostCount };
  }

  async listUsers(take = 500): Promise<DirectoryUserDto[]> {
    return this.deps.directoryRepo.findUsers(take);
  }

  async getDirectory(): Promise<DirectoryDto> {
    const teams = await this.deps.directoryRepo.findAllTeams();

    const childrenByParent = new Map<number, typeof teams>();
    for (const team of teams) {
      if (team.parentId === null) continue;
      const siblings = childrenByParent.get(team.parentId) ?? [];
      siblings.push(team);
      childrenByParent.set(team.parentId, siblings);
    }

    const toNode = (team: (typeof teams)[number]): TeamNodeDto => ({
      id: team.id,
      name: team.name,
      slug: team.slug,
      isOrganization: team.isOrganization,
      members: team.members.map((membership) => ({
        userId: membership.user.id,
        name: membership.user.name,
        email: membership.user.email,
        username: membership.user.username,
        role: membership.role,
        accepted: membership.accepted,
      })),
      teams: (childrenByParent.get(team.id) ?? []).map(toNode),
    });

    const roots = teams.filter((team) => team.parentId === null);

    return {
      organizations: roots.filter((team) => team.isOrganization).map(toNode),
      standaloneTeams: roots.filter((team) => !team.isOrganization).map(toNode),
    };
  }

  private async assertSlugFree(slug: string): Promise<void> {
    const existing = await this.deps.directoryRepo.findTeamBySlug(slug);
    if (existing) {
      // Slug uniqueness is @@unique([slug, parentId]), and everything we create at the
      // top level has a null parent, so organizations and teams share one namespace.
      throw ErrorWithCode.Factory.BadRequest(`Slug "${slug}" is already taken`, {
        teamId: existing.id,
        alreadyExists: true,
      });
    }
  }

  private async requireTeam(slug: string): Promise<{ id: number }> {
    const team = await this.deps.directoryRepo.findTeamBySlug(slug);
    if (!team) throw ErrorWithCode.Factory.NotFound(`No team or organization with slug "${slug}"`);
    return team;
  }

  private async requireMembership(
    teamSlug: string,
    rawEmail: string
  ): Promise<{ team: { id: number }; userId: number }> {
    const team = await this.requireTeam(teamSlug);
    const email = rawEmail.toLowerCase();
    const user = await this.deps.directoryRepo.findUserByEmail(email);
    if (!user) throw ErrorWithCode.Factory.NotFound(`No account exists for ${email}`);

    const membership = await this.deps.directoryRepo.findMembership(team.id, user.id);
    if (!membership) {
      throw ErrorWithCode.Factory.NotFound(`${email} does not belong to "${teamSlug}"`);
    }

    return { team, userId: user.id };
  }

  private async claimFreeUsername(teamSlug: string, email: string): Promise<string> {
    const candidate = buildUsernameCandidate(teamSlug, email);
    const taken = new Set(await this.deps.directoryRepo.findUsernamesStartingWith(candidate));
    return claimUsername(candidate, taken);
  }
}
