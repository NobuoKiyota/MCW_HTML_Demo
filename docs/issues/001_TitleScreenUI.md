# Issue 001: Title Screen UI Adjustments

## Status: In Progress
## Priority: High

## Description
Adjust buttons on the Title screen as per `Todo.md`.

Button Requirements:
- Size: 300x60 (currently 100x40)
- Buttons and Positions:
    - **Home (Start)**: Pos(0, 160)
    - **Option**: Pos(0, 80)
    - **Exit**: Pos(0, 0)

## Implementation Plan
- [ ] Modify `game.html` (Title Screen section)
- [ ] Update CSS classes for button size (300x60)
- [ ] Ensure correct vertical positioning
- [ ] Implement "Exit" button functionality (if missing)

## Notes
- "Home" button on Title screen likely starts the game (Changes state to MENU or INGAME?).
- Check if "Exit" is feasible in web context (maybe close tab or redirect to portfolio).
