# Memory: index.md
Updated: now

# Project Memory

## Core
- Music player with PWA offline caching, YouTube integration, and AI karaoke.
- Accent color #FF3B3B. Pure black #000000 background for mobile player.
- SF Pro Display Heavy is strictly required for all lyrics states.
- Lyrics layout must remain perfectly stable; no horizontal sweeping/shifting.
- Disable blur effects on lyrics to maintain absolute text clarity.
- Audio playback hierarchy: IndexedDB cache > local store > remote URLs.
- Custom image assets are required for core playback controls (Play/Pause/Skip).
- Leaderboard view removed from desktop sidebar and mobile nav.

## Memories
- [Project Overview](mem://project/overview) — High-level app features and goals
- [Lyrics Rendering Logic](mem://features/lyrics/rendering-logic) — <nl> tag handling and companion line positioning
- [Dual Lyric Lines](mem://features/lyrics/dual-lines) — <dual> tag for parallel simultaneous lines, secondary brightens on its own karaoke timing
- [Lyrics Background](mem://style/lyrics-background-logic) — Animated gradient blobs sampling track artwork colors
- [Offline Playback](mem://features/offline-playback) — IndexedDB caching, single-audio guard, offline-first lyrics+karaoke, timeouts
- [Admin Controls](mem://features/admin-controls) — MP3 uploads and TheAudioDB artwork fetching
- [Karaoke UI Behavior](mem://features/karaoke/ui-behavior) — Lyrics remain filled as they scroll
- [Karaoke Editor](mem://features/karaoke/editor-logic) — Mobile-responsive sync interface with timeline slider
- [Audio Resolution](mem://tech/audio-resolution) — Cache priority logic and database record deduplication
- [Lyrics Playback Logic](mem://features/lyrics/playback-logic) — Scroll-to-browse, tap-to-seek, and UI locking
- [Karaoke Animations](mem://features/karaoke/animation-refinement) — Word upliftment, gradient masks, and scale/glow effects
- [API Reliability](mem://tech/api-reliability-strategy) — Retry logic for external metadata providers
- [Role Management](mem://features/admin-controls/role-management) — Admin access provisioning
- [Library Home Integration](mem://features/library/home-integration) — Adding tracks to personal library from homepage
- [Lyrics Formatting Constraints](mem://features/lyrics/formatting-constraints) — Inline <nl> tag rules
- [Lyrics UI Controls](mem://features/lyrics/ui-controls) — Knotless volume/progress sliders and desktop toggles
- [Lyrics Intro Animation](mem://features/lyrics/intro-animation) — 3-circle breathing sequence before lyrics start
- [Playback Indicators](mem://features/audio-playback/indicators) — Lossless badge for local MP3 playback
- [Static Lyrics Mode](mem://features/lyrics/static-mode) — Fallback logic for plain lyrics
- [Player Controls Style](mem://style/player-controls) — Custom white icons for playback, grey for utility
- [Lyrics Emphasis Tags](mem://features/lyrics/emphasis-tags) — <em> tag animations
- [Lyrics Credits](mem://features/lyrics/credits) — "Written By" footer integration
- [Admin User Management](mem://features/admin-controls/user-management) — Cross-table account discovery bypassing RLS
- [Lyrics Visual Effects](mem://features/lyrics/visual-effects) — Blur disabled for active/inactive text
- [Lyrics Display Timing](mem://features/lyrics/display-timing) — Early appearance configurations
- [Lyrics Typography](mem://style/lyrics-typography) — Font families and mobile sizing
- [Lyrics Mobile Formatting](mem://features/lyrics/mobile-formatting) — Admin-configurable word wrapping
- [Mobile Player Setup](mem://features/mobile-player) — Fullscreen overlay and responsive behaviors
