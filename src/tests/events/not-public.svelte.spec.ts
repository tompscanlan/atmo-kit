import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EventCard from '../../lib/events/EventCard.svelte';
import EventEditor from '../../lib/events/EventEditor.svelte';
import EventView from '../../lib/events/EventView.svelte';
import type { EditorAdapter } from '../../lib/events/editor/adapter.js';
import { typedLocation } from '../../lib/events/editor/location.js';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

afterEach(() => vi.unstubAllGlobals());

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

function editor(features: Partial<EditorAdapter['features']>) {
	const adapter = createAdapter();
	return render(EventEditor, {
		eventData: null,
		actorDid: event.did,
		rkey: event.rkey,
		adapter: { ...adapter, features: { ...adapter.features, ...features } },
		viewer
	});
}

function eventPage(
	shareable: boolean | undefined,
	more: { eventUri?: string } = {},
	adapter = createAdapter()
) {
	return render(EventView, {
		data: {
			eventData: { ...event, locations: [ADDRESS] },
			actorDid: event.did,
			rkey: event.rkey,
			hostProfile: { did: event.did, handle: viewer.handle, displayName: viewer.displayName },
			attendees: { going: [], interested: [], goingCount: 0, interestedCount: 0 },
			shareable,
			...more
		},
		adapter,
		viewer,
		pageUrl: new URL('https://atmo.rsvp/test')
	});
}

describe('a typed address', () => {
	it('keeps what was typed and resolves the country', () => {
		expect(
			typedLocation({ street: ' 12 Quiet Lane ', locality: '', region: 'KY', country: 'usa' })
		).toEqual({ street: '12 Quiet Lane', region: 'KY', country: 'US' });
	});

	it('needs a country the lexicon can take', () => {
		for (const country of ['', 'Nowhere']) {
			expect(typedLocation({ street: 'x', locality: '', region: '', country })).toBeNull();
		}
	});

	it('goes to no geocoder when the page turns the search off', async () => {
		const requests = watchRequests();
		editor({ locationSearch: false });
		await page.getByRole('button', { name: 'Add location' }).click();
		await expect
			.element(page.getByRole('textbox', { name: 'Search location' }))
			.not.toBeInTheDocument();
		await userEvent.fill(page.getByRole('textbox', { name: 'Street' }), '12 Quiet Lane');
		await userEvent.fill(page.getByRole('textbox', { name: 'Country' }), 'United States');
		await page.getByRole('button', { name: 'Use this location' }).click();
		await expect.element(page.getByText('12 Quiet Lane, US')).toBeVisible();
		expect(requests().filter((url) => url.includes('geocoding') || url.includes('Quiet'))).toEqual(
			[]
		);
	});

	it('says what is missing when the country is not one', async () => {
		watchRequests();
		editor({ locationSearch: false });
		await page.getByRole('button', { name: 'Add location' }).click();
		await userEvent.fill(page.getByRole('textbox', { name: 'Country' }), 'Nowhere');
		await page.getByRole('button', { name: 'Use this location' }).click();
		await expect.element(page.getByText('Enter a country')).toBeVisible();
	});

	it('leaves the search in place for everyone else', async () => {
		const requests = watchRequests();
		editor({});
		await page.getByRole('button', { name: 'Add location' }).click();
		await userEvent.fill(page.getByRole('textbox', { name: 'Search location' }), 'Louisville');
		await page.getByRole('button', { name: 'Search', exact: true }).click();
		await expect
			.poll(() => requests().filter((url) => url.includes('/api/geocoding')))
			.toHaveLength(1);
	});
});

describe('an event that is not public', () => {
	it('links its card to the page it asks for', async () => {
		render(EventCard, { actor: 'host.example.com', event, href: '/somewhere/else' });
		await expect
			.element(page.getByRole('link', { name: /Small web, big ideas/ }))
			.toHaveAttribute('href', '/somewhere/else');
	});

	it('offers no public or unlisted choice when the page says it has none', async () => {
		watchRequests();
		editor({ visibility: false });
		await expect.element(page.getByRole('textbox', { name: 'Event name' })).toBeVisible();
		expect(page.getByText('Unlisted').elements()).toHaveLength(0);
	});

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

	it('answers the event the page names, not one in its creator’s repo', async () => {
		watchRequests();
		const adapter = createAdapter();
		const elsewhere = 'at://did:plc:elsewhereelsewhereelsewh/community.lexicon.calendar.event/kept';
		eventPage(false, { eventUri: elsewhere }, adapter);
		await page.getByRole('button', { name: 'Going', exact: true }).click();
		await expect.element(page.getByText("You're Going", { exact: true })).toBeVisible();
		expect(adapter.putRecord).toHaveBeenCalledWith(
			expect.objectContaining({
				collection: 'community.lexicon.calendar.rsvp',
				record: expect.objectContaining({ subject: { uri: elsewhere } })
			})
		);
	});

	it('looks up a public event, so these specs would see a lookup', async () => {
		const requests = watchRequests();
		eventPage(undefined);
		await expect
			.poll(() => requests().filter((url) => url.includes('/api/geocoding')))
			.toHaveLength(1);
	});

	it('leaves its address out of the geocoder and still shows it', async () => {
		const requests = watchRequests();
		eventPage(false);
		await expect.element(page.getByText('12 Quiet Lane', { exact: false }).first()).toBeVisible();
		await new Promise((settled) => setTimeout(settled, 200));
		expect(requests().filter((url) => url.includes('geocoding') || url.includes('Quiet'))).toEqual(
			[]
		);
	});
});
