# Release plan

The end goal is the game released on every platform: web, itch.io, Android, iOS and Steam. This page sorts the wanted features into what goes in before release and what is cut until after. The point is to keep the scope from growing. A feature not listed under "Before release" waits until the game is out.

## Before release (small, and needed)

- **Settings as slidable blocks**, in a pre-made area near the island's exit:
  - sound effects on/off (a block slid along a lane works as a volume slider);
  - music on/off;
  - username (the leaderboard needs it);
  - soul style (the styles exist: comet, flame, glint).
- **Sounds:**
  - a sound for each interaction that has none;
  - a theme song.
  - Both can come from the audio designer's pack (docs/audio-plan.md).
- **A link to GitHub** in the game.
- **Platforms**, all from the one web build:
  - itch.io as an HTML5 game: the smallest step, needing no wrapper;
  - a desktop executable (Tauri or Electron) for itch.io and Steam;
  - Android: a Trusted Web Activity or Capacitor wrapper;
  - iOS: Capacitor, which needs a Mac and a paid Apple developer account;
  - Steam: a $100 fee, the desktop build, a store page with capsule art and a trailer.
- **A trailer:** gameplay recorded from the real game (the bot that plays goals can drive it), cut to the theme song.

## Cut until after release (a lot of work, not needed to ship)

- Sign-in and accounts. The device id plus `?p=` carries progress well enough.
- Multiplayer, the MMO server, offline and home islands, and group picture puzzles. The multiplayer setting goes with them.
- Ads (Unity Ads, AdMob and others). They need consent dialogs and a different integration on each platform, and pay little at a small player count.
- A coin shop, skins and hats.
- God levels, the bot-solved levels (docs/grim-god.md). They are a side mode for programmers.
- Cutscenes (docs/cutscenes.md).
- Loose goals, shapes and the daily board. The daily board is small and could come back if there is time.

## Open: earning money, or not

You don't need the money. A price mostly decides how the game feels and who finds it.

1. Free everywhere, with optional support: pay-what-you-want on itch.io, and a small "support the developer" purchase in the app stores. This brings the most players for the least work. (Recommended.)
2. Free on web and mobile, with a small price on Steam ($2 to $5). Steam players take a priced game more seriously, and free games get lost there.
3. A one-time purchase that unlocks the game, with codes for the other platforms. This is the most "professional" feel, but it means building codes and accounts first.
4. Ads, with a purchase to remove them. This is the most work and goes against the calm puzzle feel.

Cosmetics (soul styles, a leaderboard icon) can be earned by playing rather than bought. That keeps the reward without a shop.
