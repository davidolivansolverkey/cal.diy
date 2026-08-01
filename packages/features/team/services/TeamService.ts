import { ErrorWithCode } from "@calcom/lib/errors";
import { MembershipRole } from "@calcom/prisma/enums";
import type { TeamMemberRow, TeamRepository, TeamRow } from "../repositories/TeamRepository";

const ADMIN_ROLES: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.ADMIN];

export interface ITeamServiceDeps {
  teamRepo: TeamRepository;
}

/**
 * PBAC is gone from this build and its stubs fail open, so every permission here
 * is decided from the caller's own membership role and never from those stubs.
 */
export class TeamService {
  constructor(private deps: ITeamServiceDeps) {}

  async list(userId: number): Promise<(TeamRow & { role: MembershipRole })[]> {
    return this.deps.teamRepo.findManyByUserId(userId);
  }

  async get(teamId: number, userId: number): Promise<TeamRow & { members: TeamMemberRow[] }> {
    const team = await this.requireMembership(teamId, userId);
    const members = await this.deps.teamRepo.findMembers(teamId);
    return { ...team, members };
  }

  async create(input: { name: string; slug: string }, userId: number): Promise<TeamRow> {
    const existing = await this.deps.teamRepo.findBySlug(input.slug);
    if (existing) {
      throw ErrorWithCode.Factory.BadRequest(`Slug "${input.slug}" is already taken`, {
        teamId: existing.id,
        alreadyExists: true,
      });
    }

    return this.deps.teamRepo.create({ ...input, ownerUserId: userId });
  }

  async update(
    teamId: number,
    data: { name?: string; slug?: string; bio?: string; isPrivate?: boolean; hideBranding?: boolean },
    userId: number
  ): Promise<TeamRow> {
    await this.requireRole(teamId, userId, ADMIN_ROLES);

    if (data.slug) {
      const existing = await this.deps.teamRepo.findBySlug(data.slug);
      if (existing && existing.id !== teamId) {
        throw ErrorWithCode.Factory.BadRequest(`Slug "${data.slug}" is already taken`);
      }
    }

    return this.deps.teamRepo.update(teamId, data);
  }

  async delete(teamId: number, userId: number): Promise<void> {
    await this.requireRole(teamId, userId, [MembershipRole.OWNER]);
    await this.deps.teamRepo.delete(teamId);
  }

  async changeMemberRole(
    teamId: number,
    targetUserId: number,
    role: MembershipRole,
    userId: number
  ): Promise<void> {
    await this.requireRole(teamId, userId, ADMIN_ROLES);
    await this.requireTargetIsMember(teamId, targetUserId);

    // Demoting the last owner would leave the team unmanageable.
    if (role !== MembershipRole.OWNER) await this.assertNotLastOwner(teamId, targetUserId);

    await this.deps.teamRepo.updateMemberRole(teamId, targetUserId, role);
  }

  async removeMember(teamId: number, targetUserId: number, userId: number): Promise<void> {
    const isSelf = targetUserId === userId;
    // Anyone may leave; removing somebody else needs admin rights.
    if (!isSelf) await this.requireRole(teamId, userId, ADMIN_ROLES);

    await this.requireTargetIsMember(teamId, targetUserId);
    await this.assertNotLastOwner(teamId, targetUserId);
    await this.deps.teamRepo.removeMember(teamId, targetUserId);
  }

  private async requireMembership(teamId: number, userId: number): Promise<TeamRow> {
    const role = await this.deps.teamRepo.findRole(teamId, userId);
    if (!role) throw ErrorWithCode.Factory.Forbidden("You do not belong to this team");

    const team = await this.deps.teamRepo.findById(teamId);
    if (!team) throw ErrorWithCode.Factory.NotFound("Team not found");
    return team;
  }

  private async requireRole(teamId: number, userId: number, allowed: MembershipRole[]): Promise<void> {
    const role = await this.deps.teamRepo.findRole(teamId, userId);
    if (!role) throw ErrorWithCode.Factory.Forbidden("You do not belong to this team");
    if (!allowed.includes(role)) {
      throw ErrorWithCode.Factory.Forbidden(`This action requires one of: ${allowed.join(", ")}`);
    }
  }

  private async requireTargetIsMember(teamId: number, targetUserId: number): Promise<void> {
    const role = await this.deps.teamRepo.findRole(teamId, targetUserId);
    if (!role) throw ErrorWithCode.Factory.NotFound("That person does not belong to this team");
  }

  private async assertNotLastOwner(teamId: number, targetUserId: number): Promise<void> {
    const targetRole = await this.deps.teamRepo.findRole(teamId, targetUserId);
    if (targetRole !== MembershipRole.OWNER) return;

    const owners = await this.deps.teamRepo.countOwners(teamId);
    if (owners <= 1) {
      throw ErrorWithCode.Factory.BadRequest("A team must keep at least one owner");
    }
  }
}
