import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { getDirectoryService } from "@calcom/features/skai-provisioning/di/Directory.container";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { DirectoryForms } from "@calcom/web/modules/skai-directory/views/directory-forms";
import { DirectoryListingView } from "@calcom/web/modules/skai-directory/views/directory-listing-view";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { _generateMetadata, getTranslate } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { addMemberAction, createOrganizationAction, createTeamAction } from "./actions";

export const generateMetadata = async () =>
  await _generateMetadata(
    (t) => t("organizations"),
    (t) => t("directory_description"),
    undefined,
    undefined,
    "/settings/admin/organizations"
  );

const Page = async () => {
  // Checked here and not only in (admin-layout): layouts do not intercept every
  // request, and this page reads every member's email across every tenant.
  const session = await getServerSession({
    req: buildLegacyRequest(await headers(), await cookies()),
  });
  if (session?.user?.role !== UserPermissionRole.ADMIN) {
    return redirect("/settings/my-account/profile");
  }

  const t = await getTranslate();
  const directory = await getDirectoryService().getDirectory();

  return (
    <SettingsHeader title={t("organizations")} description={t("directory_description")}>
      <DirectoryForms
        actions={{
          createOrganization: createOrganizationAction,
          createTeam: createTeamAction,
          addMember: addMemberAction,
        }}
        labels={{
          createOrganization: `${t("new")} ${t("organization").toLowerCase()}`,
          createTeam: `${t("new")} ${t("team").toLowerCase()}`,
          addMember: t("add_team_member"),
          name: t("name"),
          slug: t("slug"),
          email: t("email"),
          organization: t("organization"),
          team: t("team"),
          role: t("role"),
          submit: t("create"),
          add: t("add"),
          optional: t("optional"),
          assignToEventTypes: t("assign_to_team_event_types"),
        }}
      />
      <DirectoryListingView
        directory={directory}
        labels={{
          organizations: t("organizations"),
          standaloneTeams: t("standalone_teams"),
          teams: t("teams"),
          members: t("members"),
          role: t("role"),
          email: t("email"),
          empty: t("no_results"),
        }}
      />
    </SettingsHeader>
  );
};

export default Page;
