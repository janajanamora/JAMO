/* ==========================================================================
   Cai Header Bar v1.2.0 — SillyTavern / TauriTavern Extension
   1. Swap-in-Place c.ai Header Bar ([ < ] [Avatar] Name [ ⋯ ])
   2. Dynamic c.ai Input Placeholder ("Message {{char}}..." / "给 {{char}} 发消息" / Hidden)
   3. Single Merged Left Input Button (combines Chat Options + Extensions outside pill)
   ========================================================================== */

(() => {
    const EXT_KEY = 'cai_header_bar';
    const DEFAULT_SETTINGS = {
        enabled: true,
        showAvatar: true,
        mergeLeftButtons: true,
        placeholderMode: 'en', // 'en' | 'zh' | 'hide'
    };

    let menuOpen = false;
    let leftPopupOpen = false;
    let drawerObserver = null;
    let placeholderObserver = null;
    let applyingPlaceholder = false;
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
            return { name: '', displayName: 'TauriTavern', avatarUrl: '' };
        }

        if (ctx.groupId && Array.isArray(ctx.groups)) {
            const group = ctx.groups.find((g) => String(g.id) === String(ctx.groupId));
            if (group) {
                const name = group.name || 'Group Chat';
                return {
                    name,
                    displayName: name,
                    avatarUrl: group.avatar_url || '',
                };
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
            return {
                name,
                displayName: name,
                avatarUrl,
            };
        }

        return {
            name: '',
            displayName: 'Characters',
            avatarUrl: '',
        };
    }

    function hasOpenDrawer() {
        return Boolean(document.querySelector('#top-settings-holder .drawer-content.openDrawer'));
    }

    function setMenuOpen(open) {
        menuOpen = Boolean(open);
        document.body.classList.toggle('cai-header-menu-open', menuOpen);
    }

    function setLeftPopupOpen(open) {
        leftPopupOpen = Boolean(open);
        const pop = document.getElementById('cai-left-popover');
        if (pop) {
            pop.classList.toggle('is-open', leftPopupOpen);
        }
        const btn = document.getElementById('cai-left-merged-btn');
        if (btn) {
            btn.classList.toggle('is-open', leftPopupOpen);
        }
    }

    function syncDrawerState() {
        const open = hasOpenDrawer();
        const wasOpen = document.body.classList.contains('cai-header-drawer-open');
        document.body.classList.toggle('cai-header-drawer-open', open);

        if (wasOpen && !open) {
            setMenuOpen(false);
        }
    }

    function computePlaceholder(name, mode) {
        if (mode === 'hide') return '';
        if (mode === 'zh') {
            return name ? `给 ${name} 发消息` : '发消息';
        }
        return name ? `Message ${name}...` : 'Message...';
    }

    function updatePlaceholder() {
        const textarea = document.getElementById('send_textarea');
        if (!textarea) return;

        const settings = getSettings();
        if (!settings.enabled) return;

        // Preserve explicit "Not connected" warning if ST set it and no API is connected
        const noConnText = textarea.getAttribute('no_connection_text') || 'Not connected to API!';
        if (textarea.placeholder === noConnText && !document.querySelector('.online_status_indicator.success')) {
            // Still replace if user explicitly chose 'hide', otherwise keep brief connection notice
            if (settings.placeholderMode !== 'hide') {
                // Only keep if truly disconnected; fall through if connected
            }
        }

        const { name } = resolveIdentity();
        const desired = computePlaceholder(name, settings.placeholderMode);

        applyingPlaceholder = true;
        try {
            textarea.setAttribute('connected_text', desired);
            if (textarea.placeholder !== desired) {
                textarea.placeholder = desired;
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
            const settings = getSettings();
            if (!settings.enabled) return;
            const { name } = resolveIdentity();
            const desired = computePlaceholder(name, settings.placeholderMode);
            if (textarea.placeholder !== desired) {
                updatePlaceholder();
            }
        });
        placeholderObserver.observe(textarea, {
            attributes: true,
            attributeFilter: ['placeholder'],
        });
    }

    function updateHeader() {
        const settings = getSettings();
        const header = document.getElementById('cai-top-header');
        if (header) {
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
        }

        updatePlaceholder();
    }

    function applyEnabledState() {
        const settings = getSettings();
        const active = Boolean(settings.enabled);
        document.body.classList.toggle('cai-header-active', active);
        document.body.classList.toggle('cai-merge-left-buttons', active && Boolean(settings.mergeLeftButtons));
        document.body.classList.toggle('cai-hide-placeholder', active && settings.placeholderMode === 'hide');

        if (!active) {
            setMenuOpen(false);
            setLeftPopupOpen(false);
            document.body.classList.remove('cai-header-drawer-open');
        } else {
            updateHeader();
            syncDrawerState();
        }
    }

    function openCharactersDrawer() {
        setLeftPopupOpen(false);
        setMenuOpen(true);
        const toggle = document.querySelector('#rightNavHolder > .drawer-toggle') ||
            document.getElementById('rightNavDrawerIcon');
        if (toggle) {
            toggle.click();
        }
    }

    function createHeaderDom() {
        if (document.getElementById('cai-top-header')) return;

        const header = document.createElement('header');
        header.id = 'cai-top-header';
        header.setAttribute('role', 'banner');
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

        document.body.prepend(header);

        const stopTouch = (e) => e.stopPropagation();
        header.addEventListener('touchstart', stopTouch, { passive: true });
        header.addEventListener('mousedown', stopTouch);

        const avatarEl = header.querySelector('#cai-header-avatar');
        avatarEl.addEventListener('error', () => {
            avatarEl.style.display = 'none';
        });

        header.querySelector('#cai-header-back').addEventListener('click', (e) => {
            e.stopPropagation();
            openCharactersDrawer();
        });

        header.querySelector('#cai-header-identity').addEventListener('click', (e) => {
            e.stopPropagation();
            openCharactersDrawer();
        });

        header.querySelector('#cai-header-menu').addEventListener('click', (e) => {
            e.stopPropagation();
            setLeftPopupOpen(false);
            setMenuOpen(true);
        });

        const sheld = document.getElementById('sheld');
        if (sheld) {
            sheld.addEventListener('pointerdown', () => {
                if (menuOpen && !hasOpenDrawer()) {
                    setMenuOpen(false);
                }
            }, { passive: true });
        }
    }

    function createMergedLeftButton() {
        const leftForm = document.getElementById('leftSendForm');
        if (!leftForm || document.getElementById('cai-left-merged-btn')) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'cai-left-merged-btn';
        btn.className = 'cai-left-merged-btn';
        btn.setAttribute('aria-label', 'Chat & Extension Menu');
        btn.title = 'Chat Options & Extensions';
        btn.innerHTML = '<i class="fa-solid fa-plus"></i>';

        const popover = document.createElement('div');
        popover.id = 'cai-left-popover';
        popover.className = 'cai-left-popover';
        popover.innerHTML = `
            <button type="button" class="cai-left-pop-item" data-action="options">
                <i class="fa-solid fa-bars"></i>
                <span>Chat Options</span>
            </button>
            <button type="button" class="cai-left-pop-item" data-action="extensions">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span>Extensions</span>
            </button>
        `;

        leftForm.appendChild(btn);
        leftForm.appendChild(popover);

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const extBtn = document.getElementById('extensionsMenuButton');
            const extItem = popover.querySelector('[data-action="extensions"]');
            if (extItem) {
                const hasExt = Boolean(extBtn && extBtn.style.display !== 'none');
                extItem.style.display = hasExt ? 'flex' : 'none';
            }
            setLeftPopupOpen(!leftPopupOpen);
        });

        popover.addEventListener('click', (e) => {
            const item = e.target.closest('.cai-left-pop-item');
            if (!item) return;
            e.preventDefault();
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
                    <label class="checkbox_label" for="cai_merge_left_buttons">
                        <input id="cai_merge_left_buttons" type="checkbox" ${settings.mergeLeftButtons ? 'checked' : ''} />
                        <span>Merge Left Input Icons into One (+)</span>
                    </label>
                    <div class="cai-setting-row">
                        <label for="cai_placeholder_mode">Input Placeholder</label>
                        <select id="cai_placeholder_mode" class="text_pole">
                            <option value="en" ${settings.placeholderMode === 'en' ? 'selected' : ''}>Message {{char}}...</option>
                            <option value="zh" ${settings.placeholderMode === 'zh' ? 'selected' : ''}>给 {{char}} 发消息</option>
                            <option value="hide" ${settings.placeholderMode === 'hide' ? 'selected' : ''}>Hidden (Blank)</option>
                        </select>
                    </div>
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

        block.querySelector('#cai_merge_left_buttons').addEventListener('change', (e) => {
            const s = getSettings();
            s.mergeLeftButtons = e.target.checked;
            saveSettings();
            applyEnabledState();
        });

        block.querySelector('#cai_placeholder_mode').addEventListener('change', (e) => {
            const s = getSettings();
            s.placeholderMode = e.target.value;
            saveSettings();
            applyEnabledState();
        });
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
                    return s.enabled ? 'enabled' : 'disabled';
                },
                helpString: 'Toggle Cai Header Bar on/off.',
            }));
        } catch {
            // Ignore if already registered
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
