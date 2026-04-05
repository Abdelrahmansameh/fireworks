// Shared SVG icon snippets for UI reuse
export const SPARKLE_SVG = `<svg class="rc-icon rc-icon--medium rc-sparkle-icon" aria-hidden="true" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M8 1L9.7 6.3L15 8L9.7 9.7L8 15L6.3 9.7L1 8L6.3 6.3Z" fill="currentColor"/></svg>`;

export const GOLD_SVG = `<svg class="rc-icon rc-icon--medium rc-gold-icon" aria-hidden="true" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><circle cx="8" cy="8" r="6.5" fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="3.5" fill="currentColor"/></svg>`;

export const FIREWORK_SVG = `<svg class="rc-icon rc-icon--medium rc-firework-icon" aria-hidden="true" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
        <path d="M8 1.2v2.6"/>
        <path d="M8 12.2v2.6"/>
        <path d="M1.2 8h2.6"/>
        <path d="M12.2 8h2.6"/>
        <path d="M3 3l1.8 1.8"/>
        <path d="M11.2 11.2l1.8 1.8"/>
        <path d="M11.6 3.4l1.2 1.2"/>
        <path d="M3.2 12.6l1.2-1.2"/>
    </g>
    <g fill="currentColor">
        <circle cx="8" cy="0.8" r="0.8"/>
        <circle cx="8" cy="15.2" r="0.8"/>
        <circle cx="0.8" cy="8" r="0.8"/>
        <circle cx="15.2" cy="8" r="0.8"/>
        <circle cx="2.6" cy="2.6" r="0.7"/>
        <circle cx="13.4" cy="13.4" r="0.7"/>
        <circle cx="13.6" cy="3.6" r="0.6"/>
        <circle cx="2.4" cy="13.6" r="0.6"/>
    </g>
</svg>`;

export const ICONS = {
    SPARKLE_SVG,
    GOLD_SVG,
    FIREWORK_SVG,
};

export default ICONS;
