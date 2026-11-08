import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EventCard from '../../lib/events/EventCard.svelte';
import EventEditor from '../../lib/events/EventEditor.svelte';
import EventView from '../../lib/events/EventView.svelte';
import type { EditorAdapter } from '../../lib/events/editor/adapter.js';
import { buildEventRecord } from '../../lib/events/editor/save.js';
import type { FlatEventRecord } from '../../lib/events/contrail.js';
import { defaultTheme } from '../../lib/events/theme.js';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

const testPath = window.location.pathname + window.location.search;
afterEach(() => {
	vi.unstubAllGlobals();
	history.replaceState({}, '', testPath);
});

const ADDRESS = {
	$type: 'community.lexicon.location.address' as const,
	street: '12 Quiet Lane',
	locality: 'Louisville',
	country: 'US'
};

/** What the page asks for with fetch, which is how a geocoding lookup goes. */
function watchRequests() {
	const seen: string[] = [];
	vi.stubGlobal('fetch', async (input: unknown) => {
		seen.push(String(input));
		return Response.json([]);
	});
	return () => seen;
}

function editor(
	features: Partial<EditorAdapter['features']>,
	eventData: FlatEventRecord | null = null,
	adapter = createAdapter()
) {
	return render(EventEditor, {
		eventData,
		actorDid: event.did,
		rkey: event.rkey,
		adapter: { ...adapter, features: { ...adapter.features, ...features } },
		viewer
	});
}

function eventPage(
	props: { share?: boolean; map?: boolean } = {},
	eventData: FlatEventRecord = { ...event, locations: [ADDRESS] },
	adapter = createAdapter()
) {
	return render(EventView, {
		data: {
			eventData,
			actorDid: event.did,
			rkey: event.rkey,
			hostProfile: { did: event.did, handle: viewer.handle, displayName: viewer.displayName },
			attendees: { going: [], interested: [], goingCount: 0, interestedCount: 0 }
		},
		adapter,
		viewer,
		pageUrl: new URL('https://atmo.rsvp/test'),
		...props
	});
}

function recordArgs(eventData: FlatEventRecord | null) {
	return {
		eventData,
		isNew: eventData === null,
		name: 'Small web, big ideas',
		description: '',
		startsAt: '2026-12-01T18:00',
		endsAt: '',
		timezone: 'UTC',
		mode: 'inperson' as const,
		theme: defaultTheme,
		links: [],
		location: null,
		locationChanged: false,
		media: undefined,
		resolveHandle: async (handle: string) => handle
	};
}

describe('an event card', () => {
	it('links to the page it asks for', async () => {
		render(EventCard, { actor: 'host.example.com', event, href: '/somewhere/else' });
		await expect
			.element(page.getByRole('link', { name: /Small web, big ideas/ }))
			.toHaveAttribute('href', '/somewhere/else');
	});
});

describe('the editor, for an event that is not public', () => {
	it('offers no cover image when the page says it can show none', async () => {
		watchRequests();
		const offered = editor({});
		await expect
			.poll(() => document.querySelectorAll('input[type=file]').length)
			.toBeGreaterThan(0);
		await offered.unmount();
		editor({ images: false });
		await expect.element(page.getByRole('textbox', { name: 'Event name' })).toBeVisible();
		expect(document.querySelectorAll('input[type=file]')).toHaveLength(0);
	});

	it('offers no public or unlisted choice when the page says it has none', async () => {
		watchRequests();
		editor({ visibility: false });
		await expect.element(page.getByRole('textbox', { name: 'Event name' })).toBeVisible();
		expect(page.getByText('Unlisted').elements()).toHaveLength(0);
	});

	it('keeps the discovery preference the record had when it offers no choice', async () => {
		watchRequests();
		const adapter = createAdapter();
		// No showInDiscovery, so a save that wrote the switch's default would add one.
		const kept = { other: 'kept' };
		editor({ visibility: false }, { ...event, preferences: kept } as FlatEventRecord, adapter);
		await expect
			.element(page.getByRole('textbox', { name: 'Event name', exact: true }))
			.toHaveTextContent(event.name);
		await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
		await expect
			.poll(() => adapter.putRecord)
			.toHaveBeenCalledWith(
				expect.objectContaining({ record: expect.objectContaining({ preferences: kept }) })
			);
	});

	it('writes no discovery preference into a record that has none', async () => {
		const record = await buildEventRecord({ ...recordArgs(null), visibility: null });
		expect(record).not.toHaveProperty('preferences');
		const offered = await buildEventRecord({ ...recordArgs(null), visibility: 'public' });
		expect(offered.preferences).toEqual({ showInDiscovery: true });
	});
});

describe('the event page, for an event that is not public', () => {
	it('answers the record it shows, wherever that is stored', async () => {
		watchRequests();
		const adapter = createAdapter();
		const elsewhere = 'at://did:plc:elsewhereelsewhereelsewh/community.lexicon.calendar.event/kept';
		eventPage({ share: false }, { ...event, uri: elsewhere }, adapter);
		await page.getByRole('button', { name: 'Going', exact: true }).click();
		await expect.element(page.getByText("You're Going", { exact: true })).toBeVisible();
		expect(adapter.putRecord).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: 'community.lexicon.calendar.rsvp',
				record: expect.objectContaining({ subject: { uri: elsewhere } })
			})
		);
	});

	it('asks a Going guest to share a public event', async () => {
		watchRequests();
		eventPage();
		await page.getByRole('button', { name: 'Going', exact: true }).click();
		await expect.element(page.getByText("You're going!", { exact: true })).toBeVisible();
	});

	it('asks a Going guest to share nothing when the page has nothing to share', async () => {
		watchRequests();
		eventPage({ share: false });
		await page.getByRole('button', { name: 'Going', exact: true }).click();
		await expect.element(page.getByText("You're Going", { exact: true })).toBeVisible();
		expect(page.getByText("You're going!", { exact: true }).elements()).toHaveLength(0);
	});

	it('asks a new event’s host to share it when it is public', async () => {
		watchRequests();
		history.replaceState({}, '', `${window.location.pathname}?created=1`);
		eventPage();
		await expect.element(page.getByText('Event created!', { exact: true })).toBeVisible();
		expect(window.location.search).not.toContain('created');
	});

	it('still clears a new event’s flag when it has nothing to share', async () => {
		watchRequests();
		history.replaceState({}, '', `${window.location.pathname}?created=1`);
		eventPage({ share: false });
		await expect.element(page.getByRole('heading', { name: event.name })).toBeVisible();
		await expect.poll(() => window.location.search).not.toContain('created');
		expect(page.getByText('Event created!', { exact: true }).elements()).toHaveLength(0);
	});

	it('looks up a public event’s address for its map', async () => {
		const requests = watchRequests();
		eventPage();
		await expect
			.poll(() => requests().filter((url) => url.includes('/api/geocoding')))
			.toHaveLength(1);
	});

	it('leaves its address out of the geocoder with no map, and still shows it', async () => {
		const requests = watchRequests();
		eventPage({ map: false });
		await expect.element(page.getByText('12 Quiet Lane', { exact: false }).first()).toBeVisible();
		await new Promise((settled) => setTimeout(settled, 200));
		expect(requests().filter((url) => url.includes('geocoding') || url.includes('Quiet'))).toEqual(
			[]
		);
	});
});
