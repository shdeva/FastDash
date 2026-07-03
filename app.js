const USER_CONFIG_PATH = "config/FastDash_userconfig.json";
const DEFAULT_CONFIG_PATH = "FastDash_defaultconfig.json";
const USER_CONFIG_SAVE_DEBOUNCE_MS = 250;
const MAX_TITLE_LENGTH = 60;
const defaultSettings = {
    title: "FastDash",
    theme: "early-bird",
    font: "arial",
    dateFormat: "mdy",
    showSeconds: false,
    use24Hour: false,
    showDayOfWeek: false
};

let userConfig = {
    settings: { ...defaultSettings },
    blocks: []
};
let saveConfigTimeoutId = 0;
let saveConfigInFlight = Promise.resolve();

const fontFamilies = {
    arial: "Arial, Helvetica, sans-serif",
    courier: `"Courier New", Courier, monospace`,
    garamond: `Garamond, "Times New Roman", serif`,
    georgia: `Georgia, "Times New Roman", serif`,
    "times-new-roman": `"Times New Roman", Times, serif`,
    trebuchet: `"Trebuchet MS", Trebuchet, Arial, sans-serif`,
    verdana: "Verdana, Geneva, sans-serif"
};

const headerTitle = document.querySelector("#header-title");
const localTime = document.querySelector("#local-time");
const openSettingsButton = document.querySelector("#open-header-settings");
const settingsDialog = document.querySelector("#header-settings");
const settingsForm = document.querySelector("#header-settings-form");
const headerTitleInput = document.querySelector("#header-title-input");
const themeSelect = document.querySelector("#theme-select");
const fontSelect = document.querySelector("#font-select");
const dateFormatSelect = document.querySelector("#date-format-select");
const showSecondsInput = document.querySelector("#show-seconds-input");
const use24HourInput = document.querySelector("#use-24-hour-input");
const dayOfWeekInput = document.querySelector("#day-of-week-input");
const exportConfigButton = document.querySelector("#export-config-button");
const importConfigButton = document.querySelector("#import-config-button");
const importConfigInput = document.querySelector("#import-config-input");
const resetConfigButton = document.querySelector("#reset-config-button");

function getSettings() {
    return normalizeSettings(userConfig.settings);
}

function saveSettings(settings) {
    userConfig.settings = normalizeSettings(settings);
    queueSaveConfiguration();
}

function pad(value) {
    return String(value).padStart(2, "0");
}

function normalizeSettings(settings) {
    const normalized = { ...defaultSettings, ...settings };
    normalized.title = trimToLength(normalized.title, MAX_TITLE_LENGTH) || defaultSettings.title;

    if (settings?.prettyDate && normalized.dateFormat !== "pretty") {
        normalized.dateFormat = "pretty";
        normalized.showDayOfWeek = true;
    }

    if (!["mdy", "dmy", "ymd", "pretty", "clock-only", "none"].includes(normalized.dateFormat)) {
        normalized.dateFormat = defaultSettings.dateFormat;
    }

    delete normalized.prettyDate;
    return normalized;
}

function formatDate(date, settings) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1);
    const day = String(date.getDate());
    const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(date);
    const monthName = new Intl.DateTimeFormat(undefined, { month: "long" }).format(date);
    let formattedDate;

    if (settings.dateFormat === "pretty") {
        formattedDate = `${monthName} ${day} ${year}`;
    } else if (settings.dateFormat === "dmy") {
        formattedDate = `${day}-${month}-${year}`;
    } else if (settings.dateFormat === "ymd") {
        formattedDate = `${year}-${month}-${day}`;
    } else {
        formattedDate = `${month}-${day}-${year}`;
    }

    return settings.showDayOfWeek ? `${weekday} ${formattedDate}` : formattedDate;
}

function formatTime(date, settings) {
    return new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        second: settings.showSeconds ? "2-digit" : undefined,
        hour12: !settings.use24Hour
    }).format(date);
}

function updateLocalTime() {
    if (!localTime) return;

    const settings = getSettings();
    if (settings.dateFormat === "none") {
        localTime.textContent = "";
        localTime.hidden = true;
        return;
    }

    const now = new Date();
    localTime.hidden = false;
    localTime.textContent = settings.dateFormat === "clock-only" ? formatTime(now, settings) : `${formatDate(now, settings)} ${formatTime(now, settings)}`;
}

function applySettings() {
    const settings = getSettings();

    if (headerTitle) headerTitle.textContent = trimToLength(settings.title || defaultSettings.title, MAX_TITLE_LENGTH);
    document.title = trimToLength(settings.title || defaultSettings.title, MAX_TITLE_LENGTH);
    document.documentElement.dataset.theme = settings.theme || defaultSettings.theme;
    const fontKey = fontFamilies[settings.font] ? settings.font : defaultSettings.font;
    document.documentElement.style.setProperty("--site-font", fontFamilies[fontKey]);

    if (headerTitleInput) headerTitleInput.value = trimToLength(settings.title || defaultSettings.title, MAX_TITLE_LENGTH);
    updateCharacterCounter(headerTitleInput);
    if (themeSelect) themeSelect.value = settings.theme || defaultSettings.theme;
    if (fontSelect) fontSelect.value = fontKey;
    if (dateFormatSelect) dateFormatSelect.value = settings.dateFormat || defaultSettings.dateFormat;
    if (showSecondsInput) showSecondsInput.checked = Boolean(settings.showSeconds);
    if (use24HourInput) use24HourInput.checked = Boolean(settings.use24Hour);
    if (dayOfWeekInput) dayOfWeekInput.checked = Boolean(settings.showDayOfWeek);

    updateLocalTime();
}

openSettingsButton?.addEventListener("click", () => {
    applySettings();
    settingsDialog?.showModal();
    headerTitleInput?.focus();
    headerTitleInput?.select();
});

