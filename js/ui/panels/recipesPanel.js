import { COMPONENT_PROPERTY_RANGES } from '../../config/RecipeConfig.js';
import { patternDefinitions } from '../../entities/patterns/index.js';
import { miniature, sparkMiniature } from '../WorkshopMiniatures.js';
import { doodleIcon } from '../doodleIcons.js';

export const WORKSHOP_COLORS = ['#ff4d4d', '#ff8a3d', '#ffd04a', '#ddbb4a', '#f4f1e6', '#86e38f', '#3ee0d0', '#4d8bff', '#a879ff', '#ff6fae'];
const workshopPatterns = ['spherical', 'burst', 'palm', 'star', 'willow', 'ring', 'solidsphere', 'brocade', 'heart', 'pistil', 'saturn', 'brokenHeart', 'christmasTree', 'spinner', 'helix', 'snowflake', 'dragonsBreath'].map((key) => patternDefinitions.find((pattern) => pattern.key === key));
const labels = { spherical: 'Sphere', solidsphere: 'Solid', christmasTree: 'Xmas tree', brokenHeart: 'Broken', dragonsBreath: 'Dragon' };

function palette(property) {
    return WORKSHOP_COLORS.map((color) => `<button type="button" class="workshop-swatch" style="--swatch:${color}" data-color="${color}" data-color-property="${property}" aria-label="${property === 'color' ? 'Main' : 'Fade'} color ${color}"></button>`).join('');
}

function slider(property, title, left, right) {
    const range = COMPONENT_PROPERTY_RANGES[property];
    const icons = {
        size: ['<circle cx="11" cy="11" r="2.4" fill="currentColor"/>', '<circle cx="11" cy="11" r="7.5" fill="currentColor"/>'],
        spread: ['<path d="M11 8v-2M11 14v2M8 11H6M14 11h2"/>', '<path d="M11 7V1.5M11 15v5.5M7 11H1.5M15 11h5.5M8 8 4.5 4.5M14 14l3.5 3.5M14 8l3.5-3.5M8 14l-3.5 3.5"/>'],
        lifetime: ['<path d="M8 11h4"/><circle cx="15" cy="11" r="2.4" fill="currentColor" stroke="none"/>', '<path d="M1.5 11h2M5.5 11H8M10 11h5"/><circle cx="18.2" cy="11" r="2.6" fill="currentColor" stroke="none"/>'],
    };
    return `<label class="workshop-slider"><span class="workshop-slider-title">${title}</span><svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${icons[property][0]}</svg><input type="range" data-property="${property}" min="${range.min}" max="${range.max}" step="${range.step}" aria-label="${title}"><svg viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${icons[property][1]}</svg><output data-value-for="${property}"></output></label>`;
}

