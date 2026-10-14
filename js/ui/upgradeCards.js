import { doodleIcon } from './doodleIcons.js';

const BRANCH_STYLES = {
    BASE: { icon: 'fireworks', color: '#ffd04a' },
    LAUNCHER: { icon: 'launcher', color: '#ff7a59' },
    CROWD: { icon: 'crowd', color: '#ffd04a' },
    GENERATOR: { icon: 'generator', color: '#86e38f' },
    DRONE: { icon: 'drone', color: '#5fe0e0' },
};

const formatAmount = amount => Math.floor(Math.max(0, amount)).toLocaleString();

function createPrice(costs) {
    const price = document.createElement('span');
    price.className = 'upgrade-costs';
    for (const [currency, cost] of Object.entries(costs)) {
        const part = document.createElement('span');
        part.className = 'btn-cost';
        part.innerHTML = doodleIcon(currency === 'sparkles' ? 'sparkle' : 'gold');
        const amount = document.createElement('span');
        amount.textContent = formatAmount(cost);
        part.appendChild(amount);
        part.setAttribute('aria-label', `${formatAmount(cost)} ${currency}`);
        price.appendChild(part);
    }
    return price;
}

/** Refresh balances without rebuilding cards as resources accumulate. */
export function refreshUpgradeSavings(card, costs, game) {
    const entries = Object.entries(costs);
    const fractions = entries.map(([currency, cost]) => Math.min(1,
        Math.max(0, game.resourceManager.resources[currency]?.amount ?? 0) / Math.max(1, cost)));
    const progress = fractions.length ? Math.min(...fractions) : 1;
    const balance = card.querySelector('.upgrade-saving-balance');
    const track = card.querySelector('.upgrade-saving-track');
    const fill = card.querySelector('.upgrade-saving-fill');
    const savingLabel = entries.map(([currency, cost]) => {
        const amount = Math.max(0, game.resourceManager.resources[currency]?.amount ?? 0);
        return `${formatAmount(amount)} / ${formatAmount(cost)} ${currency}`;
    }).join(' · ');
    if (balance) {
        balance.title = savingLabel;
        balance.setAttribute('aria-label', savingLabel);
    }
    if (fill) {
        fill.style.width = `${(progress * 100).toFixed(1)}%`;
    }
    if (track) {
        track.setAttribute('aria-valuenow', String(Math.floor(progress * 100)));
        track.setAttribute('aria-valuetext', `${savingLabel}, ${Math.floor(progress * 100)}% saved`);
    }
}

export function createUpgradeCard({ def, level, canBuy, reason, isPrereqLocked, costs }, game, owned = false) {
    const maxLevel = def.maxLevel ?? 1;
    const style = BRANCH_STYLES[def.branch ?? def.group] ?? BRANCH_STYLES.BASE;
    const icon = def.id.startsWith('catapult') ? 'catapult' : style.icon;
    const card = document.createElement('article');
    card.className = `upgrade-card ${owned ? 'purchased' : isPrereqLocked ? 'locked' : canBuy ? 'ready' : 'saving'}`;
    card.dataset.upgradeCard = def.id;
    card.style.setProperty('--upgrade-color', style.color);

    const head = document.createElement('div');
    head.className = 'upgrade-card-head';
    const emblem = document.createElement('span');
    emblem.className = 'upgrade-icon';
    emblem.innerHTML = doodleIcon(icon);
    emblem.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('div');
    copy.className = 'upgrade-copy';
    const name = document.createElement('h4');
    name.className = 'upgrade-name';
    name.textContent = def.name;
    const effect = document.createElement('p');
    effect.className = 'upgrade-effect';
    effect.textContent = def.desc;
    copy.append(name);
    head.append(emblem, copy);
    card.append(head, effect);

    if (maxLevel > 0) {
        const levels = document.createElement('div');
        levels.className = 'upgrade-levels';
        levels.setAttribute('aria-label', `Level ${level} of ${maxLevel}`);
        for (let i = 0; i < maxLevel; i++) {
            const dot = document.createElement('span');
            dot.className = `level-dot${i < level ? ' filled' : ''}`;
            dot.setAttribute('aria-hidden', 'true');
            levels.appendChild(dot);
        }
        const label = document.createElement('span');
        label.className = 'upgrade-level-label';
        label.textContent = `Level ${level}/${maxLevel}`;
        levels.appendChild(label);
        card.appendChild(levels);
    }

    if (owned) {
        const status = document.createElement('span');
        status.className = 'upgrade-owned-status';
        status.innerHTML = doodleIcon('done');
        const desktopStatus = document.createElement('span');
        desktopStatus.className = 'upgrade-status-desktop';
        desktopStatus.textContent = level >= maxLevel ? 'Maxed out' : 'Purchased';
        const mobileStatus = document.createElement('span');
        mobileStatus.className = 'upgrade-status-mobile';
        mobileStatus.textContent = maxLevel > 1 ? level >= maxLevel ? 'Owned · max level' : `Owned · level ${level}` : 'Owned';
        status.append(desktopStatus, mobileStatus);
        card.appendChild(status);
        return card;
    }

    if (isPrereqLocked) {
        const lock = document.createElement('div');
        lock.className = 'upgrade-lock-reason';
        lock.innerHTML = doodleIcon('locked');
        lock.append(document.createTextNode(reason ?? 'Keep growing your show'));
        card.appendChild(lock);
        return card;
    }

    if (!canBuy) {
        const status = document.createElement('p');
        status.className = 'upgrade-saving-status';
        status.textContent = 'Not enough resources';
        card.appendChild(status);
        const savings = document.createElement('div');
        savings.className = 'upgrade-saving';
        savings.innerHTML = `
            <div class="upgrade-saving-meta"><span class="upgrade-saving-balance"></span></div>
            <div class="upgrade-saving-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span class="upgrade-saving-fill"></span></div>
        `;
        savings.querySelector('.upgrade-saving-balance').appendChild(createPrice(costs));
        savings.querySelector('.upgrade-saving-track').setAttribute('aria-label', `Savings for ${def.name}`);
        card.appendChild(savings);
    }

    const button = document.createElement('button');
    button.className = 'upgrade-buy-button';
    button.dataset.upgradeId = def.id;
    button.disabled = !canBuy;
    const action = document.createElement('span');
    action.className = 'upgrade-action-label';
    action.textContent = def.action ?? 'Upgrade';
    button.append(action, createPrice(costs));
    button.setAttribute('aria-label', `${def.action ?? 'Upgrade'} ${def.name} for ${Object.entries(costs).map(([currency, cost]) => `${formatAmount(cost)} ${currency}`).join(' and ')}`);
    button.addEventListener('click', () => game.buyUpgrade(def.id));
    card.appendChild(button);
    if (!canBuy) refreshUpgradeSavings(card, costs, game);
    return card;
}
