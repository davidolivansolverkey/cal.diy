import { randomBytes } from "node:crypto";
import { ErrorWithCode } from "@calcom/lib/errors";
import { MembershipRole } from "@calcom/prisma/enums";
import type { InvitationRow, TeamMemberRow, TeamRepository, TeamRow } from "../repositories/TeamRepository";

const ADMIN_ROLES: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.ADMIN];
const INVITE_TOKEN_DAYS = 7;

/**
 * Someone already registered is joined straight away as a pending member and
 * accepts from their own invitation list. Someone with no account needs a
 * signup link instead, because the membership can only exist once the user does.
 */
export type InviteResult =
  | { kind: "membership"; userId: number }
  | { kind: "link"; url: string; expires: Date };

export interface ITeamServiceDeps {
  teamRepo: TeamRepository;
  /** Base for the signup link handed out to invitees who have no account yet. */
  webappUrl: string;
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

  /** Unauthenticated: this feeds the public /team/[slug] profile. */
  async getPublicProfile(slug: string) {
    return this.deps.teamRepo.findPublicBySlug(slug);
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

  async listInvitations(userId: number): Promise<InvitationRow[]> {
    return this.deps.teamRepo.findInvitationsByUserId(userId);
  }

  async acceptInvitation(teamId: number, userId: number): Promise<void> {
    const membership = await this.deps.teamRepo.findMembership(teamId, userId);
    if (!membership) throw ErrorWithCode.Factory.NotFound("You have no invitation to this team");
    if (membership.accepted) return;

    await this.deps.teamRepo.acceptMembership(teamId, userId);
  }

  async invite(teamId: number, email: string, role: MembershipRole, userId: number): Promise<InviteResult> {
    await this.requireRole(teamId, userId, ADMIN_ROLES);
    await this.requireOwnerToGrantOwner(teamId, userId, role);

    const normalizedEmail = email.trim().toLowerCase();
    const invitedUserId = await this.deps.teamRepo.findUserIdByEmail(normalizedEmail);

    if (invitedUserId) {
      const existing = await this.deps.teamRepo.findMembership(teamId, invitedUserId);
      if (existing) {
        throw ErrorWithCode.Factory.BadRequest(
          existing.accepted
            ? `${normalizedEmail} already belongs to this team`
            : `${normalizedEmail} has already been invited`
        );
      }

      await this.deps.teamRepo.createMembership(teamId, invitedUserId, role);
      return { kind: "membership", userId: invitedUserId };
    }

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + INVITE_TOKEN_DAYS * 24 * 60 * 60 * 1000);
    await this.deps.teamRepo.createInviteToken({ teamId, email: normalizedEmail, token, expires });

    return { kind: "link", url: `${this.deps.webappUrl}/signup?token=${token}`, expires };
  }

  async changeMemberRole(
    teamId: number,
    targetUserId: number,
    role: MembershipRole,
    userId: number
  ): Promise<void> {
    await this.requireRole(teamId, userId, ADMIN_ROLES);
    await this.requireOwnerToGrantOwner(teamId, userId, role);
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

  /**
   * Without this an ADMIN could hand out ownership — including to themselves —
   * which is an escalation past the only role that can disband the team.
   */
  private async requireOwnerToGrantOwner(
    teamId: number,
    userId: number,
    role: MembershipRole
  ): Promise<void> {
    if (role !== MembershipRole.OWNER) return;
    await this.requireRole(teamId, userId, [MembershipRole.OWNER]);
  }

  /** Pending members count: revoking an invitation goes through the same path as removing a member. */
  private async requireTargetIsMember(teamId: number, targetUserId: number): Promise<void> {
    const membership = await this.deps.teamRepo.findMembership(teamId, targetUserId);
    if (!membership) throw ErrorWithCode.Factory.NotFound("That person does not belong to this team");
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
