import { DEFAULT_SCHEDULE, getAvailabilityFromSchedule } from "@calcom/lib/availability";
import type { PrismaClient } from "@calcom/prisma";
import { type MembershipRole, SchedulingType } from "@calcom/prisma/enums";
import type { MembershipRoleInput } from "../Directory.types";

const HOSTED_SCHEDULING_TYPES = [SchedulingType.ROUND_ROBIN, SchedulingType.COLLECTIVE];

type TeamRow = {
  id: number;
  name: string;
  slug: string | null;
  isOrganization: boolean;
  parentId: number | null;
  members: {
    role: MembershipRole;
    accepted: boolean;
    user: { id: number; name: string | null; email: string; username: string | null };
  }[];
};

const teamSelect = {
  id: true,
  name: true,
  slug: true,
  isOrganization: true,
  parentId: true,
  members: {
    select: {
      role: true,
      accepted: true,
      user: { select: { id: true, name: true, email: true, username: true } },
    },
  },
} as const;

export class DirectoryRepository {
  constructor(private prismaClient: PrismaClient) {}

  async findTeamBySlug(slug: string): Promise<{ id: number; isOrganization: boolean } | null> {
    return this.prismaClient.team.findFirst({
      where: { slug },
      select: { id: true, isOrganization: true },
    });
  }

  async createOrganization(args: {
    name: string;
    slug: string;
    tenantId?: string;
    autoAcceptEmailDomain: string;
  }): Promise<{ id: number }> {
    return this.prismaClient.team.create({
      data: {
        name: args.name,
        slug: args.slug,
        isOrganization: true,
        metadata: args.tenantId ? { skaiTenantId: args.tenantId } : undefined,
        organizationSettings: {
          create: {
            orgAutoAcceptEmail: args.autoAcceptEmailDomain,
            // Flipped on at creation because the review and DNS-verification flows
            // that used to set them were part of the deleted enterprise code.
            isOrganizationConfigured: true,
            isOrganizationVerified: true,
            isAdminReviewed: true,
            orgAutoJoinOnSignup: false,
          },
        },
      },
      select: { id: true },
    });
  }

  async createTeam(args: {
    name: string;
    slug: string;
    parentId?: number;
    tenantId?: string;
  }): Promise<{ id: number }> {
    return this.prismaClient.team.create({
      data: {
        name: args.name,
        slug: args.slug,
        parentId: args.parentId,
        metadata: args.tenantId ? { skaiTenantId: args.tenantId } : undefined,
      },
      select: { id: true },
    });
  }

  async findUserByEmail(email: string): Promise<{ id: number; username: string | null } | null> {
    return this.prismaClient.user.findUnique({
      where: { email },
      select: { id: true, username: true },
    });
  }

  /**
   * Prefix match, not exact: the caller resolves collisions by appending -2, -3, so it
   * needs to know about those variants too or the insert hits the unique constraint.
   */
  async findUsernamesStartingWith(prefix: string): Promise<string[]> {
    const users = await this.prismaClient.user.findMany({
      where: { username: { startsWith: prefix } },
      select: { username: true },
    });
    return users.flatMap((user) => (user.username ? [user.username] : []));
  }

  /** Feeds the "existing person" picker, so it is capped rather than unbounded. */
  async findUsers(
    take: number
  ): Promise<{ id: number; name: string | null; email: string; username: string | null }[]> {
    return this.prismaClient.user.findMany({
      select: { id: true, name: true, email: true, username: true },
      orderBy: { email: "asc" },
      take,
    });
  }

  async findMembership(teamId: number, userId: number): Promise<{ id: number } | null> {
    return this.prismaClient.membership.findUnique({
      where: { userId_teamId: { userId, teamId } },
      select: { id: true },
    });
  }

  /**
   * Creates the user when the email is unknown, then the membership, then optionally
   * the Host rows. One transaction so a member never exists without their membership.
   */
  async addMember(args: {
    teamId: number;
    existingUserId?: number;
    name: string;
    email: string;
    username: string;
    timeZone: string;
    role: MembershipRoleInput;
    priority: number;
    weight: number;
    assignToEventTypes: boolean;
  }): Promise<{ userId: number; assignedEventTypeIds: number[] }> {
    return this.prismaClient.$transaction(async (tx) => {
      let userId = args.existingUserId;

      if (userId === undefined) {
        const createdUser = await tx.user.create({
          data: {
            name: args.name,
            email: args.email,
            username: args.username,
            timeZone: args.timeZone,
            completedOnboarding: true,
            emailVerified: new Date(),
          },
          select: { id: true },
        });
        userId = createdUser.id;

        const createdSchedule = await tx.schedule.create({
          data: {
            userId,
            name: "Working Hours",
            timeZone: args.timeZone,
            availability: {
              createMany: {
                data: getAvailabilityFromSchedule(DEFAULT_SCHEDULE).map((slot) => ({
                  days: slot.days,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                })),
              },
            },
          },
          select: { id: true },
        });

        await tx.user.update({
          where: { id: userId },
          data: { defaultScheduleId: createdSchedule.id },
        });
      }

      await tx.membership.create({
        data: { teamId: args.teamId, userId, role: args.role, accepted: true },
        select: { id: true },
      });

      if (!args.assignToEventTypes) return { userId, assignedEventTypeIds: [] };

      const eventTypes = await tx.eventType.findMany({
        where: { teamId: args.teamId, schedulingType: { in: HOSTED_SCHEDULING_TYPES } },
        select: { id: true, schedulingType: true },
      });

      for (const eventType of eventTypes) {
        await tx.host.create({
          data: {
            userId,
            eventTypeId: eventType.id,
            isFixed: eventType.schedulingType === SchedulingType.COLLECTIVE,
            priority: args.priority,
            weight: args.weight,
          },
          select: { userId: true },
        });
      }

      return { userId, assignedEventTypeIds: eventTypes.map((eventType) => eventType.id) };
    });
  }

  async updateMemberRole(teamId: number, userId: number, role: MembershipRoleInput): Promise<void> {
    await this.prismaClient.membership.update({
      where: { userId_teamId: { userId, teamId } },
      data: { role },
      select: { id: true },
    });
  }

  /** Host rows go too, otherwise a removed member keeps receiving round-robin bookings. */
  async removeMember(teamId: number, userId: number): Promise<{ removedHostCount: number }> {
    return this.prismaClient.$transaction(async (tx) => {
      const removedHosts = await tx.host.deleteMany({
        where: { userId, eventType: { teamId } },
      });

      await tx.membership.delete({
        where: { userId_teamId: { userId, teamId } },
        select: { id: true },
      });

      return { removedHostCount: removedHosts.count };
    });
  }

  async findAllTeams(): Promise<TeamRow[]> {
    return this.prismaClient.team.findMany({
      select: teamSelect,
      orderBy: { name: "asc" },
    });
  }
}
