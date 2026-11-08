---
'@atmo-dev/kit': minor
---

Let a page show and edit an event that isn't public. All optional, and nothing changes without them. `EventCard` takes `href`. `EventView` takes `share` and `map`: `share={false}` shows no share pop-up after the event is created or someone answers Going, and `map={false}` shows no map, so neither a geocoder nor map tiles are told where the event is. `EditorAdapter.features` takes `images` and `visibility`: `images: false` hides the cover image, and `visibility: false` hides the Public / Unlisted switch and leaves the record's discovery preference as it is (`buildEventRecord` takes `visibility: null` for that). `EventView` now names the event by `eventData.uri`, so an RSVP answers the record the page shows, wherever it is stored.
