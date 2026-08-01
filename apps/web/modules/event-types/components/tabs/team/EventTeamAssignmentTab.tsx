"use client";

import type { EventTypeSetupProps, FormValues, Host } from "@calcom/features/eventtypes/lib/types";

/** Derived from the tab map's own prop so the two can never drift apart. */
type TeamMemberItem = EventTypeSetupProps["teamMembers"][number];

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SchedulingType } from "@calcom/prisma/enums";
import classNames from "@calcom/ui/classNames";
import { useFormContext } from "react-hook-form";

const DEFAULT_PRIORITY = 2;
const DEFAULT_WEIGHT = 100;
const PRIORITIES = [0, 1, 2, 3, 4];

const buildHost = (userId: number, isCollective: boolean): Host => ({
  userId,
  // COLLECTIVE books every host at once, so none of them rotate.
  isFixed: isCollective,
  priority: DEFAULT_PRIORITY,
  weight: DEFAULT_WEIGHT,
  groupId: null,
});

/**
 * orgId, team and eventType come from the tab map but are not needed here: the
 * hosts live in the shared form, and the members arrive already resolved.
 */
export const EventTeamAssignmentTab = ({
  teamMembers,
}: {
  teamMembers: TeamMemberItem[];
  orgId?: number | null;
  team?: unknown;
  eventType?: unknown;
}) => {
  const { t } = useLocale();
  const formMethods = useFormContext<FormValues>();

  const schedulingType = formMethods.watch("schedulingType");
  const hosts = formMethods.watch("hosts") ?? [];

  const isCollective = schedulingType === SchedulingType.COLLECTIVE;
  const isRoundRobin = schedulingType === SchedulingType.ROUND_ROBIN;

  if (schedulingType === SchedulingType.MANAGED) {
    return <p className="text-subtle text-sm">{t("managed_event_description")}</p>;
  }

  const setHosts = (next: Host[]) =>
    formMethods.setValue("hosts", next, { shouldDirty: true, shouldValidate: true });

  const toggleHost = (userId: number, checked: boolean) =>
    setHosts(
      checked ? [...hosts, buildHost(userId, isCollective)] : hosts.filter((host) => host.userId !== userId)
    );

  const patchHost = (userId: number, patch: Partial<Host>) =>
    setHosts(hosts.map((host) => (host.userId === userId ? { ...host, ...patch } : host)));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-emphasis text-sm font-semibold">{t("team")}</h3>
        <p className="text-subtle text-sm">
          {isRoundRobin ? t("round_robin_description") : t("collective_description")}
        </p>
      </div>

      {teamMembers.length === 0 ? (
        <p className="text-subtle text-sm">{t("no_results")}</p>
      ) : (
        <ul className="divide-subtle border-subtle divide-y rounded-lg border">
          {teamMembers.map((member) => {
            const userId = member.id;
            const host = hosts.find((candidate) => candidate.userId === userId);

            return (
              <li key={member.id} className="flex flex-wrap items-center gap-3 p-3">
                <label className="flex min-w-56 flex-1 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(host)}
                    onChange={(event) => toggleHost(userId, event.target.checked)}
                  />
                  <span className="text-emphasis text-sm font-medium">
                    {member.name ?? member.username ?? member.email}
                  </span>
                  <span className="text-subtle text-sm">{member.email}</span>
                </label>

                {host && isRoundRobin && (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={host.isFixed}
                        onChange={(event) => patchHost(userId, { isFixed: event.target.checked })}
                      />
                      {/* A fixed host is on every booking; the rest take turns. */}
                      <span className="text-subtle text-sm">{t("fixed_host")}</span>
                    </label>

                    <label className="flex items-center gap-2">
                      <span className="text-subtle text-sm">{t("priority")}</span>
                      <select
                        className="border-default bg-default text-emphasis rounded-md border px-2 py-1 text-sm"
                        value={host.priority}
                        disabled={host.isFixed}
                        onChange={(event) => patchHost(userId, { priority: Number(event.target.value) })}>
                        {PRIORITIES.map((priority) => (
                          <option key={priority} value={priority}>
                            {priority}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-2">
                      <span className="text-subtle text-sm">{t("weight")}</span>
                      <input
                        type="number"
                        min={0}
                        className={classNames(
                          "border-default bg-default text-emphasis w-20 rounded-md border px-2 py-1 text-sm",
                          host.isFixed && "opacity-50"
                        )}
                        value={host.weight}
                        disabled={host.isFixed}
                        onChange={(event) => patchHost(userId, { weight: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default EventTeamAssignmentTab;
