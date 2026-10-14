import { DEFAULT_RECIPE_COMPONENTS, COMPONENT_PROPERTY_RANGES, GENERIC_RECIPE_NAMES } from '../config/RecipeConfig.js';
import { patternDefinitions, patternDisplayNames } from '../entities/patterns/index.js';
import { gameStorage } from '../platform/GameStorage.js';
import { WORKSHOP_COLORS } from './panels/recipesPanel.js';
import { miniature, sparkMiniature } from './WorkshopMiniatures.js';
import { doodleIcon } from './doodleIcons.js';
const sparkNames = { sphere: 'Dot', star: 'Star', ring: 'Ring', crystalDroplet: 'Droplet', sliceBurst: 'Slice', triangle: 'Triangle', glow: 'Glow' };

/** The workshop edits the same recipe that launchers and saved fireworks use. */
export class WorkshopScreen {
    constructor(game) {
        this.game = game;
        this.selectedLayer = 0;
        this.step = 'shape';
        this.mode = 'editor';
        this.content = document.getElementById('recipes-content');
        this.panel = this.content?.querySelector('.workshop-panel');
        this.preview = document.getElementById('creator-scene');
        if (!this.panel || !this.preview) return;
        game.workshop = this;

        if (typeof game.randomizeRecipe !== 'function') game.randomizeRecipe = () => this.shuffle();
        this.media = window.matchMedia('(max-width: 700px)');
        this.media.addEventListener('change', () => { this.positionPreview(); this.syncVisibility(); });
        this.positionPreview();
        this.panel.addEventListener('click', (event) => this.onClick(event));
        this.preview.addEventListener('click', (event) => { event.stopPropagation(); this.onClick(event); });
        this.panel.addEventListener('input', (event) => this.onInput(event));
        document.getElementById('recipe-name').addEventListener('input', (event) => {
            gameStorage.setItem('currentRecipeName', event.target.value);
        });
        ['save-recipe', 'randomize-recipe'].forEach((id) => document.getElementById(id).addEventListener('click', () => queueMicrotask(() => {
            gameStorage.setItem('currentRecipeName', document.getElementById('recipe-name').value);
            this.refresh();
        })));
        this.observer = new MutationObserver(() => this.syncVisibility());
        this.observer.observe(this.content, { attributes: true, attributeFilter: ['class'] });
        this.recipeObserver = new MutationObserver(() => this.refresh());
        this.recipeObserver.observe(document.getElementById('recipe-list'), { childList: true });
        this.componentObserver = new MutationObserver(() => this.refresh());
        this.componentObserver.observe(document.getElementById('components-list'), { childList: true });
        this.refresh();
        this.syncVisibility();
    }

    positionPreview() {
        const close = this.content.querySelector('.panel-close');
        if (this.media.matches) {
            this.panel.insertBefore(this.preview, this.panel.querySelector('.workshop-step-tabs'));
            if (close) this.panel.querySelector('.workshop-mode-bar').appendChild(close);
        } else {
            document.body.appendChild(this.preview);
            if (close) this.content.querySelector('.panel-header').appendChild(close);
        }
    }

    syncVisibility() {
        const open = this.content.classList.contains('active');
        document.body.classList.toggle('workshop-open', open);
        if (open) {
            this.preview.hidden = false;
            this.refresh();
            if (this.media.matches && this.mode === 'collection') this.game.closeAdvancedCreator();
            else this.game.openAdvancedCreator();
        } else {
            this.preview.hidden = true;
            this.game.closeAdvancedCreator();
        }
    }

    setMode(mode) {
        this.mode = mode;
        this.syncVisibility();
        if (mode === 'editor') this.panel.scrollTop = 0;
    }

    get component() {
        const components = this.game.currentRecipeComponents;
        this.selectedLayer = Math.min(this.selectedLayer, Math.max(0, components.length - 1));
        return components[this.selectedLayer];
    }

    isPatternUnlocked(pattern) {
        return !pattern.unlockId || this.game.progression?.isUnlocked(pattern.unlockId) || this.game.unlockedPatternKeys?.includes(pattern.key);
    }

