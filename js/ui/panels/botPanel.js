/**
 * botPanel.js
 * Bot tab — controls + live progression report for the auto-play bot
 * (see js/bot/GameBot.js). Only revealed when the game is launched in bot mode
 * (?bot=1). Self-contained: wires its own control handlers and runs its own
 * lightweight refresh loop, so no UIManager edits are required.
 */

// ── number / time formatting ─────────────────────────────────────────────
function fmt(n) {
    if (n == null || !isFinite(n)) return '0';
    const abs = Math.abs(n);
    if (abs >= 1e12) return (n / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return Math.round(n).toString();
}
function fmtRate(n) { return fmt(n) + '/s'; }
function fmtTime(s) {
    s = Math.floor(s || 0);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return (h > 0 ? `${h}h ` : '') + `${m}m ${sec}s`;
}

function syncControl(id, value) {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el && +el.value !== +value) el.value = value;
}

function row(label, id) {
    return `<div class="stats-row"><span class="stats-source-label">${label}</span><span class="stats-value" id="${id}">—</span></div>`;
}

export function render(container) {
    const panel = document.createElement('div');
    panel.className = 'panel scrollable-panel';

    panel.innerHTML = `
        <fieldset>
            <legend>Bot Controls</legend>
            <div class="recipes-option">
                <button id="bot-toggle">Start Bot</button>
                <span id="bot-status" class="stats-value">idle</span>
            </div>
            <div class="recipes-option">
                <label>Clicks / sec:</label>
                <input type="number" id="bot-clicks" value="5" step="1" min="0" max="100">
            </div>
            <div class="recipes-option">
                <label>Speed:</label>
                <input type="range" id="bot-speed" value="1" step="1" min="1" max="50">
                <span id="bot-speed-label" class="stats-value">1x</span>
            </div>
        </fieldset>

        <div class="stats-section" id="bot-final-banner" style="display:none">
            <h3 class="stats-section-title">🏁 FINAL REPORT — GAME BEATEN</h3>
        </div>

        <div class="stats-section">
            <h3 class="stats-section-title">Progression</h3>
            ${row('Elapsed (game time)', 'bot-elapsed')}
            ${row('Sparkles', 'bot-sparkles')}
            ${row('Gold', 'bot-gold')}
            ${row('Sparkles / sec', 'bot-sps')}
            ${row('Gold / sec', 'bot-gps')}
            ${row('Crowd size', 'bot-crowd')}
            ${row('Fireworks launched', 'bot-fireworks')}
            ${row('Upgrades (levels)', 'bot-upgrades')}
        </div>

        <div class="stats-section">
            <h3 class="stats-section-title">Sparkle Production (by source)</h3>
            ${row('Clicks', 'bot-src-clicks')}
            ${row('Auto-Launchers', 'bot-src-launchers')}
            ${row('Generators', 'bot-src-generators')}
            ${row('Drones', 'bot-src-drones')}
            ${row('Crowd Catching', 'bot-src-crowd')}
            ${row('Grand Finale', 'bot-src-finale')}
            ${row('Gold — Crowd', 'bot-src-gold-crowd')}
        </div>

        <div class="stats-section">
            <h3 class="stats-section-title">Buildings</h3>
            <div id="bot-buildings"></div>
        </div>

        <div class="stats-section">
            <h3 class="stats-section-title">Remaining Upgrades (<span id="bot-remaining-count">0</span>)</h3>
            <div id="bot-remaining" class="stats-subgroup"></div>
        </div>

        <div class="stats-section">
            <h3 class="stats-section-title">Event Timeline</h3>
            <div id="bot-events" class="stats-subgroup"></div>
        </div>
    `;

    container.appendChild(panel);

    wireControls(panel);

    // Lightweight self-refresh (the bot lives in window.game.bot, set in main.js).
    setInterval(() => {
        const game = window.game;
        if (game && game.bot) updateReport(game);
    }, 250);
}