settingsForm?.addEventListener("submit", (event) => {
    if (event.submitter?.value !== "save") return;

    event.preventDefault();
    saveSettings({
        title: trimToLength(headerTitleInput.value, MAX_TITLE_LENGTH) || defaultSettings.title,
        theme: themeSelect.value,
        font: fontSelect.value,
        dateFormat: dateFormatSelect.value,
        showSeconds: showSecondsInput.checked,
        use24Hour: use24HourInput.checked,
        showDayOfWeek: dayOfWeekInput.checked
    });
    applySettings();
    settingsDialog.close();
});


function getConfigurationSnapshot() {
    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: getSettings(),
        blocks: getBlocks()
    };
}

async function exportConfiguration() {
    await saveUserConfiguration();

    let json;
    try {
        const response = await fetch(USER_CONFIG_PATH, { cache: "no-store" });
        if (!response.ok) throw new Error(`Config download failed with HTTP ${response.status}.`);
        json = await response.text();
    } catch (error) {
        console.warn("FastDash could not download the saved user config file, so it exported the current in-memory config.", error);
        json = JSON.stringify(getConfigurationSnapshot(), null, 2);
    }

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "FastDash_userconfig.json";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function importConfigurationFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener("load", async () => {
        try {
            const data = JSON.parse(String(reader.result || "{}"));
            if (!data || typeof data !== "object" || !Array.isArray(data.blocks)) {
                throw new Error("Invalid configuration file.");
            }

            userConfig = normalizeUserConfiguration(data);
            await saveUserConfiguration();
            applySettings();
            renderBlocks();
            settingsDialog?.close();
        } catch {
            alert("Could not import that configuration JSON.");
        } finally {
            importConfigInput.value = "";
        }
    });
    reader.readAsText(file);
}

async function resetConfiguration() {
    const confirmed = confirm("Reset the page to defaults? This will remove all sections, buttons, and header settings.");
    if (!confirmed) return;

    userConfig = await loadDefaultConfiguration();
    await saveUserConfiguration();

    editingBlockId = "";
    activeButtonBlockId = "";
    pendingDeleteBlockId = "";
    pendingDeleteButtonId = "";
    pendingDeleteMode = "button";

    applySettings();
    renderBlocks();
    settingsDialog?.close();
}
exportConfigButton?.addEventListener("click", exportConfiguration);
importConfigButton?.addEventListener("click", () => importConfigInput?.click());
importConfigInput?.addEventListener("change", () => importConfigurationFile(importConfigInput.files?.[0]));
resetConfigButton?.addEventListener("click", resetConfiguration);

settingsDialog?.addEventListener("click", (event) => {
    if (event.target === settingsDialog) settingsDialog.close();
});


const DEFAULT_BLOCK_TITLE = "New Section";
const CLICK_HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const buttonBlocks = document.querySelector("#button-blocks");
const addBlockButton = document.querySelector("#add-block-button");
const reorderBlocksButton = document.querySelector("#reorder-blocks-button");
const addButtonDialog = document.querySelector("#add-button-dialog");
const addButtonForm = document.querySelector("#add-button-form");
const newButtonText = document.querySelector("#new-button-text");
const newButtonUrl = document.querySelector("#new-button-url");
const closeAddButtonDialog = document.querySelector("#close-add-button-dialog");
const cancelAddButton = document.querySelector("#cancel-add-button");
const editButtonDialog = document.querySelector("#edit-button-dialog");
const editButtonForm = document.querySelector("#edit-button-form");
const editButtonId = document.querySelector("#edit-button-id");
const editButtonText = document.querySelector("#edit-button-text");
const editButtonUrl = document.querySelector("#edit-button-url");
const closeEditButtonDialog = document.querySelector("#close-edit-button-dialog");
const cancelEditButton = document.querySelector("#cancel-edit-button");
const deleteButtonDialog = document.querySelector("#delete-button-dialog");
const deleteButtonForm = document.querySelector("#delete-button-form");
const deleteButtonMessage = document.querySelector("#delete-button-message");
const closeDeleteButtonDialog = document.querySelector("#close-delete-button-dialog");
const cancelDeleteButton = document.querySelector("#cancel-delete-button");

const viewModes = ["square", "tiles", "list"];
const viewModeLabels = {
    square: "Square icons",
    tiles: "Rectangular tiles",
    list: "Single column list"
};
const sortModes = ["name", "recent", "added", "frequent"];
const sortModeLabels = {
    name: "Name",
    recent: "Recently Used",
    added: "Added",
    frequent: "Most Frequent"
};

const MAX_BLOCKS = 32;
const MAX_BUTTONS_PER_BLOCK = 100;
const MAX_BUTTON_TEXT_LENGTH = 30;
const MAX_BUTTON_URL_LENGTH = 120;
const FAVICON_CANDIDATE_TIMEOUT_MS = 800;

let editingBlockId = "";
let blockEditSnapshot = "";
let activeButtonBlockId = "";
let pendingDeleteBlockId = "";
let pendingDeleteButtonId = "";
let pendingDeleteMode = "button";
let isReorderMode = false;
let reorderSnapshot = "";
let draggedBlockId = "";

function createId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function trimToLength(value, maxLength) {
    return String(value ?? "").trim().slice(0, maxLength);
}

function getCharacterCounterText(input) {
    const limit = Number(input?.maxLength || 0);
    if (!input || limit <= 0) return "";
    return `${input.value.length}/${limit}`;
}

function updateCharacterCounter(input) {
    const counterKey = input?.id || input?.dataset?.counterId;
    if (!counterKey) return;

    const counter = document.querySelector(`[data-counter-for="${CSS.escape(counterKey)}"]`);
    if (counter) counter.textContent = getCharacterCounterText(input);
}

function createCharacterCounter(input) {
    const counterId = input.id || createId();
    input.dataset.counterId = counterId;

    const counter = document.createElement("span");
    counter.className = "character-counter block-title-counter";
    counter.dataset.counterFor = counterId;
    counter.textContent = getCharacterCounterText(input);
    return counter;
}

function updateDialogCharacterCounters(root = document) {
    root?.querySelectorAll?.("input[maxlength]").forEach(updateCharacterCounter);
}

