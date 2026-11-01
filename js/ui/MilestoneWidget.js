import { formatAmount } from '../upgrades/MilestoneManager.js';

/**
 * Top-centre goal tracker: the current goal and its progress, nothing else.
 * A met goal turns into a claim button; the reward arrives only when tapped.
 */
export class MilestoneWidget {
    constructor(game) {
        this.game = game;
        this._lastRender = 0;
        this._signature = '';

        const root = document.createElement('button');
        root.type = 'button';
        root.className = 'milestone-widget';
        root.id = 'milestone-widget';
        root.innerHTML = `
            <span class="milestone-row">
                <span class="milestone-goal"></span>
                <span class="milestone-count"></span>
            </span>
            <span class="milestone-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span class="milestone-fill"></span></span>`;
        document.getElementById('ui-root').appendChild(root);
        this.root = root;
        this.el = Object.fromEntries(['goal', 'count', 'track', 'fill']
            .map(name => [name, root.querySelector(`.milestone-${name}`)]));

        root.addEventListener('click', () => this.claim());
        root.addEventListener('animationend', event => {
            if (event.animationName === 'milestone-pop') root.classList.remove('claimed');
        });
        // Mobile notifications sit below the widget, whatever its height.
        new ResizeObserver(() => {
            document.body.style.setProperty('--milestone-height', `${root.offsetHeight}px`);
        }).observe(root);
        this.render(true);
    }

    claim() {
        const milestone = this.game.milestones.current;
        if (!this.game.milestones.claim()) return;
        this.game.showNotification(`${milestone.reward.title} unlocked!`);
        this.root.classList.remove('claimed');
        void this.root.offsetWidth; // restart the pop for quick successive claims
        this.root.classList.add('claimed');
        this.render(true);
    }

    /** Called from the UI loop; cheap when nothing visible changed. */
    update() {
        const now = performance.now();
        if (now - this._lastRender < 120) return;
        this._lastRender = now;
        this.render();
    }

    render(force = false) {
        const milestones = this.game.milestones;
        const milestone = milestones.current;
        const ready = milestones.ready;
        const progress = milestones.getProgress();
        const signature = `${milestone?.id}:${ready}:${Math.floor(progress.value)}`;
        if (!force && signature === this._signature) return;
        this._signature = signature;

        this.root.hidden = !milestone;
        if (!milestone) return;
        const goal = milestones.describeGoal();
        this.root.classList.toggle('ready', ready);
        this.root.disabled = !ready;
        const { title, action: verb = 'Unlock' } = milestone.reward;
        const action = verb ? `${verb} ${title}` : title;
        this.root.setAttribute('aria-label', ready ? `${goal} done. ${action}` : `Goal: ${goal}`);
        this.el.goal.textContent = ready ? action : goal;
        this.el.count.textContent = ready ? '' : `${formatAmount(progress.value)}/${formatAmount(progress.target)}`;
        this.el.fill.style.width = `${progress.fraction * 100}%`;
        this.el.track.setAttribute('aria-valuenow', String(Math.floor(progress.fraction * 100)));
    }
}
