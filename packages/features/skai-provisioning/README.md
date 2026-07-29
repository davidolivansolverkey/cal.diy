# SKAI provisioning

Provisions a client company as a Cal.diy **team** with round-robin scheduling, driven by
SKAI Central when a tenant is onboarded.

## Why this exists

Cal.com deleted the teams/organizations control plane (`packages/features/ee`) when the project
was relicensed to MIT. The **data model and the booking engine survived**: `Team`, `Membership`,
`EventType.schedulingType`, `Host.priority`/`weight`, and the 889-line weighted round-robin
selection in `packages/features/bookings/lib/getLuckyUser.ts` are all intact and unmodified.

What is gone is the UI and the tRPC routers that used to create teams. This slice replaces only
the provisioning path we actually need, written from scratch against the MIT schema. It does not
restore any deleted code.

## Endpoint

```
POST /api/skai/provision-company
x-skai-secret: $SKAI_PROVISIONING_SECRET
content-type: application/json
```

The endpoint is disabled (401) whenever `SKAI_PROVISIONING_SECRET` is unset, so an instance that
does not opt in is never exposed.

### Request

```json
{
  "tenantId": "b3f1…",
  "company": { "name": "Santos-Ochoa", "slug": "santos-ochoa", "timeZone": "Europe/Madrid" },
  "members": [
    { "name": "Ana Ruiz", "email": "ana@santos-ochoa.es" },
    { "name": "Luis Gil", "email": "luis@santos-ochoa.es", "priority": 4, "weight": 200 }
  ],
  "eventType": {
    "title": "Cita comercial",
    "slug": "cita",
    "lengthInMinutes": 30,
    "schedulingType": "ROUND_ROBIN"
  }
}
```

`priority` (0-4) and `weight` are the values the booking engine's lucky-user selection reads;
they default to 2 and 100, matching what Cal.com's own event-type UI wrote.

### Response `201`

```json
{
  "teamId": 10,
  "teamSlug": "santos-ochoa",
  "eventTypeId": 20,
  "eventTypeSlug": "cita",
  "apiKey": "cal_9f…",
  "members": [{ "userId": 100, "email": "ana@santos-ochoa.es", "username": "santos-ochoa-ana", "linkedExistingUser": false }]
}
```

**Store `apiKey` immediately** — only a SHA-256 hash is persisted, so it cannot be retrieved later.
It is created with `teamId` set, which is what populates `request.organizationId` in API v2's
api-key auth strategy.

### Response `409`

The slug is already provisioned. The body carries the existing `teamId`, so a retried onboarding
can treat it as success instead of creating a duplicate company.

## Giving members access to Cal.diy

Each provisioned member gets a `passwordSetupUrl` in the response, pointing at Cal.diy's own
`/auth/forgot-password/:id` flow. SKAI emails it (via Resend); the member sets a password and can
then log in to manage **their own availability, calendar connections and personal event types** —
that per-user UI survived the enterprise removal.

The link is valid for 72 hours, longer than Cal.diy's 6-hour self-service reset window because it
travels through an onboarding email rather than being requested by the user in the moment.

**Members linked from a pre-existing account never get a link.** Issuing one would let a newly
provisioned company obtain a password reset for a login that already belongs to someone else.

To re-issue a link (expired, or a member provisioned earlier):

```
POST /api/skai/setup-link
x-skai-secret: $SKAI_PROVISIONING_SECRET

{ "email": "ana@santos-ochoa.es" }
```

Returns `201` with `{ email, passwordSetupUrl, expiresAt }`, or `404` if no account exists for that
email — it never creates a user as a side effect.

### What members cannot do in the UI

The **team** event type will not appear in their event-type list: `getTeamIdsWithPermission` is a
stub returning `[]`, so team-scoped listings come back empty. The team event type is managed
programmatically through this slice and the API. What matters for round-robin is each host's own
availability, and that they can manage.

## What it writes

One transaction, because a half-provisioned company is unbookable and has to be cleaned up by hand:

| Row | Notes |
|---|---|
| `Team` | `metadata.skaiTenantId` links it back to SKAI's `tenants.id` |
| `User` per member | `completedOnboarding: true`, `emailVerified` set; **no password** |
| `Schedule` + `Availability` | `DEFAULT_SCHEDULE` (Mon-Fri 09:00-17:00), set as `defaultScheduleId` |
| `Membership` | `accepted: true`; the first member is `OWNER`, the rest `MEMBER` |
| `EventType` | `teamId` + `schedulingType` |
| `Host` per member | `isFixed` only for `COLLECTIVE`; `priority` and `weight` per member |
| `ApiKey` | `hashedKey` = SHA-256 of the unprefixed key, scoped to the team |

Members are created without a password on purpose — they set one through the normal
forgot-password flow when they first need to connect a calendar. An account whose email already
exists is **linked** rather than duplicated, because `User.email` is globally unique.

## Known limitations inherited from the MIT build

These are properties of cal.diy, not of this code:

- **No public team booking page.** The `/team/[slug]/[type]` route was deleted, and `apps/web`
  never passes `isTeamEvent`, so team event types are bookable **only through the API**
  (`GET /v2/slots?eventTypeId=…` then `POST /v2/bookings`).
- **Round-robin reassignment is a no-op.** `POST /v2/bookings/:uid/reassign` returns 200 and does
  nothing.
- **`rescheduleWithSameRoundRobinHost` is not honoured** — the filter behind it returns `null`.
- **Qualified-host filtering is a no-op on the booking path** while it works on the slots path, so
  the two can disagree about which hosts are eligible, and there is no fallback when qualified
  hosts are busy. Initial round-robin assignment is unaffected because the engine splits on the
  `Host.isFixed` flag this slice writes.
- **Team-scoped listings return empty** wherever `getTeamIdsWithPermission` is consulted: the PBAC
  stub returns `[]`. Do not build reads on top of it.
