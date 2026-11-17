# Events

Import shared event UI from the dedicated events entry:

```svelte
<script lang="ts">
	import { EventEditor, EventView, EventCard } from '@atmo-dev/kit/events';
	import type { EditorAdapter, EditorViewer } from '@atmo-dev/kit/events-data';

	let { adapter, viewer, event, data, pageUrl } = $props();
</script>

<EventCard {event} />
<EventEditor {adapter} {viewer} eventData={event} actorDid={event.did} rkey={event.rkey} />
<EventView {adapter} {viewer} {data} {pageUrl} />
```

- `@atmo-dev/kit/events`: event cards, views, editor, RSVP/attendee/comment UI, starter-pack actions, conference timetable, VOD player/transcript. General-purpose date/time controls and `ImageDropper` are core exports from `@atmo-dev/kit`; their existing event-entry exports remain compatibility aliases. Event backgrounds and editor sections stay internal.
- `@atmo-dev/kit/events-data`: structural event types, adapter contracts, conference/date helpers, URL helpers, theme values, linked-record types and thumbnail selection. This entry is safe in plain Node and server routes: no Svelte, CSS, maps or players are loaded. Browser helpers such as `compressImage` only access browser APIs when called.
- `@atmo-dev/kit/events/editor`: `buildEventRecord` and `buildThumbnailMedia` for hosts that need explicit record construction. This separate entry includes browser-oriented thumbnail code; it is not part of the pure data API.

Event descriptions are Markdown with AT Protocol facets. Parse them on the server and pass the result as `data.description`, so the Markdown parser stays out of the client bundle:

```ts
import { parseRichText } from '@atmo-dev/kit/richtext';

const description = event.description
	? parseRichText(event.description, { facets: event.facets, markdown: true, detectLinks: true })
	: null;
```

`data.attendees` can be a sample: pass the RSVPs hydrated onto the event record together with the indexed `goingCount`/`interestedCount`, and give `EventView` a `loadAttendees` callback. The avatar strip renders from the sample, and the complete lists are fetched the first time someone opens one, only when the counts exceed the sample. The loader must reject if either group fails: Kit keeps the sample and retries on the next open; a successful empty result is treated as final.

Supply `data.viewerRsvpStatus` for signed-in viewers even when they are absent from the sample. `EventView` uses that known status to update counts after successful RSVP changes, independently of sample membership. A late attendee load preserves those local changes. When using `EventAttendees` directly with partial lists, pass the known previous status as the optional second argument to `addAttendee(attendee, previousStatus)` or `removeAttendee(did, previousStatus)`; pass `null` for no previous RSVP. Omitting the argument retains membership-based behavior for callers with complete lists.

