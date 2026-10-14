import { TABS } from './uiSchema.js';
import { GAME_BOUNDS } from '../config/GameBoundsConfig.js';

/** Coordinates navigation and mobile sheets without owning game state. */
export class ChromeController {
    constructor(game) {
        this.game = game;
        this.root = document.getElementById('ui-root');
        this.tabs = document.getElementById('tab-list');
        this.lastTab = 'upgrades';
        this.lastMoreTab = 'stats';
        this.mobile = matchMedia('(max-width: 700px)');
        this.panels = [...document.querySelectorAll('.tab-content')];
        this.bottomControls = [document.querySelector('.tab-bar'), document.getElementById('show-menu')];
        this.panels.forEach(panel => {
            panel.querySelector('.panel-close').addEventListener('click', () => game.ui.hideActiveTab());
            panel.querySelector('.sheet-handle').addEventListener('click', () => {
                if (this.wasDragged) { this.wasDragged = false; return; }
                panel.classList.toggle('sheet-full');
            });
            this.bindSheetGestures(panel);
            panel.querySelectorAll('[data-more-view]').forEach(button => button.addEventListener('click', () => game.ui.showTab(button.dataset.moreView)));
        });
        document.getElementById('more-tab').addEventListener('click', () => game.ui.toggleTab(this.lastMoreTab));
        document.getElementById('show-menu').addEventListener('click', () => game.ui.expandAllTabs());
        this.bindRailGestures();
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') game.ui.hideActiveTab();
        });
        new MutationObserver(() => this.sync()).observe(this.root, { attributes: true, attributeFilter: ['class'], subtree: true });
        this.mobile.addEventListener('change', () => this.sync());
        this.sync();
        this.animateCamera();
        document.addEventListener('click', event => {
            if (event.target.closest('.upgrade-buy-button, .building-buy-section > button')) {
                const button = event.target.closest('button');
                if (!button?.disabled) {
                    button.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }], { duration: 420 });
                }
            }
        });
    }

    sync() {
        const active = this.panels.find(panel => panel.classList.contains('active'));
        const id = active?.id.replace('-content', '');
        if (id) this.lastTab = id;
        const more = ['stats', 'settings', 'cheats', 'bot'].includes(id);
        if (more) this.lastMoreTab = id;
        for (const tab of TABS) {
            const button = document.getElementById(`${tab.id}-tab`);
            button.classList.toggle('active', tab.id === id);
            button.setAttribute('aria-expanded', String(tab.id === id));
        }
        const moreButton = document.getElementById('more-tab');
        moreButton.classList.toggle('active', more);
        moreButton.setAttribute('aria-expanded', String(more));
        const tucked = this.tabs.classList.contains('collapsed');
        document.body.classList.toggle('menu-tucked', tucked);
        document.body.classList.toggle('panel-open', !!active);
        const collapse = document.getElementById('collapse-button');
        collapse.setAttribute('aria-expanded', String(!tucked));
        collapse.setAttribute('aria-label', tucked ? 'Show the menu' : 'Tuck the menu away');
        active?.querySelectorAll('[data-more-view]').forEach(button => button.classList.toggle('active', button.dataset.moreView === id));
        if (active && more) {
            active.querySelector('.panel-header h1').firstChild.textContent = this.mobile.matches ? 'More' : TABS.find(tab => tab.id === id).label;
        }
    }

    bindSheetGestures(panel) {
        let gesture = null;
        panel.addEventListener('pointerdown', event => {
            if (!this.mobile.matches || event.target.closest('input,select,textarea,button:not(.sheet-handle),a')) return;
            const handle = !!event.target.closest('.sheet-handle, .panel-header');
            this.wasDragged = false;
            gesture = { x: event.clientX, y: event.clientY, height: panel.offsetHeight, handle, moved: false };
            if (handle) (event.target.closest('.sheet-handle') ?? panel).setPointerCapture(event.pointerId);
        });
        panel.addEventListener('pointermove', event => {
            if (!gesture || !gesture.handle) return;
            const dy = event.clientY - gesture.y;
            if (Math.abs(dy) < 6 && !gesture.moved) return;
            gesture.moved = true;
            event.preventDefault();
            panel.style.transition = 'none';
            panel.style.setProperty('height', `${Math.max(80, Math.min(innerHeight - 184, gesture.height - dy))}px`, 'important');
            panel.style.setProperty('max-height', 'none');
        });
        const release = event => {
            if (!gesture) return;
            const dx = event.clientX - gesture.x;
            const dy = event.clientY - gesture.y;
            panel.style.transition = '';
            panel.style.height = '';
            panel.style.maxHeight = '';
            if (gesture.handle && gesture.moved) {
                this.wasDragged = true;
                if (dy > 260 || (dy > 60 && !panel.classList.contains('sheet-full'))) this.game.ui.hideActiveTab();
                else if (dy < -50) panel.classList.add('sheet-full');
                else if (dy > 60) panel.classList.remove('sheet-full');
            } else if (Math.abs(dx) > 75 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                this.swipePanel(panel, dx < 0 ? 1 : -1);
            }
            gesture = null;
        };
        panel.addEventListener('pointerup', release);
        panel.addEventListener('pointercancel', () => { panel.style.height = ''; panel.style.maxHeight = ''; panel.style.transition = ''; gesture = null; });
    }

    swipePanel(panel, direction) {
        if (panel.id === 'recipes-content') {
            const steps = [...panel.querySelectorAll('[data-workshop-step]')];
            if (steps.length) {
                const selected = steps.findIndex(step => step.classList.contains('active'));
                steps[(selected + direction + steps.length) % steps.length].click();
                return;
            }
        }
        const available = TABS.filter(tab => !document.getElementById(`${tab.id}-tab`).classList.contains('unlock-hidden'));
        const index = available.findIndex(tab => `${tab.id}-content` === panel.id);
        if (index !== -1) this.game.ui.showTab(available[(index + direction + available.length) % available.length].id);
    }

    bindRailGestures() {
        let start = null;
        const rail = document.querySelector('.tab-bar');
        rail.addEventListener('pointerdown', event => {
            if (this.mobile.matches) {
                start = { x: event.clientX, y: event.clientY };
                this.railWasSwiped = false;
                (event.target.closest('button') ?? rail).setPointerCapture(event.pointerId);
            }
        });
        rail.addEventListener('pointerup', event => {
            if (!start) return;
            const dy = event.clientY - start.y;
            if (Math.abs(dy) > 35 && Math.abs(dy) > Math.abs(event.clientX - start.x)) {
                this.railWasSwiped = true;
                if (dy > 0) { this.tabs.classList.add('collapsed'); this.game.ui.hideActiveTab(); }
                else { this.game.ui.expandAllTabs(); this.game.ui.showTab(this.lastTab); }
            }
            start = null;
        });
        rail.addEventListener('click', event => {
            if (this.railWasSwiped) {
                event.preventDefault();
                event.stopImmediatePropagation();
                this.railWasSwiped = false;
            }
        }, true);
        rail.addEventListener('pointercancel', () => { start = null; this.railWasSwiped = false; });
    }

    /** Find the top of the mobile tab bar or its tucked menu button. */
    getMobileDockTop() {
        let top = this.game.renderer2D.canvas.getBoundingClientRect().bottom;
        for (const element of this.bottomControls) {
            if (!element) continue;
            if (element === this.tabs.parentElement && this.tabs.classList.contains('unlock-hidden')) continue;
            const style = getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) continue;
            const bounds = element.getBoundingClientRect();
            if (bounds.height > 0 && bounds.bottom > 0 && bounds.top < top) top = Math.max(0, bounds.top);
        }
        return top;
    }

    /** Keep the tab bar below ground objects; input shares the adjusted camera. */
    animateCamera() {
        const tick = () => {
            const renderer = this.game.renderer2D;
            if (renderer && !this.game.cinematicManager?.isPlaying && !this.game.grandFinaleManager?.active) {
                if (this.mobile.matches || this.cameraWasPanned) {
                    if (this.mobile.matches && !this.cameraWasPanned) this.cameraBaselineY = renderer.cameraY;
                    const baseline = this.cameraBaselineY ?? 0;
                    let target = baseline;
                    let dockTarget = baseline;
                    if (this.mobile.matches && renderer.canvas.clientHeight > 0) {
                        const canvas = renderer.canvas.getBoundingClientRect();
                        const unitsPerPixel = renderer.virtualHeight / renderer.canvas.clientHeight / renderer.cameraZoom;
                        // Allow space for feet/launcher bases below their world origin.
                        const groundY = Math.min(GAME_BOUNDS.WORLD_GROUND_Y, GAME_BOUNDS.WORLD_LAUNCHER_Y, GAME_BOUNDS.CROWD_Y) - 16;
                        const clearY = this.getMobileDockTop() - 16;
                        dockTarget = Math.min(baseline, groundY + (clearY - canvas.top - canvas.height / 2) * unitsPerPixel);
                        const active = this.panels.find(panel => panel.classList.contains('active'));
                        if (active && ['upgrades-content', 'buildings-content', 'crowd-content'].includes(active.id)) {
                            const shift = Math.max(0, innerHeight - active.getBoundingClientRect().top + 24);
                            target = baseline - Math.min(shift, innerHeight * .52) * unitsPerPixel;
                        }
                        target = Math.min(target, dockTarget);
                    }
                    let next = renderer.cameraY + (target - renderer.cameraY) * .12;
                    // The closed tab bar must never cover the ground while the camera eases.
                    if (this.mobile.matches) next = Math.min(next, dockTarget);
                    if (Math.abs(next - target) < .3) next = target;
                    if (next !== renderer.cameraY) renderer.setCamera({ x: renderer.cameraX, y: next, zoom: renderer.cameraZoom });
                    this.cameraWasPanned = this.mobile.matches || next !== baseline;
                }
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }
}