function createBlock(overrides = {}) {
    return {
        id: createId(),
        title: DEFAULT_BLOCK_TITLE,
        buttons: [],
        viewMode: "tiles",
        sortMode: "added",
        sortDescending: false,
        clickHistory: {},
        collapsed: false,
        ...overrides
    };
}

function getBlocks() {
    if (Array.isArray(userConfig.blocks) && userConfig.blocks.length) {
        return sanitizeBlocks(userConfig.blocks);
    }

    const defaultBlocks = getDefaultBlocks();
    userConfig.blocks = defaultBlocks;
    queueSaveConfiguration();
    return defaultBlocks;
}

function sanitizeButton(button = {}) {
    const url = trimToLength(button.url, MAX_BUTTON_URL_LENGTH);
    const text = trimToLength(button.text, MAX_BUTTON_TEXT_LENGTH) || "New Button";

    return {
        ...button,
        id: String(button.id || createId()),
        text,
        url,
        favicon: trimToLength(button.favicon, MAX_BUTTON_URL_LENGTH) || faviconForUrl(url),
        addedAt: Number.isFinite(button.addedAt) ? button.addedAt : Date.now()
    };
}

function sanitizeBlock(block = {}) {
    const nextBlock = createBlock(block);

    return {
        ...nextBlock,
        id: String(nextBlock.id || createId()),
        title: trimToLength(nextBlock.title, MAX_TITLE_LENGTH) || DEFAULT_BLOCK_TITLE,
        buttons: Array.isArray(nextBlock.buttons) ? nextBlock.buttons.slice(0, MAX_BUTTONS_PER_BLOCK).map(sanitizeButton) : [],
        viewMode: viewModes.includes(nextBlock.viewMode) ? nextBlock.viewMode : "tiles",
        sortMode: sortModes.includes(nextBlock.sortMode) ? nextBlock.sortMode : "added",
        sortDescending: Boolean(nextBlock.sortDescending),
        clickHistory: nextBlock.clickHistory && typeof nextBlock.clickHistory === "object" && !Array.isArray(nextBlock.clickHistory) ? nextBlock.clickHistory : {},
        collapsed: Boolean(nextBlock.collapsed)
    };
}

function sanitizeBlocks(blocks) {
    return Array.isArray(blocks) ? blocks.slice(0, MAX_BLOCKS).map(sanitizeBlock) : [];
}

function saveBlocks(blocks) {
    userConfig.blocks = sanitizeBlocks(blocks);
    queueSaveConfiguration();
}

function getDefaultBlocks() {
    return [createBlock({ id: "block-1" })];
}

function normalizeUserConfiguration(data = {}) {
    return {
        settings: normalizeSettings(data.settings),
        blocks: Array.isArray(data.blocks) && data.blocks.length ? sanitizeBlocks(data.blocks) : getDefaultBlocks()
    };
}

async function loadDefaultConfiguration() {
    try {
        const response = await fetch(DEFAULT_CONFIG_PATH, { cache: "no-store" });
        if (response.ok) return normalizeUserConfiguration(await response.json());
        throw new Error(`Default config load failed with HTTP ${response.status}.`);
    } catch (error) {
        console.warn("FastDash is using built-in defaults because the default config file could not be loaded.", error);
        return normalizeUserConfiguration();
    }
}

async function loadUserConfiguration() {
    try {
        const response = await fetch(USER_CONFIG_PATH, { cache: "no-store" });
        if (response.ok) {
            userConfig = normalizeUserConfiguration(await response.json());
            return;
        }

        if (response.status !== 404) {
            throw new Error(`Config load failed with HTTP ${response.status}.`);
        }
    } catch (error) {
        console.warn("FastDash could not load the user config file.", error);
    }

    userConfig = await loadDefaultConfiguration();
    await saveUserConfiguration();
}

function queueSaveConfiguration() {
    if (saveConfigTimeoutId) window.clearTimeout(saveConfigTimeoutId);
    saveConfigTimeoutId = window.setTimeout(saveUserConfiguration, USER_CONFIG_SAVE_DEBOUNCE_MS);
}

async function saveUserConfiguration() {
    if (saveConfigTimeoutId) window.clearTimeout(saveConfigTimeoutId);
    saveConfigTimeoutId = 0;

    const payload = JSON.stringify(getConfigurationSnapshot(), null, 2);
    saveConfigInFlight = saveConfigInFlight
        .catch(() => undefined)
        .then(async () => {
            const response = await fetch(USER_CONFIG_PATH, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: payload
            });

            if (!response.ok) throw new Error(`Config save failed with HTTP ${response.status}.`);
        })
        .catch((error) => console.warn("FastDash could not save the user config file.", error));

    return saveConfigInFlight;
}

function updateBlock(blockId, updater) {
    const blocks = getBlocks().map((block) => block.id === blockId ? updater(block) : block);
    saveBlocks(blocks);
    renderBlocks();
}

function isLocalAddressHost(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (host === "localhost" || host.endsWith(".local")) return true;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
    if (host.includes(":")) return true;
    return false;
}

function normalizeUrl(rawUrl) {
    const raw = String(rawUrl ?? "").trim();
    if (raw.length > MAX_BUTTON_URL_LENGTH) throw new Error("URL is too long.");
    const trimmed = raw;
    const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
    const probeUrl = new URL(hasProtocol ? trimmed : `http://${trimmed}`);
    const protocol = hasProtocol ? "" : isLocalAddressHost(probeUrl.hostname) ? "http://" : "https://";
    return new URL(hasProtocol ? trimmed : `${protocol}${trimmed}`).href;
}

function faviconForUrl(url) {
    try {
        return `${new URL(url).origin}/favicon.ico`;
    } catch {
        return "";
    }
}

