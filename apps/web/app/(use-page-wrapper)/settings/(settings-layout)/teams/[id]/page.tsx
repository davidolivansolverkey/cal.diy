import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import type { PageProps } from "app/_types";
import { _generateMetadata, getTranslate } from "app/_utils";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TeamSettingsView } from "~/settings/teams/team-settings-view";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("team"),
    (t) => t("no_teams_description"),
    undefined,
    undefined,
    "/settings/teams"
  );

const Page = async ({ params }: PageProps) => {
  const session = await getServerSession({
    req: buildLegacyRequest(await headers(), await cookies()),
  });
  if (!session?.user?.id) return redirect("/auth/login");

  const teamId = Number((await params).id);
  if (!Number.isInteger(teamId)) return notFound();

  const t = await getTranslate();

  return (
    <SettingsHeader title={t("team")} description={t("no_teams_description")}>
      {/* Membership and role are enforced by viewer.teams.get, which 403s for
          anyone outside the team, so the page itself only checks the session. */}
      <TeamSettingsView teamId={teamId} />
    </SettingsHeader>
  );
};

export default Page;
