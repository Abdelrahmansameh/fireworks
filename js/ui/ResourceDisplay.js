export default class ResourceDisplay {
    constructor(game) {
        this.game = game;
        this.container = null;
        this.compactContainer = null;
        this.createDisplayElements();
    }

    createDisplayElements() {
        // Create expanded display
        this.container = document.createElement('div');
        this.container.className = 'resource-display';
        this.container.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            padding: 10px;
            border-radius: 5px;
            color: white;
            font-family: Arial, sans-serif;
            z-index: 1000;
        `;

        // Create compact display
        this.compactContainer = document.createElement('div');
        this.compactContainer.className = 'resource-display-compact';
        this.compactContainer.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.7);
            padding: 5px;
            border-radius: 3px;
            color: white;
            font-family: Arial, sans-serif;
            font-size: 0.9em;
            z-index: 1000;
            display: none;
        `;

        document.body.appendChild(this.container);
        document.body.appendChild(this.compactContainer);
    }

    update() {
        const gold = this.game.resourceManager.resources.gold;
        
        // Update expanded display
        this.container.innerHTML = `
            <div style="display: flex; align-items: center; gap: 5px;">
                <span style="color: gold;">⭐</span>
                <span>${gold.formatAmount()}</span>
                <span style="font-size: 0.8em; color: #aaa;">(+${gold.perSecond.toFixed(1)}/s)</span>
            </div>
        `;

        // Update compact display
        this.compactContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 3px;">
                <span style="color: gold;">⭐</span>
                <span>${gold.formatAmount()}</span>
            </div>
        `;
    }

    setCompactMode(compact) {
        this.container.style.display = compact ? 'none' : 'block';
        this.compactContainer.style.display = compact ? 'block' : 'none';
    }
}
