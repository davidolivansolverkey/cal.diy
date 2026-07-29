import type { DirectoryDto, TeamNodeDto } from "@calcom/features/skai-provisioning/Directory.types";

export type DirectoryLabels = {
  organizations: string;
  standaloneTeams: string;
  teams: string;
  members: string;
  role: string;
  email: string;
  empty: string;
};

const MemberList = ({ team, labels }: { team: TeamNodeDto; labels: DirectoryLabels }) => {
  if (team.members.length === 0) {
    return <p className="text-subtle text-sm">{labels.empty}</p>;
  }

  return (
    <ul className="divide-subtle divide-y">
      {team.members.map((member) => (
        <li key={member.userId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
          <span className="text-emphasis text-sm font-medium">{member.name ?? member.username}</span>
          <span className="text-subtle text-sm">{member.email}</span>
          <span className="text-subtle text-xs uppercase">{member.role}</span>
          {!member.accepted && <span className="text-subtle text-xs">(pending)</span>}
        </li>
      ))}
    </ul>
  );
};

const TeamCard = ({
  team,
  labels,
  nested = false,
}: {
  team: TeamNodeDto;
  labels: DirectoryLabels;
  nested?: boolean;
}) => (
  <div className={nested ? "border-subtle mt-3 rounded-lg border p-4" : ""}>
    <div className="flex flex-wrap items-baseline gap-x-2">
      <h3 className="text-emphasis text-base font-semibold">{team.name}</h3>
      {team.slug && <span className="text-subtle text-sm">/{team.slug}</span>}
      <span className="text-subtle text-sm">
        · {team.members.length} {labels.members.toLowerCase()}
      </span>
    </div>

    <div className="mt-2">
      <MemberList team={team} labels={labels} />
    </div>

    {team.teams.length > 0 && (
      <div className="mt-4">
        <p className="text-subtle text-xs font-medium uppercase">{labels.teams}</p>
        {team.teams.map((child) => (
          <TeamCard key={child.id} team={child} labels={labels} nested />
        ))}
      </div>
    )}
  </div>
);

export const DirectoryListingView = ({
  directory,
  labels,
}: {
  directory: DirectoryDto;
  labels: DirectoryLabels;
}) => (
  <div className="flex flex-col gap-8">
    <section>
      <h2 className="text-emphasis mb-3 text-sm font-semibold uppercase">{labels.organizations}</h2>
      {directory.organizations.length === 0 ? (
        <p className="text-subtle text-sm">{labels.empty}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {directory.organizations.map((organization) => (
            <div key={organization.id} className="border-subtle bg-default rounded-lg border p-4">
              <TeamCard team={organization} labels={labels} />
            </div>
          ))}
        </div>
      )}
    </section>

    <section>
      <h2 className="text-emphasis mb-3 text-sm font-semibold uppercase">{labels.standaloneTeams}</h2>
      {directory.standaloneTeams.length === 0 ? (
        <p className="text-subtle text-sm">{labels.empty}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {directory.standaloneTeams.map((team) => (
            <div key={team.id} className="border-subtle bg-default rounded-lg border p-4">
              <TeamCard team={team} labels={labels} />
            </div>
          ))}
        </div>
      )}
    </section>
  </div>
);