function faviconCandidatesForUrl(url, preferredFavicon = "") {
    const candidates = [];
    const addCandidate = (candidate) => {
        if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
    };

    const addCommonFaviconPaths = (baseUrl) => {
        [
            "favicon.ico",
            "./favicon.ico",
            "./favicon.png",
            "/favicon.ico",
            "/favicon.png",
            "/favicon.svg",
            "/favicon-32x32.png",
            "/favicon-16x16.png",
            "/apple-touch-icon.png",
            "/apple-touch-icon-precomposed.png",
            "/static/favicon.ico",
            "/static/favicon.png",
            "/static/icons/favicon.ico",
            "/assets/favicon.ico",
            "/assets/favicon.png",
            "/assets/ico/favicon.png",
            "/images/favicon.png"
        ].forEach((path) => {
            try {
                addCandidate(new URL(path, baseUrl).href);
            } catch {
                // Ignore malformed favicon candidate URLs.
            }
        });
    };

    try {
        const parsed = new URL(url);
        const directoryHref = parsed.href.endsWith("/") ? parsed.href : `${parsed.href}/`;
        addCandidate(preferredFavicon);
        addCommonFaviconPaths(parsed.href);
        addCommonFaviconPaths(directoryHref);

        if (isLocalAddressHost(parsed.hostname)) {
            const httpUrl = new URL(directoryHref);
            httpUrl.protocol = "http:";
            addCommonFaviconPaths(httpUrl.href);

            const httpsUrl = new URL(directoryHref);
            httpsUrl.protocol = "https:";
            addCommonFaviconPaths(httpsUrl.href);
        }
    } catch {
        addCandidate(preferredFavicon);
    }

    return candidates;
}

function pruneClickHistory(block) {
    const cutoff = Date.now() - CLICK_HISTORY_WINDOW_MS;
    const pruned = {};

    Object.entries(block.clickHistory || {}).forEach(([buttonId, timestamps]) => {
        if (!Array.isArray(timestamps)) return;
        const recent = timestamps.filter((timestamp) => Number(timestamp) >= cutoff);
        if (recent.length) pruned[buttonId] = recent;
    });

    block.clickHistory = pruned;
    return pruned;
}

function recordButtonClick(blockId, buttonId) {
    const blocks = getBlocks().map((block) => {
        if (block.id !== blockId) return block;

        const history = pruneClickHistory(block);
        history[buttonId] = [...(history[buttonId] || []), Date.now()];
        return { ...block, clickHistory: history };
    });
    saveBlocks(blocks);
}

function getRecentClickCount(buttonId, history) {
    return Array.isArray(history[buttonId]) ? history[buttonId].length : 0;
}

function getLastUsedTime(buttonId, history) {
    const timestamps = history[buttonId];
    return Array.isArray(timestamps) && timestamps.length ? Math.max(...timestamps) : 0;
}

function sortButtons(block) {
    const history = pruneClickHistory(block);
    const sorted = [...block.buttons].sort((first, second) => {
        let result;

        if (block.sortMode === "name") {
            result = first.text.localeCompare(second.text, undefined, { sensitivity: "base" });
        } else if (block.sortMode === "recent") {
            result = getLastUsedTime(first.id, history) - getLastUsedTime(second.id, history);
        } else if (block.sortMode === "frequent") {
            result = getRecentClickCount(first.id, history) - getRecentClickCount(second.id, history);
        } else {
            result = Number(first.addedAt || 0) - Number(second.addedAt || 0);
        }

        if (result === 0) {
            result = first.text.localeCompare(second.text, undefined, { sensitivity: "base" });
        }

        return block.sortDescending ? -result : result;
    });

    return sorted;
}

function createIconButton(action, label, icon) {
    const button = document.createElement("button");
    button.className = `block-control block-${action}`;
    button.type = "button";
    button.dataset.action = action;
    button.setAttribute("aria-label", label);
    button.title = label;

    if (icon) {
        const image = document.createElement("img");
        image.src = icon;
        image.alt = "";
        image.setAttribute("aria-hidden", "true");
        button.append(image);
    } else {
        const span = document.createElement("span");
        span.setAttribute("aria-hidden", "true");
        span.textContent = "+";
        button.append(span);
    }

    return button;
}

function createSortMenu(block) {
    const menu = document.createElement("div");
    menu.id = `sort-menu-${block.id}`;
    menu.className = "sort-menu";
    menu.hidden = true;

    sortModes.forEach((mode) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.sortMode = mode;
        button.classList.toggle("is-active", block.sortMode === mode);
        button.textContent = sortModeLabels[mode];
        menu.append(button);
    });

    const label = document.createElement("label");
    label.className = "sort-direction";
    label.htmlFor = `sort-descending-${block.id}`;

    const input = document.createElement("input");
    input.id = `sort-descending-${block.id}`;
    input.type = "checkbox";
    input.checked = Boolean(block.sortDescending);
    input.dataset.action = "sort-direction";

    const text = document.createElement("span");
    text.textContent = "Descending";

    label.append(input, text);
    menu.append(label);
    return menu;
}

function createButtonAction(className, label, icon, action, buttonId) {
    const button = document.createElement("button");
    button.className = `button-card-action ${className}`;
    button.type = "button";
    button.dataset.action = action;
    button.dataset.buttonId = buttonId;
    button.setAttribute("aria-label", label);
    button.title = label;

    const image = document.createElement("img");
    image.src = icon;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    button.append(image);
    return button;
}