    onClick(event) {
        const button = event.target.closest('button');
        if (!button || button.disabled) return;
        if (button.dataset.workshopMode) {
            this.setMode(button.dataset.workshopMode);
        } else if (button.dataset.workshopStep) {
            this.step = button.dataset.workshopStep;
            this.refresh();
        } else if (button.dataset.pattern && this.component) {
            this.component.pattern = button.dataset.pattern;
            this.changed();
        } else if (button.dataset.spark && this.component) {
            this.component.shape = button.dataset.spark;
            this.changed();
        } else if (button.dataset.color && this.component) {
            this.component[button.dataset.colorProperty] = button.dataset.color;
            this.changed();
        } else if (button.dataset.layer !== undefined) {
            this.selectedLayer = Number(button.dataset.layer);
            this.refresh();
        } else if (button.dataset.removeLayer !== undefined) {
            this.game.currentRecipeComponents.splice(Number(button.dataset.removeLayer), 1);
            this.changed();
        } else if (button.dataset.savedRecipe !== undefined) {
            this.game.selectRecipe(Number(button.dataset.savedRecipe));
            this.selectedLayer = 0;
            this.setMode('editor');
            this.changed();
        } else if (button.id === 'workshop-add-layer') {
            this.game.currentRecipeComponents.push({ ...DEFAULT_RECIPE_COMPONENTS[0], color: WORKSHOP_COLORS[(this.game.currentRecipeComponents.length + 3) % WORKSHOP_COLORS.length] });
            this.selectedLayer = this.game.currentRecipeComponents.length - 1;
            this.changed();
        } else if (button.id === 'workshop-remove-active-layer') {
            if (this.game.currentRecipeComponents.length > 1) {
                this.game.currentRecipeComponents.splice(this.selectedLayer, 1);
                this.changed();
            }
        } else if (button.id === 'workshop-random-name') {
            const name = GENERIC_RECIPE_NAMES[Math.floor(Math.random() * GENERIC_RECIPE_NAMES.length)];
            document.getElementById('recipe-name').value = name;
            gameStorage.setItem('currentRecipeName', name);
        } else if (button.id === 'workshop-close') {
            this.game.ui.toggleTab('recipes');
        } else if (button.id === 'workshop-replay') {
            this.restartPreview();
        } else if (button.id === 'workshop-launch') {
            const bounds = this.game.renderer2D.getVisibleWorldBounds();
            this.game.fireworkSystem.launchFireworkAt(bounds.left + (bounds.right - bounds.left) * 0.7, 100, null, this.game.currentRecipeComponents.map((component) => ({ ...component })));
            this.restartPreview();
            this.game.showNotification('Your firework is in the sky!');
        }
    }

    onInput(event) {
        const input = event.target;
        const property = input.dataset.property;
        if (!property || !this.component) return;
        this.component[property] = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
        if (property === 'gradientStartTime' || property === 'gradientDuration') {
            this.component.gradientDuration = Math.min(Number(this.component.gradientDuration ?? 1), 1 - Number(this.component.gradientStartTime ?? 0));
        }
        this.changed(false);
    }

    changed(rebuildLegacy = true) {
        if (rebuildLegacy) this.game.updateComponentsList();
        this.game.saveCurrentRecipeComponents();
        this.refresh();
        this.restartPreview();
    }

    restartPreview() {
        if (this.game.previewFirework) {
            this.game.previewFirework.dispose();
            this.game.previewFirework = null;
        }
        const system = this.game.previewParticleSystem;
        if (system) {
            system.clear();
            system.pendingTrailsCount = 0;
        }
        this.game.previewFireworkTimer = 0;
    }

