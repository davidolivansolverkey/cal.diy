"use client";

import AssignAllTeamMembers from "@calcom/features/eventtypes/components/AssignAllTeamMembers";
import type { CheckedSelectOption } from "@calcom/features/eventtypes/components/CheckedTeamSelect";
import { CheckedTeamSelect } from "@calcom/features/eventtypes/components/CheckedTeamSelect";
import type { EventTypeSetupProps, FormValues, Host } from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { SchedulingType } from "@calcom/prisma/enums";
import { SettingsToggle } from "@calcom/ui/components/form";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

const DEFAULT_PRIORITY = 2;
const DEFAULT_WEIGHT = 100;

type TeamMemberItem = EventTypeSetupProps["teamMembers"][number];

const toHost = (option: CheckedSelectOption, isCollective: boolean): Host => ({
  userId: Number(option.value),
  // COLLECTIVE books the whole team at once, so nobody rotates.
  isFixed: isCollective ? true : (option.isFixed ?? false),
  priority: option.priority ?? DEFAULT_PRIORITY,
  weight: option.weight ?? DEFAULT_WEIGHT,
  groupId: option.groupId ?? null,
});

const toOption = (member: TeamMemberItem, host?: Host): CheckedSelectOption => ({
  value: String(member.id),
  label: member.name ?? member.username ?? member.email,
  avatar: member.avatar,
  defaultScheduleId: member.defaultScheduleId,
  isFixed: host?.isFixed,
  priority: host?.priority,
  weight: host?.weight,
  groupId: host?.groupId ?? null,
});

export const EventTeamAssignmentTab = ({ teamMembers }: { teamMembers: TeamMemberItem[] }) => {
  const { t } = useLocale();
  const formMethods = useFormContext<FormValues>();

  const schedulingType = formMethods.watch("schedulingType");
  const hosts = formMethods.watch("hosts") ?? [];
  const isRRWeightsEnabled = formMethods.watch("isRRWeightsEnabled") ?? false;
  const [assignAllTeamMembers, setAssignAllTeamMembers] = useState(
    formMethods.getValues("assignAllTeamMembers") ?? false
  );

  const isCollective = schedulingType === SchedulingType.COLLECTIVE;
  const isRoundRobin = schedulingType === SchedulingType.ROUND_ROBIN;

  if (schedulingType === SchedulingType.MANAGED) {
    return <p className="text-subtle text-sm">{t("managed_event_description")}</p>;
  }

  const memberById = new Map(teamMembers.map((member) => [member.id, member]));
  const options = teamMembers.map((member) => toOption(member));
  const value = hosts.flatMap((host) => {
    const member = memberById.get(host.userId);
    return member ? [toOption(member, host)] : [];
  });

  const setHosts = (next: Host[]) =>
    formMethods.setValue("hosts", next, { shouldDirty: true, shouldValidate: true });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-emphasis text-sm font-semibold">{t("team")}</h3>
        <p className="text-subtle text-sm">
          {isRoundRobin ? t("round_robin_description") : t("collective_description")}
        </p>
      </div>

      <AssignAllTeamMembers
        assignAllTeamMembers={assignAllTeamMembers}
        setAssignAllTeamMembers={setAssignAllTeamMembers}
        onActive={() => setHosts(teamMembers.map((member) => toHost(toOption(member), isCollective)))}
        onInactive={() => setHosts([])}
      />

      {isRoundRobin && (
        <SettingsToggle
          title={t("enable_weights")}
          checked={isRRWeightsEnabled}
          onCheckedChange={(active) =>
            formMethods.setValue("isRRWeightsEnabled", active, { shouldDirty: true })
          }
        />
      )}

      {!assignAllTeamMembers && (
        <CheckedTeamSelect
          isRRWeightsEnabled={isRoundRobin && isRRWeightsEnabled}
          groupId={null}
          options={options}
          value={value}
          onChange={(next) => setHosts(next.map((option) => toHost(option, isCollective)))}
        />
      )}
    </div>
  );
};

export default EventTeamAssignmentTab;
