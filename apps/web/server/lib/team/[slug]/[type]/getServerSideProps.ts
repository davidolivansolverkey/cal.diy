import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { EventRepository } from "@calcom/features/eventtypes/repositories/EventRepository";
import slugify from "@calcom/lib/slugify";
import type { Props } from "@server/lib/[user]/[type]/getServerSideProps";
import { processReschedule, processSeatedEvent } from "@server/lib/[user]/[type]/getServerSideProps";
import type { GetServerSidePropsContext } from "next";
import { z } from "zod";

const paramsSchema = z.object({
  slug: z.string().transform((s) => slugify(s)),
  type: z.string().transform((s) => slugify(s)),
});

/**
 * Team counterpart of the [user]/[type] booking page. getPublicEvent's team branch
 * survived the enterprise removal intact — only this caller was missing, which left
 * team event types configurable but with no URL a booker could reach.
 */
export const getServerSideProps = async (context: GetServerSidePropsContext) => {
  const parsed = paramsSchema.safeParse(context.params);
  if (!parsed.success) return { notFound: true } as const;

  const { slug: teamSlug, type: eventSlug } = parsed.data;
  const session = await getServerSession({ req: context.req });

  const {
    rescheduleUid,
    bookingUid,
    "allow-rescheduling-cancelled-booking": allowRescheduleForCancelledBookingQuery,
  } = context.query;
  const allowRescheduleForCancelledBooking = allowRescheduleForCancelledBookingQuery === "true";

  const eventData = await EventRepository.getPublicEvent(
    {
      username: teamSlug,
      eventSlug,
      isTeamEvent: true,
      // Sub-teams resolve through their organization's domain, which this build does
      // not serve, so only top-level teams are reachable here for now.
      org: null,
      fromRedirectOfNonOrgLink: false,
    },
    session?.user?.id
  );

  if (!eventData) return { notFound: true } as const;

  const props: Props = {
    eventData,
    user: teamSlug,
    slug: eventSlug,
    isBrandingHidden: false,
    isSEOIndexable: true,
    themeBasis: null,
    bookingUid: bookingUid ? `${bookingUid}` : null,
    rescheduleUid: null,
    orgBannerUrl: null,
  };

  if (rescheduleUid) {
    const rescheduleResult = await processReschedule({
      props,
      rescheduleUid,
      session,
      allowRescheduleForCancelledBooking,
    });
    if (rescheduleResult) return rescheduleResult;
  } else if (bookingUid) {
    const seatResult = await processSeatedEvent({
      props,
      bookingUid,
      allowRescheduleForCancelledBooking,
    });
    if (seatResult) return seatResult;
  }

  return { props };
};
