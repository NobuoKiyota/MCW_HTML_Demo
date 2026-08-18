import copy

class HistoryManager:
    def __init__(self, max_depth=100):
        self.max_depth = max_depth
        self.undo_stack = []
        self.redo_stack = []
        
    def clear(self):
        self.undo_stack.clear()
        self.redo_stack.clear()
        
    def push_state(self, state):
        """Push a deep copy of the state onto the undo stack and clear redo stack."""
        # Deep copy to ensure nested dicts are fully copied and decoupled
        state_copy = copy.deepcopy(state)
        
        # If we have a current state, push it. 
        # (Usually main app holds the current active state, 
        # and we push the previous state before modifying it).
        self.undo_stack.append(state_copy)
        
        # Enforce depth limit
        if len(self.undo_stack) > self.max_depth:
            self.undo_stack.pop(0)
            
        self.redo_stack.clear()
        
    def undo(self, current_state):
        """
        Roll back to the previous state.
        Returns the new state, or None if Undo is not possible.
        """
        if not self.undo_stack:
            return None
            
        # Push current state to redo stack
        self.redo_stack.append(copy.deepcopy(current_state))
        
        # Pop previous state
        prev_state = self.undo_stack.pop()
        return prev_state
        
    def redo(self, current_state):
        """
        Roll forward to the next state.
        Returns the new state, or None if Redo is not possible.
        """
        if not self.redo_stack:
            return None
            
        # Push current state to undo stack
        self.undo_stack.append(copy.deepcopy(current_state))
        
        # Pop next state
        next_state = self.redo_stack.pop()
        return next_state
        
    def can_undo(self):
        return len(self.undo_stack) > 0
        
    def can_redo(self):
        return len(self.redo_stack) > 0
