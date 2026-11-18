---
'@atmo-dev/kit': minor
---

`EventEditor`'s visibility switch can offer Private. `visibilityOptions` lists the choices, Public and Unlisted by default; `visibility` is bindable, so a page can follow the choice and save a private event its own way, through an adapter with `features.private: true` (the editor saves a Private event through no other); the switch can't move an existing event to or from Private; and `confirmVisibility` is asked before the choice changes, so a page can show a dialog first and return `false` to keep the current choice. With the switch shown, only a public event is saved with `showInDiscovery: true`. `EventVisibility` is exported from `events-data`. `buildEventRecord`'s `visibility` also takes `'private'`, so a switch over that type that covers every case needs a `'private'` case.
