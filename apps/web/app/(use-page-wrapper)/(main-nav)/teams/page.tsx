import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { _generateMetadata, getTranslate } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { TeamsView } from "~/teams/teams-view";
import { ShellMainAppDir } from "../ShellMainAppDir";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("teams"),
    (t) => t("no_teams_description"),
    undefined,
    undefined,
    "/teams"
  );

const Page = async () => {
  const session = await getServerSession({
    req: buildLegacyRequest(await headers(), await cookies()),
  });
  if (!session?.user?.id) return redirect("/auth/login");

  const t = await getTranslate();

  return (
    <ShellMainAppDir heading={t("teams")} subtitle={t("no_teams_description")}>
      <TeamsView />
    </ShellMainAppDir>
  );
};

export default Page;