function createButtonCard(block, button) {
    const card = document.createElement("div");
    card.className = "button-card";

    const link = document.createElement("a");
    link.className = "grid-button";
    link.href = button.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.addEventListener("click", () => recordButtonClick(block.id, button.id));

    const icon = document.createElement("img");
    const faviconCandidates = faviconCandidatesForUrl(button.url, button.favicon);
    let faviconCandidateIndex = 0;
    let faviconTimeoutId = 0;
    let fallbackShown = false;

    const clearFaviconTimeout = () => {
        if (faviconTimeoutId) window.clearTimeout(faviconTimeoutId);
        faviconTimeoutId = 0;
    };

    const showFallbackIcon = () => {
        if (fallbackShown) return;
        fallbackShown = true;
        clearFaviconTimeout();

        const fallback = document.createElement("span");
        fallback.className = "fallback-icon";
        fallback.textContent = (button.text || "?").trim().slice(0, 1).toUpperCase();
        icon.replaceWith(fallback);
    };

    const loadFaviconCandidate = () => {
        clearFaviconTimeout();

        if (faviconCandidateIndex >= faviconCandidates.length) {
            showFallbackIcon();
            return;
        }

        icon.src = faviconCandidates[faviconCandidateIndex];
        faviconTimeoutId = window.setTimeout(() => {
            faviconCandidateIndex += 1;
            loadFaviconCandidate();
        }, FAVICON_CANDIDATE_TIMEOUT_MS);
    };

    icon.alt = "";
    icon.loading = "lazy";
    icon.addEventListener("load", clearFaviconTimeout);
    icon.addEventListener("error", () => {
        faviconCandidateIndex += 1;
        loadFaviconCandidate();
    });
    loadFaviconCandidate();

    const label = document.createElement("span");
    label.textContent = button.text;
    link.append(icon, label);

    const actions = document.createElement("div");
    actions.className = "button-card-actions";
    actions.append(
        createButtonAction("edit-button", "Edit button", "iconify/meteor-icons--pencil.svg", "edit-button", button.id),
        createButtonAction("delete-button", "Delete button", "iconify/meteor-icons--trash-can.svg", "delete-button", button.id)
    );

    card.append(link, actions);
    return card;
}

function createBlockElement(block, blockIndex = 0, totalBlocks = 1) {
    const section = document.createElement("section");
    section.className = "button-block";
    section.dataset.blockId = block.id;
    section.classList.toggle("is-editing", editingBlockId === block.id);
    section.classList.toggle("is-collapsed", Boolean(block.collapsed));
    section.setAttribute("aria-labelledby", `button-block-title-${block.id}`);
    section.draggable = isReorderMode;

    const titleBar = document.createElement("div");
    titleBar.className = "block-title-bar";

    if (isReorderMode) {
        const reorderHint = createIconButton("reorder-handle", "Drag Button Block", "iconify/meteor-icons--grip-dots-vertical.svg");
        const moveUpButton = createIconButton("move-up", "Move Button Block Up", "iconify/meteor-icons--angle-up.svg");
        const moveDownButton = createIconButton("move-down", "Move Button Block Down", "iconify/meteor-icons--angle-down.svg");
        reorderHint.tabIndex = -1;
        moveUpButton.disabled = blockIndex === 0;
        moveDownButton.disabled = blockIndex === totalBlocks - 1;
        titleBar.append(reorderHint, moveUpButton, moveDownButton);
    }

    if (editingBlockId === block.id) {
        const deleteBlockButton = createIconButton("delete-block", "Delete Button Block", "iconify/meteor-icons--trash-can.svg");
        const input = document.createElement("input");
        input.id = `button-block-title-${block.id}`;
        input.className = "block-title-input";
        input.type = "text";
        input.maxLength = MAX_TITLE_LENGTH;
        input.value = block.title || DEFAULT_BLOCK_TITLE;
        input.setAttribute("aria-label", "Button Block title");

        const editControls = document.createElement("div");
        editControls.className = "block-edit-controls";
        editControls.setAttribute("aria-label", `${block.title || DEFAULT_BLOCK_TITLE} edit controls`);
        editControls.append(
            createIconButton("add", "Add button", "iconify/meteor-icons--plus.svg"),
            createIconButton("sort", `Sort: ${sortModeLabels[block.sortMode]}`, "iconify/meteor-icons--bars-sort.svg"),
            createSortMenu(block),
            createIconButton("view", `View: ${viewModeLabels[block.viewMode]}`, "iconify/meteor-icons--objects-column.svg")
        );

        const counter = createCharacterCounter(input);
        titleBar.append(deleteBlockButton, input, counter, editControls);
    } else {
        const title = document.createElement("h2");
        title.id = `button-block-title-${block.id}`;
        title.className = "block-title";
        title.textContent = block.title || DEFAULT_BLOCK_TITLE;
        titleBar.append(title);
    }

    const controls = document.createElement("div");
    controls.className = "block-controls";
    controls.setAttribute("aria-label", `${block.title || DEFAULT_BLOCK_TITLE} controls`);
    controls.append(
        createIconButton("edit", "Edit Button Block", "iconify/meteor-icons--pencil.svg"),
        createIconButton("commit", "Commit Button Block changes", "iconify/meteor-icons--check.svg"),
        createIconButton("revert", "Revert Button Block changes", "iconify/meteor-icons--xmark.svg"),
        createIconButton("collapse", block.collapsed ? "Expand Button Block" : "Collapse Button Block", block.collapsed ? "iconify/meteor-icons--angle-down.svg" : "iconify/meteor-icons--angle-up.svg")
    );
    titleBar.append(controls);

    const grid = document.createElement("div");
    grid.className = `button-grid view-${block.viewMode}`;
    grid.setAttribute("aria-label", `${block.title || DEFAULT_BLOCK_TITLE} buttons`);
    sortButtons(block).forEach((button) => grid.append(createButtonCard(block, button)));

    section.append(titleBar, grid);
    return section;
}

function renderBlocks() {
    if (!buttonBlocks) return;

    buttonBlocks.replaceChildren();
    const blocks = getBlocks();
    blocks.forEach((block, index) => buttonBlocks.append(createBlockElement(block, index, blocks.length)));

    if (editingBlockId) {
        const input = buttonBlocks.querySelector(`[data-block-id="${CSS.escape(editingBlockId)}"] .block-title-input`);
        input?.focus();
        input?.select();
    }
}


function applyReorderModeState() {
    document.body.classList.toggle("is-reordering-blocks", isReorderMode);
    buttonBlocks?.classList.toggle("is-reordering", isReorderMode);
    reorderBlocksButton?.classList.toggle("is-active", isReorderMode);
    reorderBlocksButton?.setAttribute("aria-pressed", String(isReorderMode));
    reorderBlocksButton?.setAttribute("aria-label", isReorderMode ? "Finish rearranging button blocks" : "Rearrange button blocks");
    if (reorderBlocksButton) reorderBlocksButton.title = isReorderMode ? "Finish rearranging" : "Rearrange button blocks";
}

