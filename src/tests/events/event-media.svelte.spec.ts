import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import EventCard from '../../lib/events/EventCard.svelte';
import EventEditor from '../../lib/events/EventEditor.svelte';
import { getEventThumbnail } from '../../lib/events/event-media.js';
import { buildEventRecord, buildThumbnailMedia } from '../../lib/events/editor/save.js';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

const flyer = {
	role: 'flyer',
	alt: 'Event flyer',
	content: { $type: 'blob' as const, ref: { $link: 'test-flyer' } }
};
const thumbnail = { ...flyer, role: 'thumbnail', alt: 'Event thumbnail' };
const header = { ...flyer, role: 'header', alt: 'Event header' };

it('prefers thumbnails over flyers regardless of media order', () => {
	expect(getEventThumbnail([flyer, header, thumbnail])).toBe(thumbnail);
	expect(getEventThumbnail([thumbnail, flyer])).toBe(thumbnail);
	expect(getEventThumbnail([header, flyer])).toBe(flyer);
	expect(getEventThumbnail([header])).toBeUndefined();
	expect(getEventThumbnail(undefined)).toBeUndefined();
	expect(getEventThumbnail([])).toBeUndefined();
});

it('uses the thumbnail on cards when a flyer comes first', async () => {
	render(EventCard, { event: { ...event, media: [flyer, thumbnail] } });
	await expect
		.element(page.getByRole('img', { name: 'Event thumbnail', exact: true }))
		.toBeVisible();
	await expect
		.element(page.getByRole('img', { name: 'Event flyer', exact: true }))
		.not.toBeInTheDocument();
});

it('shows existing flyers in the thumbnail editor', async () => {
	render(EventEditor, {
		eventData: { ...event, media: [header, flyer] },
		actorDid: event.did,
		rkey: event.rkey,
		adapter: createAdapter(),
		viewer
	});
	const preview = page.getByRole('img', { name: 'Thumbnail preview', exact: true });
	await expect.element(preview).toBeVisible();
	await expect.element(preview).toHaveAttribute('src', expect.stringContaining('/test-flyer@webp'));
});

it('preserves unchanged flyers without uploading', async () => {
	const uploadBlob = vi.fn();
	const existingMedia = [header, flyer];
	expect(
		await buildThumbnailMedia({
			isNew: false,
			thumbnailChanged: false,
			thumbnailFile: null,
			existingMedia,
			uploadBlob
		})
	).toBe(existingMedia);
	expect(uploadBlob).not.toHaveBeenCalled();
});

it.each(['thumbnail', 'flyer'])('preserves the %s role when replacing its image', async (role) => {
	const image = new File(
		[
			'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"><rect width="10" height="20" /></svg>'
		],
		'cover.svg',
		{ type: 'image/svg+xml' }
	);
	const blobRef = { $type: 'blob', ref: { $link: 'replacement' } };
	const media = await buildThumbnailMedia({
		isNew: false,
		thumbnailChanged: true,
		thumbnailFile: image,
		existingMedia: [header, { ...flyer, role }],
		uploadBlob: async () => blobRef
	});
	expect(media).toEqual([
		header,
		{
			role,
			content: blobRef,
			aspect_ratio: { width: 10, height: 20 }
		}
	]);
});

it('removes a flyer without removing unrelated media', async () => {
	const media = await buildThumbnailMedia({
		isNew: false,
		thumbnailChanged: true,
		thumbnailFile: null,
		existingMedia: [flyer, header],
		uploadBlob: vi.fn()
	});
	expect(media).toEqual([header]);
});

it('does not restore a removed last image when building the record', async () => {
	const media = await buildThumbnailMedia({
		isNew: false,
		thumbnailChanged: true,
		thumbnailFile: null,
		existingMedia: [flyer],
		uploadBlob: vi.fn()
	});
	const record = await buildEventRecord({
		eventData: { ...event, media: [flyer] },
		isNew: false,
		name: event.name,
		description: '',
		startsAt: '2099-10-24T18:30',
		endsAt: '',
		timezone: 'UTC',
		mode: 'inperson',
		visibility: 'public',
		theme: event.theme!,
		links: [],
		location: null,
		locationChanged: false,
		media,
		resolveHandle: async () => viewer.did!
	});
	expect(record).not.toHaveProperty('media');
});

describe('a new event whose image does not upload', () => {
	afterEach(() => vi.restoreAllMocks());
	const prefill = { name: 'A quiet dinner', startsAt: '2099-10-24T18:30:00.000Z' };
	function newEvent(
		adapter: ReturnType<typeof createAdapter>,
		thumbnailFile?: File,
		eventData: typeof event | null = null
	) {
		adapter.uploadBlob.mockRejectedValue(new Error('upload refused'));
		vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		render(EventEditor, {
			eventData,
			actorDid: event.did,
			rkey: event.rkey,
			adapter,
			viewer,
			prefill: { ...prefill, ...(thumbnailFile ? { thumbnailFile } : {}) }
		});
	}

	/** Picks a preset cover in the thumbnail dialog, as a host does. */
	async function pickPreset(name: string) {
		await page.getByRole('button', { name: 'Change thumbnail' }).click();
		await page.getByRole('button', { name: `Use ${name} preset thumbnail`, exact: true }).click();
	}

	async function notSaved(adapter: ReturnType<typeof createAdapter>, button: string) {
		await page.getByRole('button', { name: button, exact: true }).click();
		await expect.poll(() => adapter.uploadBlob).toHaveBeenCalled();
		await expect.element(page.getByRole('button', { name: button, exact: true })).toBeEnabled();
		expect(adapter.putRecord).not.toHaveBeenCalled();
	}

	it('is not created without a preset cover its host picked', async () => {
		const adapter = createAdapter();
		newEvent(adapter);
		await pickPreset('gradient');
		await notSaved(adapter, 'Publish Event');
	});

	it('is not created without the default cover once its host picked it', async () => {
		const adapter = createAdapter();
		newEvent(adapter);
		await pickPreset('plain');
		await notSaved(adapter, 'Publish Event');
	});

	it('is not saved, when editing, without a preset cover its host picked', async () => {
		const adapter = createAdapter();
		newEvent(adapter, undefined, event);
		await expect
			.element(page.getByRole('textbox', { name: 'Event name', exact: true }))
			.toHaveTextContent(event.name);
		await pickPreset('gradient');
		await notSaved(adapter, 'Save Changes');
	});

	it('is created without the generated cover', async () => {
		const adapter = createAdapter();
		newEvent(adapter);
		await page.getByRole('button', { name: 'Publish Event', exact: true }).click();
		await expect.poll(() => adapter.putRecord).toHaveBeenCalled();
		expect(adapter.uploadBlob).toHaveBeenCalled();
		expect(adapter.putRecord.mock.calls[0][0].record).not.toHaveProperty('media');
	});

	it('is not created without the image its host chose', async () => {
		const adapter = createAdapter();
		const chosen = new File(
			[
				'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"><rect width="10" height="20" /></svg>'
			],
			'cover.svg',
			{ type: 'image/svg+xml' }
		);
		newEvent(adapter, chosen);
		await notSaved(adapter, 'Publish Event');
	});
});
