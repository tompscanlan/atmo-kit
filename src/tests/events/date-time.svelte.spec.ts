import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Fixture from './DateTimeFixture.svelte';
import EventEditor from '../../lib/events/EventEditor.svelte';
import { TimezonePicker } from '../../lib/index.js';
import RecurringModal from '../../lib/events/editor/RecurringModal.svelte';
import { createAdapter, event, viewer } from './fixtures.js';
import './theme.css';

function renderEditor() {
	const adapter = createAdapter();
	render(EventEditor, {
		eventData: {
			...event,
			timezone: 'UTC',
			startsAt: '2030-06-15T10:00:00Z',
			endsAt: '2030-06-15T11:00:00Z'
		},
		actorDid: event.did,
		rkey: event.rkey,
		viewer,
		adapter
	});
	return adapter;
}

describe('event date/time controls', () => {
	it('keeps a time chosen from the list', async () => {
		render(Fixture);
		await page.getByRole('button', { name: 'Choose start time', exact: true }).click();
		await page.getByRole('button', { name: '6:30 PM', exact: true }).click();
		await expect
			.element(page.getByRole('status', { name: 'Value' }))
			.toHaveTextContent('2030-06-15T18:30');
	});

	it('keeps external date and time changes', async () => {
		render(Fixture);
		await page.getByRole('button', { name: 'Replace value' }).click();
		await expect
			.element(page.getByRole('button', { name: /^Start date:/ }))
			.toHaveAccessibleName(/Jul 20/);
		await expect.element(page.getByRole('spinbutton', { name: 'hour' })).toHaveTextContent('6');
		await expect.element(page.getByRole('spinbutton', { name: 'minute' })).toHaveTextContent('30');
	});

	it('keeps typed hour and minute segments', async () => {
		render(Fixture);
		await page.getByRole('spinbutton', { name: 'hour' }).click();
		await userEvent.keyboard('09');
		await page.getByRole('spinbutton', { name: 'minute' }).click();
		await userEvent.keyboard('45');
		await expect
			.element(page.getByRole('status', { name: 'Value' }))
			.toHaveTextContent('2030-06-15T09:45');
	});

	it('allows intermediate end times while typing, validates on save, then saves the completed time', async () => {
		const adapter = renderEditor();
		const end = page.getByRole('group', { name: 'End time', exact: true });
		const hour = end.getByRole('spinbutton', { name: 'hour' });
		await hour.click();
		await userEvent.keyboard('06');
		await expect.element(hour).toHaveTextContent('6');
		await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
		await expect
			.element(page.getByText('End time must be after the start time.', { exact: true }))
			.toBeVisible();
		expect(adapter.putRecord).not.toHaveBeenCalled();

		await end.getByRole('spinbutton', { name: 'AM/PM' }).click();
		await userEvent.keyboard('p');
		await end.getByRole('spinbutton', { name: 'minute' }).click();
		await userEvent.keyboard('45');
		await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
		await expect
			.poll(() => adapter.putRecord)
			.toHaveBeenCalledWith(
				expect.objectContaining({
					record: expect.objectContaining({
						startsAt: '2030-06-15T10:00:00.000Z',
						endsAt: '2030-06-15T18:45:00.000Z'
					})
				})
			);
	});

	it('still moves the end forward when the start moves past it', async () => {
		const adapter = renderEditor();
		await page.getByRole('button', { name: 'Choose start time', exact: true }).click();
		await page.getByRole('button', { name: '1:30 PM', exact: true }).click();
		await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
		await expect
			.poll(() => adapter.putRecord)
			.toHaveBeenCalledWith(
				expect.objectContaining({
					record: expect.objectContaining({
						startsAt: '2030-06-15T13:30:00.000Z',
						endsAt: '2030-06-15T14:30:00.000Z'
					})
				})
			);
	});

	it('rejects invalid end times for recurring copies too', async () => {
		const adapter = createAdapter();
		render(RecurringModal, {
			open: true,
			rkey: event.rkey,
			eventData: event,
			isNew: false,
			name: event.name,
			startsAt: '2030-06-15T10:00',
			endsAt: '2030-06-15T06:00',
			timezone: 'UTC',
			mode: 'inperson',
			description: '',
			links: [],
			location: null,
			thumbnailDateStr: '',
			thumbnailFile: null,
			thumbnailChanged: false,
			selectedPreset: null,
			accent: 'pink',
			adapter,
			viewer,
			visibility: 'public',
			privacyRefusal: () => null
		});
		await page.getByRole('button', { name: /^Create \d+ events$/ }).click();
		await expect
			.element(page.getByText('End time must be after the start time.', { exact: true }))
			.toBeVisible();
		expect(adapter.putRecord).not.toHaveBeenCalled();
	});

	it('handles browsers whose supported timezones already include UTC', async () => {
		const supported = vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue(['Asia/Tokyo', 'UTC']);
		try {
			render(TimezonePicker, { value: 'UTC' });
			await page.getByRole('button', { name: 'Timezone: UTC', exact: true }).click();
			await expect.element(page.getByRole('dialog', { name: 'Choose timezone' })).toBeVisible();
			expect(page.getByRole('button', { name: /^UTC/ }).elements()).toHaveLength(1);
			await page.getByRole('button', { name: /^Tokyo/ }).click();
			await expect
				.element(page.getByRole('button', { name: 'Timezone: Asia/Tokyo', exact: true }))
				.toBeVisible();
		} finally {
			supported.mockRestore();
		}
	});

	it('searches and selects multiple timezones without losing the wall-clock time', async () => {
		render(Fixture);
		for (const [search, zone] of [
			['Tokyo', 'Asia/Tokyo'],
			['New York', 'America/New_York'],
			['UTC', 'UTC']
		]) {
			await page.getByRole('button', { name: /^Timezone:/ }).click();
			await page.getByRole('searchbox', { name: 'Search timezone' }).fill(search);
			await page.getByRole('button', { name: new RegExp(`^${search}`) }).click();
			await expect.element(page.getByRole('status', { name: 'Zone' })).toHaveTextContent(zone);
			await expect
				.element(page.getByRole('status', { name: 'Value' }))
				.toHaveTextContent('2030-06-15T10:00');
		}
	});
});
