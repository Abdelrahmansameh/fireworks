import { state } from './state.js';

class UndoManager {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
        this.onStateRestored = null; // Callback assigned externally
    }

    save() {
        // Deep clone current state
        const stateSnapshot = JSON.parse(JSON.stringify({
            meshData: state.meshData,
            selectedPartId: state.selectedPartId,
            currentAnimId: state.currentAnimId
        }));
        
        this.undoStack.push(stateSnapshot);
        this.redoStack = []; // Clear redo stack on new action
        
        if (this.undoStack.length > state.MAX_UNDO_STATES) {
            this.undoStack.shift();
        }
    }

    undo() {
        if (this.undoStack.length === 0) return;

        // Save current to redo before applying undo
        const currentState = JSON.parse(JSON.stringify({
            meshData: state.meshData,
            selectedPartId: state.selectedPartId,
            currentAnimId: state.currentAnimId
        }));
        this.redoStack.push(currentState);

        const stateSnapshot = this.undoStack.pop();
        this.applyState(stateSnapshot);
    }

    redo() {
        if (this.redoStack.length === 0) return;

        // Save current to undo before applying redo
        const currentState = JSON.parse(JSON.stringify({
            meshData: state.meshData,
            selectedPartId: state.selectedPartId,
            currentAnimId: state.currentAnimId
        }));
        this.undoStack.push(currentState);

        const stateSnapshot = this.redoStack.pop();
        this.applyState(stateSnapshot);
    }

    applyState(stateSnapshot) {
        state.meshData = stateSnapshot.meshData;
        state.selectedPartId = stateSnapshot.selectedPartId;
        state.currentAnimId = stateSnapshot.currentAnimId;

        if (this.onStateRestored) {
            this.onStateRestored();
        }
    }
}

export const undoManager = new UndoManager();

export function saveState() {
    undoManager.save();
}