export function render(container) {
    const panel = document.createElement('section');
    panel.className = 'workshop-panel';
    panel.innerHTML = `
        <div class="workshop-mode-bar"><nav class="workshop-mode-tabs" role="tablist" aria-label="Firework collection"><button type="button" class="active" data-workshop-mode="editor" role="tab">${doodleIcon('edit')}Workshop</button><button type="button" data-workshop-mode="collection" role="tab">${doodleIcon('collection')}<span class="workshop-collection-label">My fireworks</span><span class="workshop-mobile-collection-label">Mine</span> <span id="workshop-saved-count">0</span></button></nav></div>
        <nav class="workshop-step-tabs" aria-label="Workshop steps"><button type="button" class="active" data-workshop-step="shape"><span>1</span> Shape</button><button type="button" data-workshop-step="sparks"><span>2</span> Sparks</button><button type="button" data-workshop-step="colors"><span>3</span> Colors</button><button type="button" data-workshop-step="feel"><span>4</span> Feel</button></nav>
        <div class="workshop-body" data-workshop-mode-panel="editor">
            <section class="workshop-section" data-workshop-section="shape"><div class="workshop-section-heading"><span class="workshop-section-number">1</span><h3>Shape</h3><span id="workshop-pattern-count"></span></div><div class="workshop-shape-grid">${workshopPatterns.map(({ key, displayName }) => `<button type="button" class="workshop-tile" data-pattern="${key}" aria-label="${displayName} firework">${`<span class="workshop-tile-preview">${miniature({ pattern: key, color: '#ddbb4a' })}</span>`}<span>${labels[key] || displayName}</span><span class="workshop-tile-lock" aria-hidden="true">${doodleIcon('locked')}</span></button>`).join('')}</div></section>
            <section class="workshop-section" data-workshop-section="sparks"><div class="workshop-section-heading"><span class="workshop-section-number">2</span><h3>Sparks</h3><span id="workshop-spark-label">Dot sparks</span></div><div class="workshop-sparks-grid">${[['sphere', 'Dot', '<circle cx="24" cy="24" r="8" fill="currentColor" stroke="none"/>'], ['star', 'Star', '<path d="m24 7 4 12 13 1-10 8 3 13-10-7-10 7 3-13-10-8 13-1Z"/>'], ['ring', 'Ring', '<circle cx="24" cy="24" r="12" stroke-width="4"/>'], ['crystalDroplet', 'Droplet', '<path d="M24 6C20 15 12 23 12 31a12 12 0 0 0 24 0C36 23 28 15 24 6Z"/>'], ['sliceBurst', 'Slice', '<path d="M8 9 42 24 8 39l10-15Z"/>']].map(([key, label, drawing]) => `<button type="button" class="workshop-tile" data-spark="${key}"><span class="workshop-spark-preview">${sparkMiniature(key)}</span><span>${label}</span></button>`).join('')}</div></section>
            <section class="workshop-section" data-workshop-section="colors"><div class="workshop-section-heading"><span class="workshop-section-number">3</span><h3>Colors</h3></div><div class="workshop-palette">${palette('color')}<label class="workshop-rainbow-color"><input id="workshop-main-color" type="color" data-property="color" aria-label="Pick any firework color"></label></div><output id="workshop-color-hex" hidden></output><div id="workshop-secondary-row" class="workshop-secondary-colors" hidden><span id="workshop-secondary-label">Second color</span><div class="workshop-palette">${palette('secondaryColor')}</div><label class="workshop-custom-color"><input type="color" data-property="secondaryColor" aria-label="Custom secondary firework color"><span>Custom second color</span></label></div><label class="workshop-fade-toggle"><span>Color fade</span><input id="workshop-fade-toggle" type="checkbox" data-property="enableColorGradient"><span class="workshop-switch" aria-hidden="true"></span></label><div id="workshop-fade-controls" hidden><div class="workshop-fade-label">Fades to</div><div class="workshop-palette">${palette('gradientFinalColor')}</div><div class="workshop-custom-row"><label class="workshop-custom-color"><input type="color" data-property="gradientFinalColor" aria-label="Custom fade color"><span>Custom fade color</span></label></div><div class="workshop-fade-timeline"><div class="workshop-timeline-bar"><span class="workshop-timeline-range"></span><span class="workshop-timeline-start"></span><span class="workshop-timeline-end"></span></div><div class="workshop-timeline-endpoints"><span>boom!</span><span id="workshop-timeline-lifetime">3.0s</span></div><label>Starts <output data-value-for="gradientStartTime"></output><input type="range" data-property="gradientStartTime" min="0" max="0.95" step="0.01" aria-label="Color fade start"></label><label>Takes <output data-value-for="gradientDuration"></output><input type="range" data-property="gradientDuration" min="0.05" max="1" step="0.01" aria-label="Color fade duration"></label></div></div></section>
            <section class="workshop-section workshop-feel" data-workshop-section="feel"><div class="workshop-section-heading"><span class="workshop-section-number">4</span><h3>Feel</h3></div>${slider('size', 'Spark size', 'small', 'big')}${slider('spread', 'Burst width', 'close', 'wide')}${slider('lifetime', 'Burn time', 'quick', 'long')}</section>
        </div>
        <div class="workshop-collection" data-workshop-mode-panel="collection" hidden><div class="workshop-collection-heading"><h3>Your little collection</h3><p>Good things are better saved.</p></div><div id="workshop-saved-list"></div><button type="button" id="erase-recipes" class="workshop-erase-button">Erase all fireworks</button></div>
        <div id="components-list" hidden></div><div id="recipe-list" hidden></div><button id="add-component" hidden></button><button id="open-advanced-creator" hidden></button>
    `;
    container.appendChild(panel);

    const preview = document.createElement('aside');
    preview.id = 'creator-scene';
    preview.className = 'workshop-preview-column';
    preview.hidden = true;
    preview.innerHTML = `
        <div class="workshop-polaroid"><span class="workshop-tape workshop-tape-left"></span><span class="workshop-tape workshop-tape-right"></span><div class="workshop-preview-photo"><canvas id="creator-canvas" aria-label="Live preview of your firework"></canvas><button id="workshop-replay" type="button" aria-label="Replay firework preview">${doodleIcon('launch')}</button></div><div class="workshop-name-row"><input id="recipe-name" type="text" maxlength="80" placeholder="Name your firework" aria-label="Firework name"><button id="workshop-random-name" type="button" aria-label="Give your firework a random name">${doodleIcon('dice')}</button></div><div id="workshop-preview-description"></div></div>
        <section class="workshop-layers"><div class="workshop-layer-title"><h3>Layers <span id="workshop-layer-count" hidden></span></h3></div><div class="workshop-layer-chips"><div id="workshop-layer-list"></div><button id="workshop-add-layer" type="button" aria-label="Add a layer">${doodleIcon('add')}</button><button id="workshop-remove-active-layer" type="button">Remove 1</button></div></section>
        <div class="workshop-actions"><button id="save-recipe" type="button" class="workshop-save">${doodleIcon('bookmark')} Save</button><button id="workshop-launch" type="button" class="workshop-launch">${doodleIcon('launch')} Launch</button><button id="randomize-recipe" type="button" class="workshop-shuffle">${doodleIcon('shuffle')} Shuffle</button></div>
    `;
    document.body.appendChild(preview);
}
