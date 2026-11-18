import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Visibility } from '../../lib/events/editor/types.js';
import { createAdapter, event, viewer } from './fixtures.js';
import VisibilityFixture from './VisibilityFixture.svelte';
import './theme.css';

const choice = (name: string) => page.getByRole('radio', { name, exact: true });
const chosen = () => page.getByRole('status', { name: 'Chosen visibility' });

/** An adapter that saves where only invited people can see the event. */
function createPrivateAdapter() {
	const adapter = createAdapter();
	return { ...adapter, features: { ...adapter.features, private: true } };
}

async function publishedPreferences(adapter: ReturnType<typeof createAdapter>) {
	await page.getByRole('button', { name: 'Publish Event', exact: true }).click();
	await expect.poll(() => adapter.putRecord.mock.calls.length).toBe(1);
	const [{ record }] = adapter.putRecord.mock.calls[0];
	return record.preferences as { showInDiscovery?: boolean } | undefined;
}

describe('the editor visibility switch', () => {
	it('offers Public and Unlisted by default', async () => {
		render(VisibilityFixture, { adapter: createAdapter(), viewer });
		await expect.element(choice('Public')).toBeVisible();
		await expect.element(choice('Unlisted')).toBeVisible();
		expect(choice('Private').elements()).toHaveLength(0);
	});

	it('offers Private when the page lists it, and the bound value follows the pick', async () => {
		render(VisibilityFixture, {
			adapter: createAdapter(),
			viewer,
			visibilityOptions: ['public', 'unlisted', 'private']
		});
		await choice('Private').click();
		await expect.element(chosen()).toHaveTextContent('private');
		await expect.element(page.getByText('Only people you invite can see it.')).toBeVisible();
		await choice('Unlisted').click();
		await expect.element(chosen()).toHaveTextContent('unlisted');
	});

	it('keeps the current choice when the page declines the change', async () => {
		const confirmVisibility = vi.fn<(next: Visibility) => boolean>(() => false);
		render(VisibilityFixture, {
			adapter: createAdapter(),
			viewer,
			visibilityOptions: ['public', 'unlisted', 'private'],
			confirmVisibility
		});
		await choice('Private').click();
		await expect.poll(() => confirmVisibility.mock.calls.length).toBe(1);
		expect(confirmVisibility).toHaveBeenCalledWith('private');
		await expect.element(chosen()).toHaveTextContent('public');
		await expect.element(choice('Public')).toHaveAttribute('aria-checked', 'true');
		await expect.element(choice('Private')).toHaveAttribute('aria-checked', 'false');
	});

	it('switches once the page accepts the change, however long it takes', async () => {
		let accept: (ok: boolean) => void = () => {};
		const confirmVisibility = vi.fn<(next: Visibility) => Promise<boolean>>(
			() => new Promise<boolean>((resolve) => (accept = resolve))
		);
		render(VisibilityFixture, {
			adapter: createAdapter(),
			viewer,
			visibilityOptions: ['public', 'unlisted', 'private'],
			confirmVisibility
		});
		await choice('Private').click();
		await expect.poll(() => confirmVisibility.mock.calls.length).toBe(1);
		await expect.element(chosen()).toHaveTextContent('public');
		accept(true);
		await expect.element(chosen()).toHaveTextContent('private');
		await expect.element(choice('Private')).toHaveAttribute('aria-checked', 'true');
	});

	it('asks before every change, and not when the host picks the current choice', async () => {
		const confirmVisibility = vi.fn<(next: Visibility) => boolean>(() => true);
		render(VisibilityFixture, {
			adapter: createAdapter(),
			viewer,
			visibilityOptions: ['public', 'unlisted', 'private'],
			confirmVisibility
		});
		await choice('Unlisted').click();
		await expect.element(chosen()).toHaveTextContent('unlisted');
		await choice('Public').click();
		await expect.element(chosen()).toHaveTextContent('public');
		await choice('Public').click();
		await expect.element(choice('Public')).toHaveAttribute('aria-checked', 'true');
		expect(confirmVisibility.mock.calls.map(([next]) => next)).toEqual(['unlisted', 'public']);
	});

	it('keeps an existing private event private, with no other choice', async () => {
		render(VisibilityFixture, {
			adapter: createPrivateAdapter(),
			viewer,
			// A private event's record says nothing about being private; the page knows.
			eventData: { ...event, preferences: { showInDiscovery: false } } as typeof event,
			visibilityOptions: ['public', 'unlisted', 'private'],
			initialVisibility: 'private'
		});
		await expect.element(choice('Private')).toHaveAttribute('aria-checked', 'true');
		await expect.element(chosen()).toHaveTextContent('private');
		expect(choice('Public').elements()).toHaveLength(0);
		expect(choice('Unlisted').elements()).toHaveLength(0);
	});

	it('does not offer Private for an existing public event', async () => {
		render(VisibilityFixture, {
			adapter: createAdapter(),
			viewer,
			eventData: event,
			visibilityOptions: ['public', 'unlisted', 'private']
		});
		await expect.element(choice('Public')).toHaveAttribute('aria-checked', 'true');
		await expect.element(choice('Unlisted')).toBeVisible();
		expect(choice('Private').elements()).toHaveLength(0);
	});

	it('opens an existing event through a private adapter as private', async () => {
		render(VisibilityFixture, {
			adapter: createPrivateAdapter(),
			viewer,
			eventData: { ...event, preferences: { showInDiscovery: false } } as typeof event,
			visibilityOptions: ['public', 'unlisted', 'private']
		});
		await expect.element(chosen()).toHaveTextContent('private');
		expect(choice('Unlisted').elements()).toHaveLength(0);
	});

	it('refuses a private save with the switch hidden, too', async () => {
		const base = createAdapter();
		const adapter = { ...base, features: { ...base.features, visibility: false } };
		render(VisibilityFixture, { adapter, viewer, initialVisibility: 'private' });
		await page.getByRole('button', { name: 'Publish Event', exact: true }).click();
		await expect.element(page.getByRole('alert')).toBeVisible();
		expect(adapter.putRecord).not.toHaveBeenCalled();
	});

	it('offers no recurring copies of a private event without a private adapter', async () => {
		render(VisibilityFixture, {
			adapter: createAdapter(),
			viewer,
			eventData: event,
			initialVisibility: 'private'
		});
		await expect.element(chosen()).toHaveTextContent('private');
		expect(page.getByRole('button', { name: 'Add recurring events' }).elements()).toHaveLength(0);
	});

	it('holds the choice while saving, and drops a pick still waiting', async () => {
		const adapter = createAdapter();
		let finishSave: () => void = () => {};
		adapter.putRecord.mockImplementation(
			() => new Promise((resolve) => (finishSave = () => resolve({ uri: event.uri })))
		);
		let accept: (ok: boolean) => void = () => {};
		const confirmVisibility = vi.fn<(next: Visibility) => Promise<boolean>>(
			() => new Promise<boolean>((resolve) => (accept = resolve))
		);
		render(VisibilityFixture, {
			adapter,
			viewer,
			visibilityOptions: ['public', 'unlisted', 'private'],
			confirmVisibility
		});
		await choice('Unlisted').click();
		await expect.poll(() => confirmVisibility.mock.calls.length).toBe(1);
		await page.getByRole('button', { name: 'Publish Event', exact: true }).click();
		await expect.poll(() => adapter.putRecord.mock.calls.length).toBe(1);
		await expect.element(choice('Private')).toBeDisabled();
		accept(true);
		finishSave();
		await expect.poll(() => adapter.onSaved.mock.calls.length).toBe(1);
		await expect.element(chosen()).toHaveTextContent('public');
		expect(adapter.putRecord.mock.calls[0][0].record.preferences).toEqual({
			showInDiscovery: true
		});
	});

	it('keeps the newest choice when an older one is accepted after it', async () => {
		const answers = new Map<Visibility, (ok: boolean) => void>();
		const confirmVisibility = vi.fn<(next: Visibility) => Promise<boolean>>(
			(next) => new Promise<boolean>((resolve) => answers.set(next, resolve))
		);
		render(VisibilityFixture, {
			adapter: createAdapter(),
			viewer,
			visibilityOptions: ['public', 'unlisted', 'private'],
			confirmVisibility
		});
		await choice('Unlisted').click();
		await choice('Private').click();
		await expect.poll(() => confirmVisibility.mock.calls.length).toBe(2);
		answers.get('private')!(true);
		await expect.element(chosen()).toHaveTextContent('private');
		answers.get('unlisted')!(true);
		// Give the older answer the time it would need to land.
		await new Promise((resolve) => setTimeout(resolve, 50));
		await expect.element(chosen()).toHaveTextContent('private');
		await expect.element(choice('Private')).toHaveAttribute('aria-checked', 'true');
	});

	it('refuses to save a private event where everyone could see it', async () => {
		const adapter = createAdapter();
		render(VisibilityFixture, {
			adapter,
			viewer,
			visibilityOptions: ['public', 'unlisted', 'private']
		});
		await choice('Private').click();
		await expect.element(chosen()).toHaveTextContent('private');
		await page.getByRole('button', { name: 'Publish Event', exact: true }).click();
		await expect.element(page.getByRole('alert')).toBeVisible();
		expect(adapter.putRecord).not.toHaveBeenCalled();
		expect(adapter.onSaved).not.toHaveBeenCalled();
	});

	it('saves a private event as not in discovery', async () => {
		const adapter = createPrivateAdapter();
		render(VisibilityFixture, {
			adapter,
			viewer,
			visibilityOptions: ['public', 'unlisted', 'private']
		});
		await choice('Private').click();
		await expect.element(chosen()).toHaveTextContent('private');
		expect(await publishedPreferences(adapter)).toEqual({ showInDiscovery: false });
	});

	it('still saves a public event as in discovery', async () => {
		const adapter = createAdapter();
		render(VisibilityFixture, { adapter, viewer });
		expect(await publishedPreferences(adapter)).toEqual({ showInDiscovery: true });
	});

	it("sets the bound value from an existing event's record", async () => {
		render(VisibilityFixture, {
			adapter: createAdapter(),
			viewer,
			eventData: { ...event, preferences: { showInDiscovery: false } } as typeof event
		});
		await expect.element(chosen()).toHaveTextContent('unlisted');
		await expect.element(choice('Unlisted')).toHaveAttribute('aria-checked', 'true');
	});
});
