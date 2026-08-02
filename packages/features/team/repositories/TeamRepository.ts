import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

const teamSelect = {
  id: true,
  name: true,
  slug: true,
  bio: true,
  logoUrl: true,
  isPrivate: true,
  hideBranding: true,
  isOrganization: true,
  parentId: true,
} as const;

export type TeamRow = {
  id: number;
  name: string;
  slug: string | null;
  bio: string | null;
  logoUrl: string | null;
  isPrivate: boolean;
  hideBranding: boolean;
  isOrganization: boolean;
  parentId: number | null;
};

export type TeamMemberRow = {
  userId: number;
  name: string | null;
  email: string;
  username: string | null;
  role: MembershipRole;
  accepted: boolean;
};

export class TeamRepository {
  constructor(private prismaClient: PrismaClient) {}

  async findManyByUserId(userId: number): Promise<(TeamRow & { role: MembershipRole })[]> {
    const memberships = await this.prismaClient.membership.findMany({
      where: { userId, accepted: true },
      select: { role: true, team: { select: teamSelect } },
      orderBy: { team: { name: "asc" } },
    });

    return memberships.map((membership) => ({ ...membership.team, role: membership.role }));
  }

  async findById(teamId: number): Promise<TeamRow | null> {
    return this.prismaClient.team.findUnique({ where: { id: teamId }, select: teamSelect });
  }

  async findMembers(teamId: number): Promise<TeamMemberRow[]> {
    const memberships = await this.prismaClient.membership.findMany({
      where: { teamId },
      select: {
        role: true,
        accepted: true,
        user: { select: { id: true, name: true, email: true, username: true } },
      },
      orderBy: { user: { email: "asc" } },
    });

    return memberships.map((membership) => ({
      userId: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      username: membership.user.username,
      role: membership.role,
      accepted: membership.accepted,
    }));
  }

  async findBySlug(slug: string): Promise<{ id: number } | null> {
    return this.prismaClient.team.findFirst({ where: { slug }, select: { id: true } });
  }

  /**
   * Public profile data. Hidden event types are excluded, and a private team
   * exposes no event types at all — the same rule getPublicEvent applies.
   */
  async findPublicBySlug(slug: string): Promise<{
    name: string;
    slug: string | null;
    bio: string | null;
    logoUrl: string | null;
    isPrivate: boolean;
    eventTypes: { id: number; title: string; slug: string; length: number; description: string | null }[];
  } | null> {
    const team = await this.prismaClient.team.findFirst({
      where: { slug, isOrganization: false },
      select: {
        name: true,
        slug: true,
        bio: true,
        logoUrl: true,
        isPrivate: true,
        eventTypes: {
          where: { hidden: false, schedulingType: { not: null } },
          select: { id: true, title: true, slug: true, length: true, description: true },
          orderBy: { position: "desc" },
        },
      },
    });

    if (!team) return null;
    return { ...team, eventTypes: team.isPrivate ? [] : team.eventTypes };
  }

  /** The creator is made OWNER in the same statement, so a team is never ownerless. */
  async create(args: { name: string; slug: string; ownerUserId: number }): Promise<TeamRow> {
    return this.prismaClient.team.create({
      data: {
        name: args.name,
        slug: args.slug,
        members: { create: { userId: args.ownerUserId, role: MembershipRole.OWNER, accepted: true } },
      },
      select: teamSelect,
    });
  }

  async update(
    teamId: number,
    data: { name?: string; slug?: string; bio?: string; isPrivate?: boolean; hideBranding?: boolean }
  ): Promise<TeamRow> {
    return this.prismaClient.team.update({ where: { id: teamId }, data, select: teamSelect });
  }

  async delete(teamId: number): Promise<void> {
    await this.prismaClient.team.delete({ where: { id: teamId }, select: { id: true } });
  }

  async countOwners(teamId: number): Promise<number> {
    return this.prismaClient.membership.count({
      where: { teamId, role: MembershipRole.OWNER, accepted: true },
    });
  }

  async findRole(teamId: number, userId: number): Promise<MembershipRole | null> {
    const membership = await this.prismaClient.membership.findUnique({
      where: { userId_teamId: { userId, teamId } },
      select: { role: true, accepted: true },
    });

    return membership?.accepted ? membership.role : null;
  }

  async updateMemberRole(teamId: number, userId: number, role: MembershipRole): Promise<void> {
    await this.prismaClient.membership.update({
      where: { userId_teamId: { userId, teamId } },
      data: { role },
      select: { id: true },
    });
  }

  /** Host rows go with the membership or a removed member keeps taking bookings. */
  async removeMember(teamId: number, userId: number): Promise<void> {
    await this.prismaClient.$transaction(async (tx) => {
      await tx.host.deleteMany({ where: { userId, eventType: { teamId } } });
      await tx.membership.delete({ where: { userId_teamId: { userId, teamId } }, select: { id: true } });
    });
  }
}
