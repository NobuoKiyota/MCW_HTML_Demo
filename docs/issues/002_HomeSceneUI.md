# Issue 002: Home Scene UI Adjustments

## Status: In Progress
## Priority: High

## Description
Adjust buttons on the Home (Ship Terminal) screen as per `Todo.md`.

Button Requirements:
- Size: 300x60 (currently 100x40)
- Buttons and Positions:
    - **Title**: Pos(0, 160) - Return to Title Screen
    - **Option**: Pos(0, 80)
    - **Mission**: Pos(0, 0)
    - **Custom**: Pos(0, -80) - "Ship Edit" / Customization
    - **Upgrade**: Pos(0, -160)

## Implementation Plan
- [ ] Modify `game.html` (Main Menu section)
- [ ] Update CSS to support 5 vertical buttons
- [ ] Map "Custom" button to existing `SHIP EDIT` functionality
- [ ] Add "Title" button with `engine.changeState(GAME_STATE.TITLE)`

## Notes
- Need to ensure BGM doesn't restart when navigating (See Issue #003).
