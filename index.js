/* ==========================================================================
   Cai Header Bar v1.4.1 — SillyTavern / TauriTavern Extension
   - #cai-top-header is mounted inside #top-settings-holder (absolute, inset 0),
     so it inherits TauriTavern's native top coordinate. We never touch `top`,
     never add safe-area insets (the iOS host already removed them).
   - The header hides itself whenever the native menu/drawers are in use, so
     drawers are never trapped under it.
   - #cai-left-popover lives on document.body (position: fixed).
   - Bundled local fonts (no external font links): Open Sans (c.ai) / Fira Sans
     (Lion original).
   ========================================================================== */

(() => {
    const EXT_KEY = 'cai_header_bar';
    const DEFAULT_SETTINGS = {
        enabled: true,
        showAvatar: true,
        mergeLeftButtons: true,
        placeholderMode: 'en', // 'en' | 'zh' | 'hide'
        fontMode: 'cai', // 'cai' (Open Sans) | 'lion' (Fira Sans) | 'theme' (leave theme font alone)
    };
    const FONT_CLASSES = {
        cai: 'cai-font-open-sans',
        lion: 'cai-font-fira-sans',
    };

    let menuOpen = false;
    let leftPopupOpen = false;
    let drawerObserver = null;
    let placeholderObserver = null;
    let applyingPlaceholder = false;
    let initialized = false;
    let originalConnectedText = null;
    let originalPlaceholder = null;

    function getCtx() {
        return window.SillyTavern?.getContext?.() || null;
    }

    function getSettings() {
        const ctx = getCtx();
        if (!ctx || !ctx.extensionSettings) {
            return { ...DEFAULT_SETTINGS };
        }
        if (!ctx.extensionSettings[EXT_KEY] || typeof ctx.extensionSettings[EXT_KEY] !== 'object') {
            ctx.extensionSettings[EXT_KEY] = { ...DEFAULT_SETTINGS };
        }
        const s = ctx.extensionSettings[EXT_KEY];
        for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
            if (s[k] === undefined) {
                s[k] = v;
            }
        }
        return s;
    }

    function saveSettings() {
        const ctx = getCtx();
        if (typeof ctx?.saveSettingsDebounced === 'function') {
            ctx.saveSettingsDebounced();
        }
    }

    function resolveIdentity() {
        const ctx = getCtx();
        if (!ctx) {
            return { name: '', displayName: 'TauriTavern', avatarUrl: '', isGroup: false };
        }

        if (ctx.groupId && Array.isArray(ctx.groups)) {
            const group = ctx.groups.find((g) => String(g.id) === String(ctx.groupId));
            if (group) {
                const name = group.name || 'Group Chat';
                return { name, displayName: name, avatarUrl: group.avatar_url || '', isGroup: true };
            }
        }

        const chid = ctx.characterId;
        if (
            chid !== undefined &&
            chid !== null &&
            chid !== '' &&
            Array.isArray(ctx.characters) &&
            ctx.characters[chid]
        ) {
            const ch = ctx.characters[chid];
            let avatarUrl = '';
            if (ch.avatar && ch.avatar !== 'none') {
                if (typeof ctx.getThumbnailUrl === 'function') {
                    avatarUrl = ctx.getThumbnailUrl('avatar', ch.avatar);
                } else {
                    avatarUrl = `/characters/${encodeURIComponent(ch.avatar)}`;
                }
            }
            const name = ch.name || ctx.name2 || 'Character';
            return { name, displayName: name, avatarUrl, isGroup: false };
        }

        return { name: '', displayName: 'Characters', avatarUrl: '', isGroup: false };
    }

    function hasOpenDrawer() {
        return Boolean(document.querySelector('#top-settings-holder .drawer-content.openDrawer'));
    }

    function setMenuOpen(open) {
        menuOpen = Boolean(open);
        document.body.classList.toggle('cai-header-menu-open', menuOpen);
    }

    /* ---------------- "+" popover ---------------- */

    function positionLeftPopover() {
        const pop = document.getElementById('cai-left-popover');
        const btn = document.getElementById('cai-left-merged-btn');
        if (!pop || !btn) return;
        const rect = btn.getBoundingClientRect();
        pop.style.left = `${Math.max(10, rect.left)}px`;
        pop.style.bottom = `${Math.max(10, window.innerHeight - rect.top + 8)}px`;
    }

    function setLeftPopupOpen(open) {
        leftPopupOpen = Boolean(open);
        const pop = document.getElementById('cai-left-popover');
        const btn = document.getElementById('cai-left-merged-btn');
        if (pop) {
            if (leftPopupOpen) {
                positionLeftPopover();
            }
            pop.classList.toggle('is-open', leftPopupOpen);
        }
        if (btn) {
            btn.classList.toggle('is-open', leftPopupOpen);
            btn.setAttribute('aria-expanded', String(leftPopupOpen));
        }
    }

    let drawerCloseTimer = 0;
    // ST closes the old drawer, waits `animation_duration`, then opens the new one when you
    // switch drawers. Debounce the "all closed" state so the c.ai bar doesn't flash in between.
    const DRAWER_CLOSE_SETTLE_MS = 380;

    function syncDrawerState() {
        const open = hasOpenDrawer();

        if (open) {
            clearTimeout(drawerCloseTimer);
            drawerCloseTimer = 0;
            document.body.classList.add('cai-header-drawer-open');
            return;
        }

        if (!document.body.classList.contains('cai-header-drawer-open') || drawerCloseTimer) {
            return;
        }

        drawerCloseTimer = setTimeout(() => {
            drawerCloseTimer = 0;
            if (hasOpenDrawer()) return;
            document.body.classList.remove('cai-header-drawer-open');
            // Drawer really closed → return to the c.ai title bar.
            setMenuOpen(false);
        }, DRAWER_CLOSE_SETTLE_MS);
    }

    /* ---------------- Placeholder ---------------- */

    function computePlaceholder(name, mode) {
        if (mode === 'hide') return '';
        if (mode === 'zh') {
            return name ? `给 ${name} 发消息` : '发消息';
        }
        return name ? `Message ${name}...` : 'Message...';
    }

    function isDisconnected() {
        return Boolean(document.getElementById('send_form')?.classList.contains('no-connection'));
    }

    function rememberOriginalPlaceholder(textarea) {
        if (originalConnectedText === null) {
            originalConnectedText = textarea.getAttribute('connected_text') || '';
            originalPlaceholder = textarea.placeholder || '';
        }
    }

    function updatePlaceholder() {
        const textarea = document.getElementById('send_textarea');
        if (!textarea) return;

        const settings = getSettings();
        if (!settings.enabled) return;

        rememberOriginalPlaceholder(textarea);
        const { name } = resolveIdentity();
        const desired = computePlaceholder(name, settings.placeholderMode);

        applyingPlaceholder = true;
        try {
            // ST copies `connected_text` into the placeholder whenever the API connects.
            textarea.setAttribute('connected_text', desired);
            // Keep ST's "Not connected to API!" warning visible while offline.
            if (!isDisconnected() && textarea.placeholder !== desired) {
                textarea.placeholder = desired;
            }
        } finally {
            applyingPlaceholder = false;
        }
    }

    function restorePlaceholder() {
        const textarea = document.getElementById('send_textarea');
        if (!textarea || originalConnectedText === null) return;
        applyingPlaceholder = true;
        try {
            textarea.setAttribute('connected_text', originalConnectedText);
            if (!isDisconnected()) {
                textarea.placeholder = originalConnectedText || originalPlaceholder;
            }
        } finally {
            applyingPlaceholder = false;
        }
    }

    function observePlaceholder() {
        const textarea = document.getElementById('send_textarea');
        if (!textarea || placeholderObserver) return;

        placeholderObserver = new MutationObserver(() => {
            if (applyingPlaceholder) return;
            if (!getSettings().enabled) return;
            updatePlaceholder();
        });
        placeholderObserver.observe(textarea, {
            attributes: true,
            attributeFilter: ['placeholder'],
        });
    }

    /* ---------------- Header ---------------- */

    function updateHeader() {
        const settings = getSettings();
        if (!settings.enabled) return;

        const nameEl = document.getElementById('cai-header-name');
        const avatarEl = document.getElementById('cai-header-avatar');
        const { displayName, avatarUrl } = resolveIdentity();

        if (nameEl) {
            nameEl.textContent = displayName;
        }

        if (avatarEl) {
            if (settings.showAvatar && avatarUrl) {
                if (avatarEl.getAttribute('src') !== avatarUrl) {
                    avatarEl.src = avatarUrl;
                }
                avatarEl.style.display = 'block';
            } else {
                avatarEl.removeAttribute('src');
                avatarEl.style.display = 'none';
            }
        }

        updatePlaceholder();
    }

    function applyFontMode(settings, active) {
        for (const cls of Object.values(FONT_CLASSES)) {
            document.body.classList.remove(cls);
        }
        const cls = FONT_CLASSES[settings.fontMode];
        if (active && cls) {
            document.body.classList.add(cls);
        }
    }

    function applyEnabledState() {
        const settings = getSettings();
        const active = Boolean(settings.enabled);
        document.body.classList.toggle('cai-header-active', active);
        document.body.classList.toggle('cai-merge-left-buttons', active && Boolean(settings.mergeLeftButtons));
        document.body.classList.toggle('cai-hide-placeholder', active && settings.placeholderMode === 'hide');
        applyFontMode(settings, active);

        if (!active) {
            setMenuOpen(false);
            setLeftPopupOpen(false);
            clearTimeout(drawerCloseTimer);
            drawerCloseTimer = 0;
            document.body.classList.remove('cai-header-drawer-open');
            restorePlaceholder();
        } else {
            updateHeader();
            syncDrawerState();
        }
    }

    /**
     * Opens the character drawer and switches it to a sub-page.
     * @param {'list'|'current'} target
     */
    function openCharacterPanel(target) {
        setLeftPopupOpen(false);
        setMenuOpen(true);

        const panel = document.getElementById('right-nav-panel');
        const alreadyOpen = Boolean(panel?.classList.contains('openDrawer'));
        if (!alreadyOpen) {
            const toggle = document.querySelector('#rightNavHolder > .drawer-toggle') ||
                document.getElementById('rightNavDrawerIcon');
            toggle?.click();
        }

        // `<` → character list; avatar/name → current character card (ST handles groups in the same button).
        const { name } = resolveIdentity();
        const pageButton = target === 'current' && name
            ? document.getElementById('rm_button_selected_ch')
            : document.getElementById('rm_button_characters');
        pageButton?.click();
    }

    function createHeaderDom() {
        const holder = document.getElementById('top-settings-holder');
        if (!holder || document.getElementById('cai-top-header')) return;

        const header = document.createElement('header');
        header.id = 'cai-top-header';
        header.setAttribute('aria-label', 'Character Header');
        header.innerHTML = `
            <button type="button" id="cai-header-back" class="cai-header-btn" aria-label="Characters" title="Characters">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button type="button" id="cai-header-identity" class="cai-header-identity" aria-label="Current Character">
                <img id="cai-header-avatar" class="cai-header-avatar" alt="" />
                <span id="cai-header-name" class="cai-header-name">Characters</span>
            </button>
            <button type="button" id="cai-header-menu" class="cai-header-btn" aria-label="Open SillyTavern Menu" title="Open Menu">
                <i class="fa-solid fa-ellipsis"></i>
            </button>
        `;

        holder.appendChild(header);

        const avatarEl = header.querySelector('#cai-header-avatar');
        avatarEl.addEventListener('error', () => {
            avatarEl.style.display = 'none';
        });

        header.querySelector('#cai-header-back').addEventListener('click', (e) => {
            e.stopPropagation();
            openCharacterPanel('list');
        });

        header.querySelector('#cai-header-identity').addEventListener('click', (e) => {
            e.stopPropagation();
            openCharacterPanel('current');
        });

        header.querySelector('#cai-header-menu').addEventListener('click', (e) => {
            e.stopPropagation();
            setLeftPopupOpen(false);
            setMenuOpen(true);
        });

        // Tapping the chat while only the icon row is showing (no drawer) → back to the c.ai title bar.
        const sheld = document.getElementById('sheld');
        if (sheld) {
            sheld.addEventListener('pointerdown', () => {
                if (menuOpen && !hasOpenDrawer()) {
                    setMenuOpen(false);
                }
            }, { passive: true });
        }
    }

    function closeNativeLeftMenus() {
        // ST's own popup menus close on any document click outside them; make sure they are not left open
        // underneath our popover.
        for (const [menuId, triggerId] of [['options', 'options_button'], ['extensionsMenu', 'extensionsMenuButton']]) {
            const menu = document.getElementById(menuId);
            const trigger = document.getElementById(triggerId);
            if (menu && trigger && menu.style.display !== 'none' && getComputedStyle(menu).display !== 'none') {
                trigger.click();
            }
        }
    }

    function createMergedLeftButton() {
        const leftForm = document.getElementById('leftSendForm');
        if (!leftForm) return;

        if (!document.getElementById('cai-left-merged-btn')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'cai-left-merged-btn';
            btn.className = 'cai-left-merged-btn';
            btn.setAttribute('aria-label', 'Chat & Extension Menu');
            btn.setAttribute('aria-haspopup', 'menu');
            btn.setAttribute('aria-expanded', 'false');
            btn.title = 'Chat Options & Extensions';
            btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
            leftForm.appendChild(btn);

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const willOpen = !leftPopupOpen;
                if (willOpen) {
                    closeNativeLeftMenus();
                    const extBtn = document.getElementById('extensionsMenuButton');
                    const extItem = document.querySelector('#cai-left-popover [data-action="extensions"]');
                    if (extItem) {
                        const hasExt = Boolean(extBtn && extBtn.style.display !== 'none');
                        extItem.style.display = hasExt ? 'flex' : 'none';
                    }
                }
                setLeftPopupOpen(willOpen);
            });
        }

        if (!document.getElementById('cai-left-popover')) {
            const popover = document.createElement('div');
            popover.id = 'cai-left-popover';
            popover.className = 'cai-left-popover';
            popover.setAttribute('role', 'menu');
            popover.innerHTML = `
                <button type="button" class="cai-left-pop-item" role="menuitem" data-action="options">
                    <i class="fa-solid fa-bars"></i>
                    <span>Chat Options</span>
                </button>
                <button type="button" class="cai-left-pop-item" role="menuitem" data-action="extensions">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    <span>Extensions</span>
                </button>
            `;
            document.body.appendChild(popover);

            popover.addEventListener('click', (e) => {
                const item = e.target.closest('.cai-left-pop-item');
                if (!item) return;
                e.preventDefault();
                // Stop here so ST's document-level "click outside closes menu" handler
                // doesn't immediately close the menu we're about to open.
                e.stopPropagation();
                const action = item.getAttribute('data-action');
                setLeftPopupOpen(false);
                if (action === 'options') {
                    document.getElementById('options_button')?.click();
                } else if (action === 'extensions') {
                    document.getElementById('extensionsMenuButton')?.click();
                }
            });

            document.addEventListener('pointerdown', (e) => {
                if (!leftPopupOpen) return;
                if (e.target.closest('#cai-left-merged-btn') || e.target.closest('#cai-left-popover')) return;
                setLeftPopupOpen(false);
            }, { passive: true });

            // Viewport changes (keyboard in/out, rotation) would leave a fixed popover floating
            // in the wrong place, so just close it.
            window.addEventListener('resize', () => {
                if (leftPopupOpen) setLeftPopupOpen(false);
            }, { passive: true });
        }
    }

    function observeDrawers() {
        const holder = document.getElementById('top-settings-holder');
        if (!holder || drawerObserver) return;

        drawerObserver = new MutationObserver(() => {
            syncDrawerState();
        });
        drawerObserver.observe(holder, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
        });
    }

    function createSettingsPanel() {
        const container = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
        if (!container || document.getElementById('cai_header_bar_settings')) return;

        const settings = getSettings();
        const sel = (key, value) => (settings[key] === value ? 'selected' : '');
        const block = document.createElement('div');
        block.id = 'cai_header_bar_settings';
        block.className = 'cai-header-settings';
        block.innerHTML = `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Cai Header Bar</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label class="checkbox_label" for="cai_header_enabled">
                        <input id="cai_header_enabled" type="checkbox" ${settings.enabled ? 'checked' : ''} />
                        <span>Enable c.ai Character Header Bar</span>
                    </label>
                    <label class="checkbox_label" for="cai_header_show_avatar">
                        <input id="cai_header_show_avatar" type="checkbox" ${settings.showAvatar ? 'checked' : ''} />
                        <span>Show Character Avatar</span>
                    </label>
                    <label class="checkbox_label" for="cai_merge_left_buttons">
                        <input id="cai_merge_left_buttons" type="checkbox" ${settings.mergeLeftButtons ? 'checked' : ''} />
                        <span>Merge Left Input Icons into One (+)</span>
                    </label>
                    <div class="cai-setting-row">
                        <label for="cai_placeholder_mode">Input Placeholder</label>
                        <select id="cai_placeholder_mode" class="text_pole">
                            <option value="en" ${sel('placeholderMode', 'en')}>Message {{char}}...</option>
                            <option value="zh" ${sel('placeholderMode', 'zh')}>给 {{char}} 发消息</option>
                            <option value="hide" ${sel('placeholderMode', 'hide')}>Hidden (Blank)</option>
                        </select>
                    </div>
                    <div class="cai-setting-row">
                        <label for="cai_font_mode">Font (bundled, works offline)</label>
                        <select id="cai_font_mode" class="text_pole">
                            <option value="cai" ${sel('fontMode', 'cai')}>c.ai app — Open Sans</option>
                            <option value="lion" ${sel('fontMode', 'lion')}>Lion original — Fira Sans</option>
                            <option value="theme" ${sel('fontMode', 'theme')}>Use theme font</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(block);

        const bind = (id, key, prop, after) => {
            block.querySelector(id).addEventListener('change', (e) => {
                getSettings()[key] = e.target[prop];
                saveSettings();
                after();
            });
        };
        bind('#cai_header_enabled', 'enabled', 'checked', applyEnabledState);
        bind('#cai_header_show_avatar', 'showAvatar', 'checked', updateHeader);
        bind('#cai_merge_left_buttons', 'mergeLeftButtons', 'checked', applyEnabledState);
        bind('#cai_placeholder_mode', 'placeholderMode', 'value', applyEnabledState);
        bind('#cai_font_mode', 'fontMode', 'value', applyEnabledState);
    }

    function registerQuickToggleCommand() {
        const ctx = getCtx();
        const Parser = ctx?.SlashCommandParser;
        const Cmd = ctx?.SlashCommand;
        if (!Parser?.addCommandObject || !Cmd?.fromProps) return;

        try {
            Parser.addCommandObject(Cmd.fromProps({
                name: 'cai-header',
                callback: () => {
                    const s = getSettings();
                    s.enabled = !s.enabled;
                    saveSettings();
                    applyEnabledState();
                    const checkbox = document.getElementById('cai_header_enabled');
                    if (checkbox) checkbox.checked = s.enabled;
                    return s.enabled ? 'enabled' : 'disabled';
                },
                helpString: 'Toggle Cai Header Bar on/off.',
            }));
        } catch {
            // Already registered
        }
    }

    function bindEvents() {
        const ctx = getCtx();
        const eventSource = ctx?.eventSource;
        const eventTypes = ctx?.eventTypes || ctx?.event_types;
        if (!eventSource || !eventTypes) return;

        const refreshEvents = [
            eventTypes.APP_READY,
            eventTypes.CHAT_CHANGED,
            eventTypes.CHARACTER_EDITED,
            eventTypes.GROUP_UPDATED,
            eventTypes.CHARACTER_DELETED,
            eventTypes.SETTINGS_UPDATED,
        ].filter(Boolean);

        for (const evt of refreshEvents) {
            eventSource.on(evt, () => {
                updateHeader();
                syncDrawerState();
            });
        }
    }

    function init() {
        if (initialized) return;
        initialized = true;

        createHeaderDom();
        createMergedLeftButton();
        createSettingsPanel();
        observeDrawers();
        observePlaceholder();
        bindEvents();
        registerQuickToggleCommand();
        applyEnabledState();

        setTimeout(updateHeader, 450);
        setTimeout(updateHeader, 1500);
    }

    if (typeof window.jQuery === 'function') {
        window.jQuery(() => init());
    } else if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