    shuffle() {
        if (!this.component) this.game.currentRecipeComponents.push({ ...DEFAULT_RECIPE_COMPONENTS[0] });
        const patterns = patternDefinitions.filter((pattern) => this.isPatternUnlocked(pattern));
        const component = this.component;
        component.pattern = patterns[Math.floor(Math.random() * patterns.length)].key;
        component.color = WORKSHOP_COLORS[Math.floor(Math.random() * WORKSHOP_COLORS.length)];
        component.shape = ['sphere', 'star', 'ring', 'crystalDroplet', 'sliceBurst'][Math.floor(Math.random() * 5)];
        for (const [key, range] of Object.entries(COMPONENT_PROPERTY_RANGES)) {
            const steps = Math.round((range.max - range.min) / range.step);
            component[key] = Number((range.min + Math.floor(Math.random() * (steps + 1)) * range.step).toFixed(2));
        }
        this.changed();
    }

    refresh() {
        const component = this.component;
        this.panel.dataset.step = this.step;
        this.panel.dataset.mode = this.mode;
        this.panel.querySelectorAll('[data-workshop-mode]').forEach((button) => {
            const selected = button.dataset.workshopMode === this.mode;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-pressed', String(selected));
            button.setAttribute('aria-selected', String(selected));
        });
        this.panel.querySelectorAll('[data-workshop-step]').forEach((button) => {
            const selected = button.dataset.workshopStep === this.step;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
        this.panel.querySelectorAll('[data-workshop-mode-panel]').forEach((section) => { section.hidden = section.dataset.workshopModePanel !== this.mode; });
        this.panel.querySelectorAll('[data-pattern]').forEach((button) => {
            const unlocked = this.isPatternUnlocked(patternDefinitions.find((pattern) => pattern.key === button.dataset.pattern));
            button.disabled = !unlocked;
            button.classList.toggle('selected', component?.pattern === button.dataset.pattern);
            button.setAttribute('aria-pressed', String(component?.pattern === button.dataset.pattern));
            button.title = unlocked ? button.getAttribute('aria-label') : 'Unlock this shape in Upgrades';
            button.hidden = !unlocked;
            button.querySelector('.workshop-tile-preview').innerHTML = miniature({ ...component, pattern: button.dataset.pattern });
        });
        document.getElementById('workshop-pattern-count').textContent = patternDisplayNames[component?.pattern] ?? 'Pick a shape';
        this.panel.querySelectorAll('[data-spark]').forEach((button) => {
            button.classList.toggle('selected', component?.shape === button.dataset.spark);
            button.setAttribute('aria-pressed', String(component?.shape === button.dataset.spark));
            button.querySelector('.workshop-spark-preview').innerHTML = sparkMiniature(button.dataset.spark, component?.color);
        });
        document.getElementById('workshop-spark-label').textContent = `${sparkNames[component?.shape] ?? 'Dot'} sparks`;
        this.panel.querySelectorAll('[data-property]').forEach((input) => {
            input.disabled = !component;
            const value = component?.[input.dataset.property];
            if (input.type === 'checkbox') input.checked = Boolean(value);
            else if (value !== undefined) input.value = value;
            else if (input.type === 'color') input.value = '#ff7a59';
            else if (input.dataset.property === 'gradientDuration') input.value = 1;
            else input.value = 0;
            if (input.type === 'range') input.style.setProperty('--range-progress', `${(Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
        });
        this.panel.querySelectorAll('[data-color]').forEach((button) => {
            const selected = component?.[button.dataset.colorProperty]?.toLowerCase() === button.dataset.color;
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
        this.panel.querySelectorAll('[data-value-for]').forEach((output) => {
            const key = output.dataset.valueFor;
            const value = Number(component?.[key] ?? (key === 'gradientDuration' ? 1 : 0));
            output.textContent = key === 'size' ? value.toFixed(2) : key === 'spread' ? `${Math.round(value * 100)}%` : `${(key.startsWith('gradient') ? value * (component?.lifetime ?? 3) : value).toFixed(1)}s`;
        });
        document.getElementById('workshop-color-hex').textContent = (component?.color ?? '').toUpperCase();
        document.getElementById('workshop-fade-controls').hidden = !component?.enableColorGradient;
        document.getElementById('workshop-secondary-row').hidden = !patternDefinitions.find((pattern) => pattern.key === component?.pattern)?.hasSecondaryColor;
        document.getElementById('workshop-secondary-label').textContent = { saturn: 'Ring color', helix: '2nd strand', christmasTree: 'Ornaments', snowflake: 'Tips' }[component?.pattern] ?? 'Second color';
        const timeline = this.panel.querySelector('.workshop-timeline-bar');
        timeline.style.setProperty('--fade-from', component?.color ?? '#ff7a59');
        timeline.style.setProperty('--fade-to', component?.gradientFinalColor ?? '#fff3da');
        timeline.style.setProperty('--fade-start', `${(component?.gradientStartTime ?? 0) * 100}%`);
        timeline.style.setProperty('--fade-end', `${Math.min(1, (component?.gradientStartTime ?? 0) + (component?.gradientDuration ?? 1)) * 100}%`);
        document.getElementById('workshop-timeline-lifetime').textContent = `${(component?.lifetime ?? 3).toFixed(1)}s`;
        this.preview.classList.toggle('collection-open', this.mode === 'collection');
        this.refreshLayers();
        this.refreshSaved();
    }

    refreshLayers() {
        const components = this.game.currentRecipeComponents;
        document.getElementById('workshop-layer-count').textContent = components.length;
        document.getElementById('workshop-preview-description').textContent = components.length ? `${patternDisplayNames[this.component?.pattern] ?? 'Firework'} · ${(sparkNames[this.component?.shape] ?? 'Dot').toLowerCase()} sparks${components.length > 1 ? ` · ${components.length} layers` : ''}` : 'Add a layer to start creating';
        const list = document.getElementById('workshop-layer-list');
        list.replaceChildren();
        components.forEach((component, index) => {
            const choose = document.createElement('button');
            choose.type = 'button';
            choose.className = `workshop-layer-chip${index === this.selectedLayer ? ' active' : ''}`;
            choose.dataset.layer = index;
            choose.setAttribute('aria-pressed', String(index === this.selectedLayer));
            choose.setAttribute('aria-label', `Layer ${index + 1}: ${patternDisplayNames[component.pattern] ?? component.pattern}`);
            choose.innerHTML = `<span class="workshop-layer-miniature">${miniature(component, 44, 44, 16, 2.6, 36)}</span><span class="workshop-layer-badge">${index + 1}</span>`;
            list.appendChild(choose);
        });
        const remove = document.getElementById('workshop-remove-active-layer');
        remove.hidden = components.length <= 1;
        remove.textContent = `Remove ${this.selectedLayer + 1}`;
        remove.setAttribute('aria-label', `Remove layer ${this.selectedLayer + 1}`);
        ['save-recipe', 'workshop-launch'].forEach((id) => { document.getElementById(id).disabled = components.length === 0; });
    }

    refreshSaved() {
        document.getElementById('workshop-saved-count').textContent = this.game.recipes.length;
        const list = document.getElementById('workshop-saved-list');
        list.replaceChildren();
        if (!this.game.recipes.length) {
            const empty = document.createElement('p');
            empty.className = 'workshop-empty';
            empty.textContent = 'Your next favorite firework starts in the workshop. Create one, then hit Save!';
            list.appendChild(empty);
        }
        this.game.recipes.forEach((recipe, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'workshop-saved-card';
            button.dataset.savedRecipe = index;
            button.innerHTML = `<span class="workshop-saved-photo">${recipe.components.map((component) => miniature(component, 184, 88, 34, 3.6, 44)).join('')}</span><span class="workshop-saved-text"></span>`;
            const text = button.querySelector('.workshop-saved-text');
            const name = document.createElement('strong');
            name.textContent = recipe.name;
            const info = document.createElement('small');
            info.textContent = `${patternDisplayNames[recipe.components[0]?.pattern] ?? 'Firework'} · ${(sparkNames[recipe.components[0]?.shape] ?? 'Dot').toLowerCase()} sparks${recipe.components.length > 1 ? ` · ${recipe.components.length} layers` : ''}`;
            text.append(name, info);
            list.appendChild(button);
        });
    }
}
