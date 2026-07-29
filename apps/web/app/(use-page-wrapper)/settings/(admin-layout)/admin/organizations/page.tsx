import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import SettingsHeader from "@calcom/features/settings/appDir/SettingsHeader";
import { getDirectoryService } from "@calcom/features/skai-provisioning/di/Directory.container";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { DirectoryListingView } from "@calcom/web/modules/skai-directory/views/directory-listing-view";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { _generateMetadata, getTranslate } from "app/_utils";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

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
