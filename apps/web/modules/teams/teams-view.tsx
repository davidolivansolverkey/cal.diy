"use client";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import slugify from "@calcom/lib/slugify";
import { MembershipRole } from "@calcom/prisma/enums";
import type { RouterOutputs } from "@calcom/trpc/react";
import { trpc } from "@calcom/trpc/react";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Dialog, DialogContent, DialogFooter } from "@calcom/ui/components/dialog";
import { EmptyScreen } from "@calcom/ui/components/empty-screen";
import { TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import Link from "next/link";
import { useState } from "react";

type Team = RouterOutputs["viewer"]["teams"]["list"][number];

const roleLabelKey: Record<MembershipRole, string> = {
  [MembershipRole.OWNER]: "owner",
  [MembershipRole.ADMIN]: "admin",
  [MembershipRole.MEMBER]: "member",
};

const CreateTeamDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  // Tracked separately so typing a name stops overwriting a hand-edited slug.
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const createMutation = trpc.viewer.teams.create.useMutation({
    onSuccess: async (team) => {
      showToast(t("team_created_successfully", { teamName: team.name }), "success");
      await utils.viewer.teams.list.invalidate();
      onOpenChange(false);
      setName("");
      setSlug("");
      setSlugTouched(false);
    },
    onError: (error) => showToast(error.message, "error"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t("create_team")} description={t("no_teams_description")} type="creation">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate({ name: name.trim(), slug });
          }}>
          <div className="flex flex-col gap-4">
            <TextField
              label={t("team_name")}
              value={name}
              required
              onChange={(event) => {
                setName(event.target.value);
                if (!slugTouched) setSlug(slugify(event.target.value));
              }}
            />
            <TextField
              label={t("slug")}
              value={slug}
              required
              addOnLeading="/team/"
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(slugify(event.target.value));
              }}
            />
          </div>
          <DialogFooter showDivider>
            <Button type="button" color="secondary" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" loading={createMutation.isPending} disabled={!name.trim() || !slug}>
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const TeamListItem = ({ team }: { team: Team }) => {
  const { t } = useLocale();

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <Link
        href={`/settings/teams/${team.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2">
        <Avatar size="md" alt={team.name} imageSrc={team.logoUrl} />
        <span className="min-w-0">
          <span className="text-emphasis block truncate text-sm font-semibold">{team.name}</span>
          {team.slug && <span className="text-subtle block truncate text-sm">/team/{team.slug}</span>}
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-2">
        {team.isOrganization && <Badge variant="orange">{t("organization")}</Badge>}
        <Badge variant="gray">{t(roleLabelKey[team.role])}</Badge>
        {/* An organization holds no event types of its own — it groups teams — so
            offering it a booking preview would only ever lead to a dead page. */}
        {team.slug && !team.isOrganization && (
          <Button color="secondary" href={`/team/${team.slug}`} target="_blank" EndIcon="external-link">
            {t("preview")}
          </Button>
        )}
      </div>
    </li>
  );
};

export const TeamsView = () => {
  const { t } = useLocale();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [animationRef] = useAutoAnimate<HTMLUListElement>();
  const { data: teams, isPending } = trpc.viewer.teams.list.useQuery();

  if (isPending) return null;

  return (
    <>
      <CreateTeamDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      {!teams?.length ? (
        <EmptyScreen
          Icon="users"
          headline={t("teams")}
          description={t("no_teams_description")}
          buttonRaw={<Button onClick={() => setDialogOpen(true)}>{t("create_team")}</Button>}
        />
      ) : (
        <>
          <div className="mb-4 flex justify-end">
            <Button data-testid="new-team" StartIcon="plus" onClick={() => setDialogOpen(true)}>
              {t("new")}
            </Button>
          </div>
          <ul
            ref={animationRef}
            className="border-subtle bg-default divide-subtle divide-y overflow-hidden rounded-lg border">
            {teams.map((team) => (
              <TeamListItem key={team.id} team={team} />
            ))}
          </ul>
        </>
      )}
    </>
  );
};

export default TeamsView;
