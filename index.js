/* ==========================================================================
   Cai Header Bar — SillyTavern / TauriTavern Extension
   Renders a native Character.AI-style top header:
     [ < ]   [Avatar] Character Name   [ ⋯ ]
   - Left (<): Closes any open drawer, or opens Character List
   - Center: Live current character/group avatar + name (tap for Character panel)
   - Right (⋯ / ×): Drops down ST's 9-icon drawer toolbar cleanly underneath
   ========================================================================== */

(() => {
    const EXT_KEY = 'cai_header_bar';
    const DEFAULT_SETTINGS = {
        enabled: true,
        showAvatar: true,
    };

    let menuOpen = false;
    let drawerObserver = null;
    let initialized = false;

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
        for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
            if (ctx.extensionSettings[EXT_KEY][k] === undefined) {
                ctx.extensionSettings[EXT_KEY][k] = v;
            }
        }
        return ctx.extensionSettings[EXT_KEY];
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
            return { name: 'TauriTavern', avatarUrl: '' };
        }

        // 1. Group chat
        if (ctx.groupId && Array.isArray(ctx.groups)) {
            const group = ctx.groups.find((g) => String(g.id) === String(ctx.groupId));
            if (group) {
                return {
                    name: group.name || 'Group Chat',
                    avatarUrl: group.avatar_url || '',
                };
            }
        }

        // 2. Single character chat
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
            return {
                name: ch.name || ctx.name2 || 'Character',
                avatarUrl,
            };
        }

        // 3. Home / no character selected
        return {
            name: 'Characters',
            avatarUrl: '',
        };
    }

    function hasOpenDrawer() {
        return Boolean(document.querySelector('#top-settings-holder .drawer-content.openDrawer'));
    }

    function closeAllDrawers() {
        const openIcons = document.querySelectorAll('#top-settings-holder .drawer-icon.openIcon');
        if (openIcons.length > 0) {
            openIcons.forEach((el) => el.click());
            return true;
        }
        const openDrawers = document.querySelectorAll('#top-settings-holder .drawer-content.openDrawer');
        if (openDrawers.length > 0) {
            openDrawers.forEach((drawer) => {
                const toggle = drawer.closest('.drawer')?.querySelector('.drawer-toggle');
                if (toggle) toggle.click();
            });
            return true;
        }
        return false;
    }

    function setMenuOpen(open) {
        menuOpen = Boolean(open);
        document.body.classList.toggle('cai-header-menu-open', menuOpen);
        syncMenuIcon();
    }

    function syncMenuIcon() {
        const icon = document.querySelector('#cai-header-menu i');
        if (!icon) return;
        const expanded = menuOpen || hasOpenDrawer();
        icon.className = expanded ? 'fa-solid fa-xmark' : 'fa-solid fa-ellipsis';
    }

    function syncDrawerState() {
        const open = hasOpenDrawer();
        const wasOpen = document.body.classList.contains('cai-header-drawer-open');
        document.body.classList.toggle('cai-header-drawer-open', open);

        // When the user finishes with a drawer and closes it, tuck the ST toolbar back away
        if (wasOpen && !open) {
            setMenuOpen(false);
        } else {
            syncMenuIcon();
        }
    }

    function updateHeader() {
        const settings = getSettings();
        const header = document.getElementById('cai-top-header');
        if (!header) return;

        const nameEl = document.getElementById('cai-header-name');
        const avatarEl = document.getElementById('cai-header-avatar');
        const { name, avatarUrl } = resolveIdentity();

        if (nameEl) {
            nameEl.textContent = name;
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
    }

    function applyEnabledState() {
        const settings = getSettings();
        const active = Boolean(settings.enabled);
        document.body.classList.toggle('cai-header-active', active);
        if (!active) {
            setMenuOpen(false);
            document.body.classList.remove('cai-header-drawer-open');
        } else {
            updateHeader();
            syncDrawerState();
        }
    }

    function createHeaderDom() {
        if (document.getElementById('cai-top-header')) return;

        const header = document.createElement('header');
        header.id = 'cai-top-header';
        header.setAttribute('role', 'banner');
        header.setAttribute('aria-label', 'Character Header');
        header.innerHTML = `
            <button type="button" id="cai-header-back" class="cai-header-btn" aria-label="Back or Characters" title="Back / Characters">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button type="button" id="cai-header-identity" class="cai-header-identity" aria-label="Current Character">
                <img id="cai-header-avatar" class="cai-header-avatar" alt="" />
                <span id="cai-header-name" class="cai-header-name">Characters</span>
            </button>
            <button type="button" id="cai-header-menu" class="cai-header-btn" aria-label="Toggle SillyTavern Menu" title="Toggle Menu">
                <i class="fa-solid fa-ellipsis"></i>
            </button>
        `;

        document.body.prepend(header);

        const avatarEl = header.querySelector('#cai-header-avatar');
        avatarEl.addEventListener('error', () => {
            avatarEl.style.display = 'none';
        });

        // Left button (<): close open drawer, or open Character List
        header.querySelector('#cai-header-back').addEventListener('click', (e) => {
            e.stopPropagation();
            if (hasOpenDrawer()) {
                closeAllDrawers();
                setMenuOpen(false);
                return;
            }
            if (menuOpen) {
                setMenuOpen(false);
                return;
            }
            document.getElementById('rightNavDrawerIcon')?.click();
        });

        // Center ([Avatar] Name): open/toggle Character panel
        header.querySelector('#cai-header-identity').addEventListener('click', (e) => {
            e.stopPropagation();
            document.getElementById('rightNavDrawerIcon')?.click();
        });

        // Right button (⋯ / ×): toggle ST 9-icon drawer toolbar
        header.querySelector('#cai-header-menu').addEventListener('click', (e) => {
            e.stopPropagation();
            if (hasOpenDrawer()) {
                closeAllDrawers();
                setMenuOpen(false);
                return;
            }
            setMenuOpen(!menuOpen);
        });

        // Tapping chat area dismisses the expanded 9-icon toolbar cleanly
        const sheld = document.getElementById('sheld');
        if (sheld) {
            sheld.addEventListener('pointerdown', () => {
                if (menuOpen && !hasOpenDrawer()) {
                    setMenuOpen(false);
                }
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
                </div>
            </div>
        `;
        container.appendChild(block);

        block.querySelector('#cai_header_enabled').addEventListener('change', (e) => {
            const s = getSettings();
            s.enabled = e.target.checked;
            saveSettings();
            applyEnabledState();
        });

        block.querySelector('#cai_header_show_avatar').addEventListener('change', (e) => {
            const s = getSettings();
            s.showAvatar = e.target.checked;
            saveSettings();
            updateHeader();
        });
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
        createSettingsPanel();
        observeDrawers();
        bindEvents();
        applyEnabledState();

        // Catch initial chat hydration right after app boot
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