function toggleReorderMode() {
    if (!isReorderMode) reorderSnapshot = JSON.stringify(getBlocks());
    isReorderMode = !isReorderMode;
    if (!isReorderMode) reorderSnapshot = "";
    draggedBlockId = "";
    editingBlockId = "";
    applyReorderModeState();
    renderBlocks();
}

function moveBlockRelative(draggedId, targetId, position = "before") {
    if (!draggedId || !targetId || draggedId === targetId) return;

    const blocks = getBlocks();
    const draggedIndex = blocks.findIndex((block) => block.id === draggedId);
    const targetIndex = blocks.findIndex((block) => block.id === targetId);
    if (draggedIndex < 0 || targetIndex < 0) return;

    const [draggedBlock] = blocks.splice(draggedIndex, 1);
    const adjustedTargetIndex = blocks.findIndex((block) => block.id === targetId);
    const insertIndex = position === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
    blocks.splice(insertIndex, 0, draggedBlock);
    saveBlocks(blocks);
    renderBlocks();
}

function moveBlockByStep(blockId, direction) {
    const blocks = getBlocks();
    const index = blocks.findIndex((block) => block.id === blockId);
    if (index < 0) return;

    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= blocks.length) return;

    const [block] = blocks.splice(index, 1);
    blocks.splice(nextIndex, 0, block);
    saveBlocks(blocks);
    renderBlocks();
}
function addBlankBlock() {
    const blocks = getBlocks();
    if (blocks.length >= MAX_BLOCKS) {
        alert(`You can create up to ${MAX_BLOCKS} button blocks.`);
        return;
    }

    saveBlocks([...blocks, createBlock()]);
    renderBlocks();
}

function startBlockEditMode(blockId) {
    const block = getBlocks().find((candidate) => candidate.id === blockId);
    if (!block) return;

    editingBlockId = blockId;
    blockEditSnapshot = block.title || DEFAULT_BLOCK_TITLE;
    renderBlocks();
}

function commitBlockEditMode(blockId) {
    const input = buttonBlocks?.querySelector(`[data-block-id="${CSS.escape(blockId)}"] .block-title-input`);
    const nextTitle = trimToLength(input?.value, MAX_TITLE_LENGTH) || DEFAULT_BLOCK_TITLE;
    editingBlockId = "";
    updateBlock(blockId, (block) => ({ ...block, title: nextTitle }));
}

function revertBlockEditMode(blockId) {
    editingBlockId = "";
    updateBlock(blockId, (block) => ({ ...block, title: blockEditSnapshot || block.title || DEFAULT_BLOCK_TITLE }));
}

function saveBlockCollapsedState(blockId, collapsed, titleOverride = null) {
    const blocks = getBlocks().map((block) => {
        if (block.id !== blockId) return block;
        return {
            ...block,
            title: titleOverride ?? block.title,
            collapsed
        };
    });

    saveBlocks(blocks);
}

function updateCollapseControl(section, collapsed) {
    const collapseButton = section?.querySelector?.('.block-collapse');
    const collapseIcon = collapseButton?.querySelector?.('img');
    const label = collapsed ? 'Expand Button Block' : 'Collapse Button Block';

    collapseButton?.setAttribute('aria-label', label);
    if (collapseButton) collapseButton.title = label;
    if (collapseIcon) collapseIcon.src = collapsed ? 'iconify/meteor-icons--angle-down.svg' : 'iconify/meteor-icons--angle-up.svg';
}

function animateBlockCollapse(blockId, collapsed) {
    const section = buttonBlocks?.querySelector(`[data-block-id="${CSS.escape(blockId)}"]`);
    const grid = section?.querySelector?.('.button-grid');
    if (!section || !grid) {
        renderBlocks();
        return;
    }

    updateCollapseControl(section, collapsed);

    const clearInlineHeight = () => {
        grid.style.maxHeight = '';
    };

    grid.addEventListener('transitionend', clearInlineHeight, { once: true });
    setTimeout(clearInlineHeight, 320);

    if (collapsed) {
        grid.style.maxHeight = `${grid.scrollHeight}px`;
        grid.offsetHeight;
        section.classList.add('is-collapsed');
        grid.style.maxHeight = '0px';
    } else {
        section.classList.remove('is-collapsed');
        grid.style.maxHeight = '0px';
        grid.offsetHeight;
        grid.style.maxHeight = `${grid.scrollHeight}px`;
    }
}

function toggleCollapsedState(blockId) {
    const block = getBlocks().find((candidate) => candidate.id === blockId);
    if (!block) return;

    const collapsed = !block.collapsed;
    const shouldExitEditMode = editingBlockId === blockId;
    const restoredTitle = shouldExitEditMode ? blockEditSnapshot || block.title || DEFAULT_BLOCK_TITLE : null;

    if (shouldExitEditMode) {
        editingBlockId = '';
        blockEditSnapshot = '';
        saveBlockCollapsedState(blockId, false, restoredTitle);
        renderBlocks();
        requestAnimationFrame(() => {
            saveBlockCollapsedState(blockId, collapsed, restoredTitle);
            animateBlockCollapse(blockId, collapsed);
        });
        return;
    }

    saveBlockCollapsedState(blockId, collapsed);
    animateBlockCollapse(blockId, collapsed);
}

function cycleViewMode(blockId) {
    updateBlock(blockId, (block) => {
        const currentMode = viewModes.includes(block.viewMode) ? block.viewMode : "tiles";
        const nextMode = viewModes[(viewModes.indexOf(currentMode) + 1) % viewModes.length];
        return { ...block, viewMode: nextMode };
    });
}

function toggleSortMenu(blockId) {
    buttonBlocks?.querySelectorAll(".sort-menu").forEach((menu) => {
        const section = menu.closest(".button-block");
        menu.hidden = section?.dataset.blockId === blockId ? !menu.hidden : true;
    });
}

