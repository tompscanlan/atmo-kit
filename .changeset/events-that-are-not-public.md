---
'@atmo-dev/kit': minor
---

Let a page show and edit an event that isn't public. All optional, and nothing changes without them. `EventCard` takes `href`. `EventViewData` takes `eventUri` and `shareable`; `shareable: false` turns off the share prompts, the map and geocoding on the event page. `EditorAdapter.features` takes `images`, `visibility` and `locationSearch`; `locationSearch: false` takes a typed address, so what the host types goes to no geocoder.