function wireControls(panel) {
    // Query from the panel element (not document): render() runs in UIBuilder
    // BEFORE the content div is attached to the DOM, so document.getElementById
    // would return null here and the listeners would never bind.
    const toggleBtn = panel.querySelector('#bot-toggle');
    const clicksInput = panel.querySelector('#bot-clicks');
    const speedInput = panel.querySelector('#bot-speed');
    const speedLabel = panel.querySelector('#bot-speed-label');

    toggleBtn?.addEventListener('click', () => {
        const bot = window.game?.bot;
        if (!bot) return;
        if (bot.enabled) bot.stop(); else bot.start();
    });
    clicksInput?.addEventListener('change', () => {
        window.game?.bot?.setClicksPerSec(clicksInput.value);
    });
    speedInput?.addEventListener('input', () => {
        speedLabel.textContent = `${speedInput.value}x`;
        window.game?.bot?.setSpeedMultiplier(speedInput.value);
    });
}

export function updateReport(game) {
    const bot = game.bot;
    const r = bot.getReport();
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    // Status + toggle label
    const toggleBtn = document.getElementById('bot-toggle');
    if (toggleBtn) toggleBtn.textContent = bot.enabled ? 'Stop Bot' : (bot.complete ? 'Restart Bot' : 'Start Bot');
    set('bot-status', bot.complete ? 'complete' : (bot.enabled ? 'running' : 'idle'));

    const banner = document.getElementById('bot-final-banner');
    if (banner) banner.style.display = bot.complete ? '' : 'none';

    // Keep controls in sync with the bot's actual config (unless being edited).
    syncControl('bot-clicks', bot.clicksPerSec);
    const speedEl = document.getElementById('bot-speed');
    if (speedEl && document.activeElement !== speedEl && +speedEl.value !== bot.speedMultiplier) {
        speedEl.value = bot.speedMultiplier;
        set('bot-speed-label', `${bot.speedMultiplier}x`);
    }

    set('bot-elapsed', fmtTime(r.elapsed));
    set('bot-sparkles', fmt(r.sparkles));
    set('bot-gold', fmt(r.gold));
    set('bot-sps', fmtRate(r.sps));
    set('bot-gps', fmtRate(r.gps));
    set('bot-crowd', fmt(r.crowd));
    set('bot-fireworks', fmt(r.fireworks));
    set('bot-upgrades', `${r.upgrades.purchasedLevels} / ${r.upgrades.totalLevels}`);

    const s = r.productionBreakdown.sparkles;
    set('bot-src-clicks', fmt(s.clicks));
    set('bot-src-launchers', fmt(s.launchers));
    set('bot-src-generators', fmt(s.generators));
    set('bot-src-drones', fmt(s.drones));
    set('bot-src-crowd', fmt(s.crowdCatching));
    set('bot-src-finale', fmt(s.grandFinale));
    set('bot-src-gold-crowd', fmt(r.productionBreakdown.gold.crowd));

    // Buildings
    const bDiv = document.getElementById('bot-buildings');
    if (bDiv) {
        bDiv.innerHTML = Object.values(r.buildings)
            .map(b => `<div class="stats-row"><span class="stats-source-label">${b.name}</span><span class="stats-value">${b.count}</span></div>`)
            .join('');
    }

    // Remaining upgrades
    set('bot-remaining-count', r.upgrades.remaining.length);
    const remDiv = document.getElementById('bot-remaining');
    if (remDiv) {
        remDiv.innerHTML = r.upgrades.remaining
            .map(u => `<div class="stats-row" style="${u.visible ? '' : 'opacity:0.5'}"><span class="stats-source-label">${u.name}${u.visible ? '' : ' (locked)'}</span><span class="stats-value">${u.level}/${u.maxLevel}</span></div>`)
            .join('') || '<div class="stats-row"><span class="stats-source-label">All upgrades maxed 🎉</span></div>';
    }

    // Event timeline (most recent first, capped)
    const evDiv = document.getElementById('bot-events');
    if (evDiv) {
        const recent = r.events.slice(-60).reverse();
        evDiv.innerHTML = recent
            .map(e => `<div class="stats-row"><span class="stats-source-label">[${fmtTime(e.time)}] ${e.label}</span></div>`)
            .join('');
    }
}
