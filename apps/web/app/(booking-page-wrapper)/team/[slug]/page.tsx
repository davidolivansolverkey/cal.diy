import { getTeamService } from "@calcom/features/team/di/Team.container";
import slugify from "@calcom/lib/slugify";
import { Avatar } from "@calcom/ui/components/avatar";
import { Badge } from "@calcom/ui/components/badge";
import type { PageProps } from "app/_types";
import { _generateMetadata, getTranslate } from "app/_utils";
import Link from "next/link";
import { notFound } from "next/navigation";

export const generateMetadata = async ({ params }: PageProps) => {
  const team = await getTeamService().getPublicProfile(slugify(String((await params).slug)));

  return await _generateMetadata(
    () => team?.name ?? "",
    () => team?.bio ?? "",
    undefined,
    undefined,
    `/team/${(await params).slug}`
  );
};

const Page = async ({ params }: PageProps) => {
  const slug = slugify(String((await params).slug));
  const team = await getTeamService().getPublicProfile(slug);
  if (!team) return notFound();

  const t = await getTranslate();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:py-20">
      <header className="mb-8 flex flex-col items-center text-center">
        <Avatar size="lg" alt={team.name} imageSrc={team.logoUrl} />
        <h1 className="text-emphasis mt-4 text-2xl font-semibold">{team.name}</h1>
        {team.bio && <p className="text-subtle mt-2 max-w-xl text-sm">{team.bio}</p>}
      </header>

      {team.eventTypes.length === 0 ? (
        <p className="text-subtle text-center text-sm">{t("team_has_no_event_types")}</p>
      ) : (
        <ul className="border-subtle bg-default divide-subtle divide-y overflow-hidden rounded-lg border">
          {team.eventTypes.map((eventType) => (
            <li key={eventType.id}>
              <Link
                href={`/team/${team.slug}/${eventType.slug}`}
                className="hover:bg-muted flex flex-col gap-1 px-4 py-4 transition sm:px-6">
                <span className="text-emphasis text-base font-semibold">{eventType.title}</span>
                {eventType.description && (
                  <span className="text-subtle line-clamp-2 text-sm">{eventType.description}</span>
                )}
                <span>
                  <Badge variant="gray" startIcon="clock">
                    {eventType.length} {t("minutes")}
                  </Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};

export default Page;