function openAddButtonDialog(blockId) {
    if (!addButtonDialog || !newButtonText || !newButtonUrl) return;

    const block = getBlocks().find((candidate) => candidate.id === blockId);
    if (!block || block.buttons.length >= MAX_BUTTONS_PER_BLOCK) {
        alert(`Each block can contain up to ${MAX_BUTTONS_PER_BLOCK} buttons.`);
        return;
    }

    activeButtonBlockId = blockId;
    addButtonForm?.reset();
    newButtonUrl.setCustomValidity("");
    addButtonDialog.showModal();
    newButtonText.focus();
}

function addButtonFromDialog() {
    let url;

    try {
        url = normalizeUrl(newButtonUrl.value);
    } catch {
        newButtonUrl.setCustomValidity("Enter a valid URL or domain.");
        newButtonUrl.reportValidity();
        return;
    }

    const text = trimToLength(newButtonText.value, MAX_BUTTON_TEXT_LENGTH);
    if (!text || !activeButtonBlockId) return;

    const activeBlock = getBlocks().find((block) => block.id === activeButtonBlockId);
    if (!activeBlock || activeBlock.buttons.length >= MAX_BUTTONS_PER_BLOCK) {
        alert(`Each block can contain up to ${MAX_BUTTONS_PER_BLOCK} buttons.`);
        return;
    }

    newButtonUrl.setCustomValidity("");
    updateBlock(activeButtonBlockId, (block) => ({
        ...block,
        buttons: [
            ...block.buttons,
            {
                id: createId(),
                text,
                url,
                favicon: faviconForUrl(url),
                addedAt: Date.now()
            }
        ]
    }));
    addButtonDialog.close();
}

function openEditButtonDialog(blockId, buttonId) {
    const block = getBlocks().find((candidate) => candidate.id === blockId);
    const button = block?.buttons.find((candidate) => candidate.id === buttonId);
    if (!button || !editButtonDialog) return;

    activeButtonBlockId = blockId;
    editButtonId.value = button.id;
    editButtonText.value = button.text;
    editButtonUrl.value = button.url;
    editButtonUrl.setCustomValidity("");
    editButtonDialog.showModal();
    editButtonText.focus();
    editButtonText.select();
}

function saveEditedButton() {
    let url;

    try {
        url = normalizeUrl(editButtonUrl.value);
    } catch {
        editButtonUrl.setCustomValidity("Enter a valid URL or domain.");
        editButtonUrl.reportValidity();
        return;
    }

    const text = trimToLength(editButtonText.value, MAX_BUTTON_TEXT_LENGTH);
    if (!text || !activeButtonBlockId) return;

    editButtonUrl.setCustomValidity("");
    updateBlock(activeButtonBlockId, (block) => ({
        ...block,
        buttons: block.buttons.map((button) => button.id === editButtonId.value ? { ...button, text, url, favicon: faviconForUrl(url) } : button)
    }));
    editButtonDialog.close();
}

function openDeleteButtonDialog(blockId, buttonId) {
    const block = getBlocks().find((candidate) => candidate.id === blockId);
    const button = block?.buttons.find((candidate) => candidate.id === buttonId);
    if (!button || !deleteButtonDialog) return;

    pendingDeleteMode = "button";
    pendingDeleteBlockId = blockId;
    pendingDeleteButtonId = buttonId;
    deleteButtonMessage.textContent = `Delete "${button.text}"? This cannot be undone.`;
    deleteButtonDialog.showModal();
}

function openDeleteBlockDialog(blockId) {
    const block = getBlocks().find((candidate) => candidate.id === blockId);
    if (!block || !deleteButtonDialog) return;

    pendingDeleteMode = "block";
    pendingDeleteBlockId = blockId;
    pendingDeleteButtonId = "";
    deleteButtonMessage.textContent = `Delete the "${block.title || DEFAULT_BLOCK_TITLE}" button block and all buttons inside it? This cannot be undone.`;
    deleteButtonDialog.showModal();
}

function deletePendingButton() {
    if (!pendingDeleteBlockId) return;

    if (pendingDeleteMode === "block") {
        saveBlocks(getBlocks().filter((block) => block.id !== pendingDeleteBlockId));
        if (editingBlockId === pendingDeleteBlockId) editingBlockId = "";
        renderBlocks();
    } else if (pendingDeleteButtonId) {
        updateBlock(pendingDeleteBlockId, (block) => ({
            ...block,
            buttons: block.buttons.filter((button) => button.id !== pendingDeleteButtonId)
        }));
    }

    pendingDeleteMode = "button";
    pendingDeleteBlockId = "";
    pendingDeleteButtonId = "";
    deleteButtonDialog.close();
}


buttonBlocks?.addEventListener("dragstart", (event) => {
    if (!isReorderMode) return;

    const section = event.target.closest?.(".button-block");
    draggedBlockId = section?.dataset.blockId || "";
    if (!draggedBlockId) return;

    section.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedBlockId);
});

