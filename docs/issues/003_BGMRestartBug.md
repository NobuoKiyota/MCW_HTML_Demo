# Issue 003: BGM Restart Bug Fix

## Status: In Progress
## Priority: High

## Description
BGM restarts (plays from beginning) when returning to the Home screen, causing an annoying audio gap/overlap.

## Expected Behavior
BGM "OUTGAME" should continue playing seamlessly if it is already playing.

## Technical Details
- `SoundManager.playBGM` is called on state change.
- Need to check if `currentBgmKey` is already the requested key and if it's playing to avoid re-triggering `play()`.

## Implementation Plan
- [ ] Modify `SoundManager.js` -> `playBGM` function.
- [ ] Add check: `if (!force && this.currentBgmKey === key && this.bgmPlayers[key] && !this.bgmPlayers[key].paused) return;`

## Notes
- The logic seems to be partially there, need to verify why it's failing (maybe `force` flag usage or `currentBgmKey` mismatch).
