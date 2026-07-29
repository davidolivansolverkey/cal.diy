"use server";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import {
  addMemberInputSchema,
  createOrganizationInputSchema,
  createTeamInputSchema,
  removeMemberInputSchema,
} from "@calcom/features/skai-provisioning/Directory.types";
import { getDirectoryService } from "@calcom/features/skai-provisioning/di/Directory.container";
import { UserPermissionRole } from "@calcom/prisma/enums";
import { buildLegacyRequest } from "@lib/buildLegacyCtx";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";

const PATH = "/settings/admin/organizations";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Server actions bypass layouts entirely, so the admin check cannot live in
 * (admin-layout) — it has to be re-done on every mutation.
 */
async function assertInstanceAdmin(): Promise<void> {
  const session = await getServerSession({
    req: buildLegacyRequest(await headers(), await cookies()),
  });

  if (session?.user?.role !== UserPermissionRole.ADMIN) {
    throw new Error("Only instance admins can manage organizations and teams");
  }
}

function optional(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? undefined : text;
}

async function run(action: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await assertInstanceAdmin();
    await action();
    revalidatePath(PATH);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function createOrganizationAction(formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = createOrganizationInputSchema.parse({
      name: formData.get("name"),
      slug: formData.get("slug"),
      autoAcceptEmailDomain: optional(formData.get("autoAcceptEmailDomain")) ?? "",
    });
    await getDirectoryService().createOrganization(input);
  });
}

export async function createTeamAction(formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = createTeamInputSchema.parse({
      name: formData.get("name"),
      slug: formData.get("slug"),
      organizationSlug: optional(formData.get("organizationSlug")),
    });
    await getDirectoryService().createTeam(input);
  });
}

export async function addMemberAction(formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = addMemberInputSchema.parse({
      teamSlug: formData.get("teamSlug"),
      name: formData.get("name"),
      email: formData.get("email"),
      role: optional(formData.get("role")) ?? "MEMBER",
      assignToEventTypes: formData.get("assignToEventTypes") === "on",
    });
    await getDirectoryService().addMember(input);
  });
}

export async function removeMemberAction(formData: FormData): Promise<ActionResult> {
  return run(async () => {
    const input = removeMemberInputSchema.parse({
      teamSlug: formData.get("teamSlug"),
      email: formData.get("email"),
    });
    await getDirectoryService().removeMember(input);
  });
}
