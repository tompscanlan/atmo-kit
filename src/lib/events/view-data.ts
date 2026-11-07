import type { AttendeeInfo, FlatEventRecord, HostProfile } from './contrail.js';

/** App-loaded data for EventView; fetching and authorization stay in the host. */
export interface EventViewData {
	eventData: FlatEventRecord;
	actorDid: string;
	rkey: string;
	hostProfile?: HostProfile | null;
	attendees: {
		going: AttendeeInfo[];
		interested: AttendeeInfo[];
		goingCount?: number;
		interestedCount?: number;
	};
	viewerRsvpStatus?: 'going' | 'interested' | 'notgoing' | null;
	viewerRsvpRkey?: string | null;
	/** The event's URI when it is not in its creator's public repo, such as a record in a space. */
	eventUri?: string;
	/** False for an event with no public page to share. */
	shareable?: boolean;
	ogImage?: string;
	speakerProfiles?: Array<{ id?: string; handle?: string; name: string; avatar?: string }>;
	parentEvent?: FlatEventRecord | null;
	parentEventActor?: string | null;
	parentScheduleUrl?: string | null;
	vod?: { playlistUrl: string } | null;
	conferenceTalks?: FlatEventRecord[];
	conferenceTimezone?: string;
	conferenceRsvpStatuses?: Record<string, string>;
	conferenceRsvpRkeys?: Record<string, string>;
	conferenceVods?: Record<string, { playlistUrl: string; subtitlesUrl?: string }>;
	loggedIn?: boolean;
}
