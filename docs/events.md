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

Without `data.description`, `EventView` shows the description as plain text with facet links. Description headings render one level below the event title, and the Bluesky share card uses `richTextToPlainText(description)`. Conference schedules show talk descriptions as short previews: pass `conferenceTalkDescriptions`, plain text keyed by talk URI, so Markdown syntax does not appear there. See [Rich text](social.md#rich-text) for what is supported.

Event components read Bluesky's public AppView and CDN by default. Apps using other services call `configureAtproto({ appview, cdn })` from `events-data` once, before rendering, on both the server and the client (for example at the top of the root layout).

Event cards and covers prefer native `media` images, then an HTTPS `poster.url`, then a URI named `Event Image` (laugh.town compatibility). `getEventExternalImage(event)` from `events-data` returns `{ url, alt, aspectRatio? }` or `null`, validating URLs and optional poster dimensions. It performs no IO; apps must apply their own allowlist/redirect policy before fetching an external image server-side.

Apps implement `EditorAdapter` for authentication prompts, repository IO, uploads, save/delete navigation, and optional linked-record transport/indexing notifications. Keep sessions, Cloudflare bindings, app routes, server endpoints, caching and moderation in the app. The editor/view never imports a consumer's app state. See `EventViewData` and `EditorAdapter` in the public types for the data and callback contracts.

Full event UI requires optional peers (ordinary Kit consumers do not):

```sh
pnpm add maplibre-gl@^6.16.0 svelte-maplibre-gl@^2.2.1 plyr@^3.8.5
```

Import `theme.css` as shown in [Installation](../README.md#installation); it scans the packaged event components too, so no separate Tailwind source path is needed. Event exports are intentionally absent from the main Kit entry.

Current host defaults include: `/p/:actor/e/:rkey` event and `/p/:actor` profile links, `/api/geocoding`, Bluesky's public comments API, the `?created` share flow and RSVP's `createdWith` identifier. Hosts currently need compatible routes/endpoints; `shareUrlOverride` changes outbound share links. These defaults are not a universal routing contract; check compatibility before integrating.

A page can also show and edit an event that isn't public, such as a record in a space that only its guests can read. `EventCard` takes `href` for a card whose page is not `/p/:actor/e/:rkey`. `EventView` takes `share={false}`, so no share pop-up opens after `?created` or a Going answer, and `map={false}`, so neither `/api/geocoding` nor map tiles are told where the event is; the address still shows and links out. In `EditorAdapter.features`, `images: false` offers and uploads no cover image, and `visibility: false` hides the Public / Unlisted switch and leaves the record's `preferences` as they are. What a page chooses to show is a prop; what the host can store is an adapter feature. `EventView` and the editor name the event by `eventData.uri`, so it must be the record's own URI. The editor's location search still calls `/api/geocoding`.

Event browser tests are in `src/tests/events`; run `pnpm test:unit --run --project events`. `pnpm test:package` checks the actual built server entry and its runtime import graph without Vite aliases.
