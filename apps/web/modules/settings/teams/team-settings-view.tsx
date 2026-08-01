"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import slugify from "@calcom/lib/slugify";
import { MembershipRole } from "@calcom/prisma/enums";
import { trpc } from "@calcom/trpc/react";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { ConfirmationDialogContent, Dialog } from "@calcom/ui/components/dialog";
import { TextAreaField, TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MANAGER_ROLES: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.ADMIN];
const ROLES = [MembershipRole.MEMBER, MembershipRole.ADMIN, MembershipRole.OWNER];

const selectClassName =
  "border-default bg-default text-emphasis rounded-md border px-2 py-1 text-sm disabled:opacity-50";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-subtle bg-default rounded-lg border p-4 sm:p-6">
    <h2 className="text-emphasis mb-4 text-base font-semibold">{title}</h2>
    {children}
  </section>
);

export const TeamSettingsView = ({ teamId }: { teamId: number }) => {
  const { t } = useLocale();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: me } = useMeQuery();

  const { data: team, isPending, error } = trpc.viewer.teams.get.useQuery({ teamId });

  const [name, setName] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const invalidate = async () => {
    await utils.viewer.teams.get.invalidate({ teamId });
    await utils.viewer.teams.list.invalidate();
  };

  const updateMutation = trpc.viewer.teams.update.useMutation({
    onSuccess: async () => {
      showToast(t("team_updated_successfully"), "success");
      await invalidate();
    },
    onError: (mutationError) => showToast(mutationError.message, "error"),
  });

  const roleMutation = trpc.viewer.teams.changeMemberRole.useMutation({
    onSuccess: invalidate,
    onError: (mutationError) => showToast(mutationError.message, "error"),
  });

  const removeMutation = trpc.viewer.teams.removeMember.useMutation({
    onSuccess: invalidate,
    onError: (mutationError) => showToast(mutationError.message, "error"),
  });

  const deleteMutation = trpc.viewer.teams.delete.useMutation({
    onSuccess: async () => {
      showToast(t("team_deleted_successfully"), "success");
      await utils.viewer.teams.list.invalidate();
      router.push("/teams");
    },
    onError: (mutationError) => showToast(mutationError.message, "error"),
  });

  if (isPending) return null;
  if (error || !team) return <p className="text-subtle text-sm">{error?.message ?? t("no_results")}</p>;

  const myRole = team.members.find((member) => member.userId === me?.id)?.role;
  // The server enforces all of this; the UI only reflects it so nobody is
  // offered a control that will come back as a 403.
  const canManage = !!myRole && MANAGER_ROLES.includes(myRole);
  const canDelete = myRole === MembershipRole.OWNER;

  return (
    <div className="flex flex-col gap-6">
      <Section title={t("profile")}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            updateMutation.mutate({
              teamId,
              name: (name ?? team.name).trim(),
              slug: slug ?? team.slug ?? undefined,
              bio: bio ?? team.bio ?? undefined,
            });
          }}>
          <TextField
            label={t("team_name")}
            value={name ?? team.name}
            disabled={!canManage}
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            label={t("slug")}
            addOnLeading="/team/"
            value={slug ?? team.slug ?? ""}
            disabled={!canManage}
            onChange={(event) => setSlug(slugify(event.target.value))}
          />
          <TextAreaField
            name="bio"
            label={t("about")}
            value={bio ?? team.bio ?? ""}
            disabled={!canManage}
            onChange={(event) => setBio(event.target.value)}
          />
          {canManage && (
            <div>
              <Button type="submit" loading={updateMutation.isPending}>
                {t("save")}
              </Button>
            </div>
          )}
        </form>
      </Section>

      <Section title={t("members")}>
        <ul className="divide-subtle divide-y">
          {team.members.map((member) => {
            const isMe = member.userId === me?.id;
            return (
              <li
                key={member.userId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="text-emphasis truncate text-sm font-medium">
                    {member.name ?? member.username ?? member.email}
                  </p>
                  <p className="text-subtle truncate text-sm">{member.email}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {!member.accepted && <Badge variant="orange">{t("pending")}</Badge>}
                  {canManage ? (
                    <select
                      className={selectClassName}
                      value={member.role}
                      disabled={roleMutation.isPending}
                      onChange={(event) =>
                        roleMutation.mutate({
                          teamId,
                          userId: member.userId,
                          role: event.target.value as MembershipRole,
                        })
                      }>
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {t(role.toLowerCase())}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge variant="gray">{t(member.role.toLowerCase())}</Badge>
                  )}

                  {(canManage || isMe) && (
                    <Button
                      color="destructive"
                      variant="icon"
                      StartIcon="trash"
                      tooltip={isMe ? t("leave") : t("remove")}
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate({ teamId, userId: member.userId })}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      {canDelete && (
        <Section title={t("danger_zone")}>
          <p className="text-subtle mb-4 text-sm">{t("delete_team_confirmation_message")}</p>
          <Button color="destructive" onClick={() => setDeleteOpen(true)}>
            {t("disband_team")}
          </Button>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <ConfirmationDialogContent
              variety="danger"
              title={t("disband_team")}
              confirmBtnText={t("confirm_disband_team")}
              isPending={deleteMutation.isPending}
              onConfirm={() => deleteMutation.mutate({ teamId })}>
              {t("delete_team_confirmation_message")}
            </ConfirmationDialogContent>
          </Dialog>
        </Section>
      )}
    </div>
  );
};

export default TeamSettingsView;
