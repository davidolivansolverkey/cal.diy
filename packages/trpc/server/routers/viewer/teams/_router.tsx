import { getTeamService } from "@calcom/features/team/di/Team.container";
import { MembershipRole } from "@calcom/prisma/enums";
import { z } from "zod";
import authedProcedure from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";

const teamIdInput = z.object({ teamId: z.number().int() });
const memberInput = teamIdInput.extend({ userId: z.number().int() });

const slug = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be lowercase words separated by single hyphens");

export const teamsRouter = router({
  list: authedProcedure.query(async ({ ctx }) => getTeamService().list(ctx.user.id)),

  get: authedProcedure
    .input(teamIdInput)
    .query(async ({ ctx, input }) => getTeamService().get(input.teamId, ctx.user.id)),

  create: authedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(255), slug }))
    .mutation(async ({ ctx, input }) => getTeamService().create(input, ctx.user.id)),

  update: authedProcedure
    .input(
      teamIdInput.extend({
        name: z.string().trim().min(1).max(255).optional(),
        slug: slug.optional(),
        bio: z.string().max(1000).optional(),
        isPrivate: z.boolean().optional(),
        hideBranding: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { teamId, ...data } = input;
      return getTeamService().update(teamId, data, ctx.user.id);
    }),

  delete: authedProcedure.input(teamIdInput).mutation(async ({ ctx, input }) => {
    await getTeamService().delete(input.teamId, ctx.user.id);
    return { id: input.teamId };
  }),

  changeMemberRole: authedProcedure
    .input(memberInput.extend({ role: z.nativeEnum(MembershipRole) }))
    .mutation(async ({ ctx, input }) => {
      await getTeamService().changeMemberRole(input.teamId, input.userId, input.role, ctx.user.id);
      return { userId: input.userId, role: input.role };
    }),

  removeMember: authedProcedure.input(memberInput).mutation(async ({ ctx, input }) => {
    await getTeamService().removeMember(input.teamId, input.userId, ctx.user.id);
    return { userId: input.userId };
  }),
});
