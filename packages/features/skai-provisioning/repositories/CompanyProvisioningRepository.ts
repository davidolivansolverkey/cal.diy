import { DEFAULT_SCHEDULE, getAvailabilityFromSchedule } from "@calcom/lib/availability";
import type { PrismaClient } from "@calcom/prisma";
import { MembershipRole, SchedulingType } from "@calcom/prisma/enums";
import type { ResolvedMemberToProvision } from "../CompanyProvisioning.types";

type CreateCompanyArgs = {
  team: { name: string; slug: string; timeZone: string; skaiTenantId: string };
  members: ResolvedMemberToProvision[];
  eventType: {
    title: string;
    slug: string;
    length: number;
    schedulingType: Extract<SchedulingType, "ROUND_ROBIN" | "COLLECTIVE">;
  };
  apiKeyHash: string;
};

type CreateCompanyResult = {
  teamId: number;
  eventTypeId: number;
  members: { userId: number; email: string; username: string; linkedExistingUser: boolean }[];
};

export class CompanyProvisioningRepository {
  constructor(private prismaClient: PrismaClient) {}

  async findTeamIdBySlug(slug: string): Promise<number | null> {
    const team = await this.prismaClient.team.findFirst({
      where: { slug, parentId: null },
      select: { id: true },
    });
    return team?.id ?? null;
  }

  async findUserIdsByEmails(
    emails: string[]
  ): Promise<{ id: number; email: string; username: string | null }[]> {
    return this.prismaClient.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true, username: true },
    });
  }

  async findTakenUsernames(usernames: string[]): Promise<string[]> {
    const users = await this.prismaClient.user.findMany({
      where: { username: { in: usernames } },
      select: { username: true },
    });
    return users.flatMap((user) => (user.username ? [user.username] : []));
  }

  /**
   * Written as a single transaction because a half-provisioned company (a team with
   * no hosts, or an event type with no API key) is unbookable and has to be cleaned
   * up by hand. SKAI retries provisioning, so partial state must never survive.
   */
  async createCompany(args: CreateCompanyArgs): Promise<CreateCompanyResult> {
    const { team, members, eventType, apiKeyHash } = args;

    return this.prismaClient.$transaction(async (tx) => {
      const createdTeam = await tx.team.create({
        data: {
          name: team.name,
          slug: team.slug,
          timeZone: team.timeZone,
          metadata: { skaiTenantId: team.skaiTenantId },
        },
        select: { id: true },
      });

      const provisionedMembers: CreateCompanyResult["members"] = [];

      for (let index = 0; index < members.length; index++) {
        const member = members[index];
        let userId = member.existingUserId;
        let username = member.username;

        if (userId === undefined) {
          const createdUser = await tx.user.create({
            data: {
              name: member.name,
              email: member.email,
              username: member.username,
              timeZone: member.timeZone,
              // Skips the onboarding wizard: these accounts are provisioned, never self-served.
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
              timeZone: member.timeZone,
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
        } else {
          const existing = await tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: { username: true },
          });
          username = existing.username ?? member.username;
        }

        await tx.membership.create({
          data: {
            teamId: createdTeam.id,
            userId,
            // The team needs an owner for team-scoped API-key auth to resolve.
            role: index === 0 ? MembershipRole.OWNER : MembershipRole.MEMBER,
            accepted: true,
          },
          select: { id: true },
        });

        provisionedMembers.push({
          userId,
          email: member.email,
          username,
          linkedExistingUser: member.existingUserId !== undefined,
        });
      }

      const createdEventType = await tx.eventType.create({
        data: {
          teamId: createdTeam.id,
          title: eventType.title,
          slug: eventType.slug,
          length: eventType.length,
          schedulingType: eventType.schedulingType,
          hosts: {
            createMany: {
              data: members.map((member, index) => ({
                userId: provisionedMembers[index].userId,
                // COLLECTIVE requires every host on the booking; ROUND_ROBIN rotates
                // between non-fixed hosts, and the engine splits on this flag alone.
                isFixed: eventType.schedulingType === SchedulingType.COLLECTIVE,
                priority: member.priority,
                weight: member.weight,
              })),
            },
          },
        },
        select: { id: true },
      });

      await tx.apiKey.create({
        data: {
          hashedKey: apiKeyHash,
          userId: provisionedMembers[0].userId,
          // Populates request.organizationId in API v2's api-key strategy.
          teamId: createdTeam.id,
          note: `SKAI Central tenant ${team.skaiTenantId}`,
        },
        select: { id: true },
      });

      return {
        teamId: createdTeam.id,
        eventTypeId: createdEventType.id,
        members: provisionedMembers,
      };
    });
  }
}