Without `data.description`, `EventView` shows the description as plain text with facet links. Description headings render one level below the event title, and the Bluesky share card uses `richTextToPlainText(description)`. Conference schedules show talk descriptions as short previews: pass `conferenceTalkDescriptions`, plain text keyed by talk URI, so Markdown syntax does not appear there. See [Rich text](social.md#rich-text) for what is supported.

Descriptions use the app's [link embeds](social.md#link-embeds), and `EventEditor` edits them with `RichTextEditor`, showing the same formatting and embeds while typing. A link to a Bluesky post alone on its own line of a description (also on mu, Blacksky and Witchsky, or any client added to `socialClients`) is shown as the post itself. It is read in the browser from the public AppView set with `configureAtproto`; posts that are missing, hidden from logged-out viewers, or carry a moderation label (on the post, its author, or anything it quotes, at any depth) stay ordinary links. Clicking the post opens it in the viewer's preferred social client.

`EventComments` applies the same rule to the comment thread: a labeled reply is left out together with the replies beneath it.

A link to a profile on one of those clients, alone on its line, is shown as a small card with avatar, name and handle, under the same rules.

A link to another event page (`/p/<handle or DID>/e/<rkey>` on `https://atmo.rsvp` or the page's own origin), also alone on its line, is shown as an `EventCard` when the adapter's `linkedRecords` supplies `getEvent(actor, rkey)`. The host decides which events that returns; anything it rejects stays a link. `parseEventLink` from `@atmo-dev/kit/events-data` recognizes these links.

Semble collections in `uris` get a **Collections** tab, loaded on its first visit, when the adapter's `linkedRecords` supplies `getSembleCollection`; `listSembleCollections` adds the viewer's own collections to the editor's picker. Without them, collection links stay ordinary links. See [Photos and linked media](media.md).

Event components read Bluesky's public AppView and CDN by default. Apps using other services call `configureAtproto({ appview, cdn })` from `events-data` once, before rendering, on both the server and the client (for example at the top of the root layout).

Event cards and covers prefer native `media` images, then an HTTPS `poster.url`, then a URI named `Event Image` (laugh.town compatibility). `getEventExternalImage(event)` from `events-data` returns `{ url, alt, aspectRatio? }` or `null`, validating URLs and optional poster dimensions. It performs no IO; apps must apply their own allowlist/redirect policy before fetching an external image server-side.

When a new event is created with the default cover the editor gives it, and the host hasn't chosen a cover, a failed upload of that cover saves the event without it. Any other cover that fails to upload, an image or a preset the host picked, fails the save, so it is never left out silently.

Apps implement `EditorAdapter` for authentication prompts, repository IO, uploads, save/delete navigation, and optional linked-record transport/indexing notifications. Keep sessions, Cloudflare bindings, app routes, server endpoints, caching and moderation in the app. The editor/view never imports a consumer's app state. See `EventViewData` and `EditorAdapter` in the public types for the data and callback contracts.

Full event UI requires optional peers (ordinary Kit consumers do not):

```sh
pnpm add maplibre-gl@^6.16.0 svelte-maplibre-gl@^2.2.1
```

Import `theme.css` as shown in [Installation](../README.md#installation); it scans the packaged event components too, so no separate Tailwind source path is needed. Event exports are intentionally absent from the main Kit entry.

Links inside the event components follow the host's routes. Set `urls` on the adapter for an app whose pages live elsewhere; anything left out keeps the RSVP app's default:

```ts
const adapter: EditorAdapter = {
	urls: {
		profile: (actor) => `/profile/${actor}`, // default /p/:actor
		event: (actor, rkey) => `/profile/${actor}/event/${rkey}`, // default /p/:actor/e/:rkey
		edit: () => null, // default: the event's page + /edit; null hides "Edit Event"
		talks: () => null // default: the event's page + /talks; null hides "Manage talks"
	}
	// …
};
```

`profile` is used for the host, attendees added by an RSVP and mentions in the description; `event` for the share link, a talk's parent conference and timetable entries. Attendee links in `EventViewData` are the app's own, and `resolveEventUrls(adapter.urls)` from `events-data` builds them the same way. Speakers link to Bluesky.

Other host defaults remain: `/api/geocoding`, Bluesky's public comments API, the `?created` share flow and RSVP's `createdWith` identifier. Hosts need compatible endpoints for those; `shareUrlOverride` changes outbound share links.

A page can also show and edit an event that is not public, such as a record in a permissioned space. `EventCard` takes `href` for a card whose page is not `/p/:actor/e/:rkey` (a card has no adapter, so it does not read `urls`). `EventView` takes `share={false}`, so no share dialog opens after `?created` or an RSVP of Going. In `EditorAdapter.features`, `images: false` removes the cover image section and uploads no image, and `visibility: false` hides the Public / Unlisted switch and leaves the record's `preferences` unchanged.

`EventView`, `EventCard` and `EventEditor` load the images in an event's `media` from the CDN set with `configureAtproto`, by `getCDNImageBlobUrl`. A page whose event's pictures must not reach a public CDN passes `mediaUrl`, a function of `{ did, blob }` that returns the image's address (or `null` to leave that image out), such as a route of its own that serves the picture only to people who can see the event. `EventMediaUrl` from `events-data` is its type. External images (`poster`, `Event Image`) are not affected; leave them out of `eventData` if they shouldn't load.

`eventData.uri` is the address of the event record the page shows, and the kit names the event by it: an RSVP answers it, the calendar file uses it as the event's UID, the schedule shows the talks whose parent it is, and the editor reports it after a delete. A record in its creator's repo has the address `at://<did>/community.lexicon.calendar.event/<rkey>`, and the kit builds that itself when `uri` is empty. A page showing a record stored anywhere else, such as in a space, must set `uri` to that record's own address, or its RSVPs answer a record that doesn't exist.

Event browser tests are in `src/tests/events`; run `pnpm test:unit --run --project events`. `pnpm test:package` checks the actual built server entry and its runtime import graph without Vite aliases.