buttonBlocks?.addEventListener("dragover", (event) => {
    if (!isReorderMode || !draggedBlockId) return;

    const section = event.target.closest?.(".button-block");
    if (!section || section.dataset.blockId === draggedBlockId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = section.getBoundingClientRect();
    const position = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
    section.dataset.dropPosition = position;
    buttonBlocks.querySelectorAll(".button-block.is-drop-target").forEach((block) => block.classList.remove("is-drop-target", "is-drop-after"));
    section.classList.add("is-drop-target");
    section.classList.toggle("is-drop-after", position === "after");
});

buttonBlocks?.addEventListener("dragleave", (event) => {
    if (!isReorderMode) return;
    const section = event.target.closest?.(".button-block");
    if (section && !section.contains(event.relatedTarget)) {
        section.classList.remove("is-drop-target", "is-drop-after");
        delete section.dataset.dropPosition;
    }
});

buttonBlocks?.addEventListener("drop", (event) => {
    if (!isReorderMode || !draggedBlockId) return;

    const section = event.target.closest?.(".button-block");
    if (!section) return;

    event.preventDefault();
    moveBlockRelative(draggedBlockId, section.dataset.blockId, section.dataset.dropPosition || "before");
});

buttonBlocks?.addEventListener("dragend", () => {
    draggedBlockId = "";
    buttonBlocks?.querySelectorAll(".button-block.is-dragging, .button-block.is-drop-target").forEach((block) => {
        block.classList.remove("is-dragging", "is-drop-target", "is-drop-after");
        delete block.dataset.dropPosition;
    });
});
buttonBlocks?.addEventListener("click", (event) => {
    const target = event.target;
    const section = target.closest?.(".button-block");
    const blockId = section?.dataset.blockId;
    if (!blockId) return;

    const sortOption = target.closest("[data-sort-mode]");
    if (sortOption) {
        updateBlock(blockId, (block) => ({ ...block, sortMode: sortOption.dataset.sortMode }));
        return;
    }

    const control = target.closest("[data-action]");
    if (!control) return;

    if (control.dataset.action === "add") openAddButtonDialog(blockId);
    if (control.dataset.action === "view") cycleViewMode(blockId);
    if (control.dataset.action === "sort") toggleSortMenu(blockId);
    if (control.dataset.action === "edit") startBlockEditMode(blockId);
    if (control.dataset.action === "commit") commitBlockEditMode(blockId);
    if (control.dataset.action === "revert") revertBlockEditMode(blockId);
    if (control.dataset.action === "collapse") toggleCollapsedState(blockId);
    if (control.dataset.action === "move-up") moveBlockByStep(blockId, -1);
    if (control.dataset.action === "move-down") moveBlockByStep(blockId, 1);
    if (control.dataset.action === "delete-block") openDeleteBlockDialog(blockId);
    if (control.dataset.action === "edit-button") openEditButtonDialog(blockId, control.dataset.buttonId);
    if (control.dataset.action === "delete-button") openDeleteButtonDialog(blockId, control.dataset.buttonId);
});

buttonBlocks?.addEventListener("change", (event) => {
    const target = event.target;
    if (target?.dataset?.action !== "sort-direction") return;

    const section = target.closest(".button-block");
    const blockId = section?.dataset.blockId;
    if (!blockId) return;

    updateBlock(blockId, (block) => ({ ...block, sortDescending: target.checked }));
});

function clearPendingDeleteState() {
    pendingDeleteBlockId = "";
    pendingDeleteButtonId = "";
    pendingDeleteMode = "button";
}

function cancelReorderMode() {
    if (!isReorderMode) return false;

    if (reorderSnapshot) {
        try {
            const originalBlocks = JSON.parse(reorderSnapshot);
            if (Array.isArray(originalBlocks)) saveBlocks(originalBlocks);
        } catch {
            // Keep the current order if the snapshot cannot be restored.
        }
    }

    isReorderMode = false;
    reorderSnapshot = "";
    draggedBlockId = "";
    applyReorderModeState();
    renderBlocks();
    return true;
}

function exitWithoutCommitting() {
    if (deleteButtonDialog?.open) {
        deleteButtonDialog.close();
        clearPendingDeleteState();
        return true;
    }

    if (editButtonDialog?.open) {
        editButtonUrl?.setCustomValidity("");
        editButtonDialog.close();
        activeButtonBlockId = "";
        return true;
    }

    if (addButtonDialog?.open) {
        newButtonUrl?.setCustomValidity("");
        addButtonDialog.close();
        activeButtonBlockId = "";
        return true;
    }

    if (settingsDialog?.open) {
        applySettings();
        settingsDialog.close();
        return true;
    }

    if (editingBlockId) {
        revertBlockEditMode(editingBlockId);
        return true;
    }

    return cancelReorderMode();
}

buttonBlocks?.addEventListener("keydown", (event) => {
    if (!event.target.classList?.contains("block-title-input")) return;
    if (event.key !== "Enter") return;

    event.preventDefault();
    const blockId = event.target.closest(".button-block")?.dataset.blockId;
    if (blockId) commitBlockEditMode(blockId);
});

document.addEventListener("input", (event) => {
    if (event.target?.matches?.("input[maxlength]")) updateCharacterCounter(event.target);
});

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!exitWithoutCommitting()) return;

    event.preventDefault();
    event.stopPropagation();
}, true);

document.addEventListener("click", (event) => {
    if (event.target.closest?.(".block-sort") || event.target.closest?.(".sort-menu")) return;
    buttonBlocks?.querySelectorAll(".sort-menu").forEach((menu) => {
        menu.hidden = true;
    });
});

reorderBlocksButton?.addEventListener("click", toggleReorderMode);
addBlockButton?.addEventListener("click", addBlankBlock);
addButtonForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    addButtonFromDialog();
});
newButtonUrl?.addEventListener("input", () => newButtonUrl.setCustomValidity(""));
closeAddButtonDialog?.addEventListener("click", () => addButtonDialog.close());
cancelAddButton?.addEventListener("click", () => addButtonDialog.close());
addButtonDialog?.addEventListener("click", (event) => {
    if (event.target === addButtonDialog) addButtonDialog.close();
});

editButtonForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    saveEditedButton();
});
editButtonUrl?.addEventListener("input", () => editButtonUrl.setCustomValidity(""));
closeEditButtonDialog?.addEventListener("click", () => editButtonDialog.close());
cancelEditButton?.addEventListener("click", () => editButtonDialog.close());
editButtonDialog?.addEventListener("click", (event) => {
    if (event.target === editButtonDialog) editButtonDialog.close();
});

deleteButtonForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    deletePendingButton();
});
closeDeleteButtonDialog?.addEventListener("click", () => deleteButtonDialog.close());
cancelDeleteButton?.addEventListener("click", () => deleteButtonDialog.close());
deleteButtonDialog?.addEventListener("click", (event) => {
    if (event.target === deleteButtonDialog) deleteButtonDialog.close();
});

async function initializeApp() {
    await loadUserConfiguration();
    applySettings();
    setInterval(updateLocalTime, 1000);
    applyReorderModeState();
    renderBlocks();
}

initializeApp();






