/**
 * NullUI — inert UIManager stand-in for headless mode.
 *
 * The economy/progression code calls a wide range of UI methods
 * (showNotification, renderUpgrades, handleUnlock, updateBuildingCounts, …).
 * Rather than enumerate them, this returns a no-op function for any property
 * access, so every call is harmlessly swallowed.
 */
function makeNullUI() {
    const noop = () => {};
    return new Proxy({}, {
        get() { return noop; },
    });
}

export default makeNullUI;
