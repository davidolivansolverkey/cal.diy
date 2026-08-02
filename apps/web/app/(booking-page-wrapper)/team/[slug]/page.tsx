import { getTeamService } from "@calcom/features/team/di/Team.container";
import slugify from "@calcom/lib/slugify";
import type { PageProps } from "app/_types";
import { _generateMetadata } from "app/_utils";
import { notFound } from "next/navigation";
import TeamProfileView from "~/teams/views/team-profile-view";

const getTeam = async (params: PageProps["params"]) =>
  getTeamService().getPublicProfile(slugify(String((await params).slug)));

export const generateMetadata = async ({ params }: PageProps) => {
  const team = await getTeam(params);

  return await _generateMetadata(
    () => team?.name ?? "",
    () => team?.bio ?? "",
    undefined,
    undefined,
    `/team/${(await params).slug}`
  );
};

// The rendering lives in a client view: the UI kit builds on React context, which
// cannot be evaluated in a server component.
const ServerPage = async ({ params }: PageProps) => {
  const team = await getTeam(params);
  if (!team) return notFound();

  return <TeamProfileView team={team} />;
};

export default ServerPage;
