const { Plugin, PluginSettingTab, Setting, Notice, Modal } = require('obsidian');

/**
 * Plugin constants
 */
const CONSTANTS = {
    STYLE_ID: 'tag-badges-styles',
    ICON_SIZE: 14,
    BADGE_BORDER_RADIUS: 12,
    PREVIEW_UPDATE_DEBOUNCE: 100,
    DEFAULT_ICON: 'hash',
    CSS_CLASSES: {
        CONTAINER: 'tag-badges-container',
        BADGE: 'tag-badge',
        BADGE_ICON: 'tag-badge-icon',
        BADGE_TEXT: 'tag-badge-text',
        NO_TAGS: 'tag-badges-no-tags',
        MODAL_ROW: 'tag-config-modal-row',
        MODAL_LABEL: 'tag-config-modal-label',
        MODAL_INPUT: 'tag-config-modal-input',
        MODAL_PREVIEW: 'tag-config-modal-preview',
        TAG_LIST_ITEM: 'tag-list-item',
        TAG_LIST_NAME: 'tag-list-item-name',
        TAG_LIST_BUTTONS: 'tag-list-item-buttons',
        CONFIG_SEPARATOR: 'tag-config-separator',
        INHERITANCE_INFO: 'tag-inheritance-info'
    }
};

/**
 * Default plugin settings configuration
 */
const DEFAULT_SETTINGS = {
    tagConfigs: {},
    defaultConfig: {
        icon: CONSTANTS.DEFAULT_ICON,
        textColor: '#ffffff',
        backgroundColor: '#6b7280',
        alias: ''
    }
};

/**
 * Configuration manager to handle tag settings operations with hierarchical inheritance
 */
class TagConfigManager {
    /**
     * @param {TagBadgesPlugin} plugin - The main plugin instance
     */
    constructor(plugin) {
        this.plugin = plugin;
    }

    /**
     * Get configuration for a specific tag, with hierarchical inheritance
     * @param {string} tagName - The tag name to get configuration for
     * @returns {object} The tag configuration
     */
    getTagConfig(tagName) {
        if (!tagName) return this.plugin.settings.defaultConfig;

        // Check for exact match first
        if (this.plugin.settings.tagConfigs[tagName]) {
            return this.plugin.settings.tagConfigs[tagName];
        }

        // Look for most specific parent tag configuration
        const parentConfig = this._findParentConfig(tagName);
        return parentConfig || this.plugin.settings.defaultConfig;
    }

    /**
     * Find the most specific parent configuration for a tag
     * @private
     * @param {string} tagName - The tag name to find parent for
     * @returns {object|null} Parent configuration or null if none found
     */
    _findParentConfig(tagName) {
        const configuredTags = Object.keys(this.plugin.settings.tagConfigs);
        
        // Find all parent tags and sort by specificity (length descending)
        const parentTags = configuredTags
            .filter(configTag => tagName.startsWith(configTag + '/'))
            .sort((a, b) => b.length - a.length);

        return parentTags.length > 0 ? this.plugin.settings.tagConfigs[parentTags[0]] : null;
    }

    /**
     * Save configuration for a specific tag
     * @param {string} tagName - The tag name
     * @param {object} config - The configuration object
     * @throws {Error} When save operation fails
     */
    async saveTagConfig(tagName, config) {
        if (!tagName || !config) {
            throw new Error('Tag name and config are required');
        }

        this.plugin.settings.tagConfigs[tagName] = { ...config };
        await this.plugin.saveSettings();
    }

    /**
     * Delete configuration for a specific tag
     * @param {string} tagName - The tag name to delete
     * @throws {Error} When delete operation fails
     */
    async deleteTagConfig(tagName) {
        if (!tagName || !this.plugin.settings.tagConfigs[tagName]) {
            throw new Error(`Configuration for tag "${tagName}" not found`);
        }

        delete this.plugin.settings.tagConfigs[tagName];
        await this.plugin.saveSettings();
    }

    /**
     * Get all configured tag names sorted alphabetically
     * @returns {string[]} Sorted array of tag names
     */
    getConfiguredTagNames() {
        return Object.keys(this.plugin.settings.tagConfigs).sort();
    }

    /**
     * Check if a tag inherits from a parent configuration
     * @param {string} tagName - The tag to check
     * @returns {string|null} The parent tag name if inherited, null if exact match or default
     */
    getInheritedParent(tagName) {
        if (!tagName || this.plugin.settings.tagConfigs[tagName]) {
            return null; // Exact match or invalid input
        }

        const configuredTags = Object.keys(this.plugin.settings.tagConfigs);
        const parentTags = configuredTags
            .filter(configTag => tagName.startsWith(configTag + '/'))
            .sort((a, b) => b.length - a.length);

        return parentTags.length > 0 ? parentTags[0] : null;
    }

    /**
     * Check if configuration matches default settings
     * @param {object} config - Configuration to check
     * @returns {boolean} True if matches default
     */
    isDefaultConfig(config) {
        const defaults = this.plugin.settings.defaultConfig;
        return config.icon === defaults.icon &&
               config.textColor === defaults.textColor &&
               config.backgroundColor === defaults.backgroundColor &&
               !config.alias?.trim();
    }
}

/**
 * Icon renderer utility for handling Lucide icons
 */
class IconRenderer {
    /**
     * Render a Lucide icon in the provided element
     * @param {HTMLElement} element - The element to render the icon in
     * @param {string} iconName - The Lucide icon name
     */
    static renderIcon(element, iconName) {
        if (!iconName) {return;}
        try {
            const { setIcon } = require('obsidian');
            setIcon(element, iconName || null);
        } catch (error) {
            console.warn('Failed to render icon:', iconName, error);
            element.textContent = '#';
        }
    }
}

/**
 * Badge renderer for creating and styling tag badges
 */
class BadgeRenderer {
    /**
     * @param {TagBadgesPlugin} plugin - The main plugin instance
     * @param {TagConfigManager} configManager - The configuration manager
     */
    constructor(plugin, configManager) {
        this.plugin = plugin;
        this.configManager = configManager;
    }

    /**
     * Create a styled badge element for a tag
     * @param {HTMLElement} container - Container to append the badge to
     * @param {string} tagName - The tag name
     * @returns {HTMLElement} The created badge element
     */
    createBadge(container, tagName) {
        const config = this.configManager.getTagConfig(tagName);
        const inheritedParent = this.configManager.getInheritedParent(tagName);
        
        const badge = this._createBadgeElement(container, config, tagName, inheritedParent);
        this._addBadgeEventListeners(badge, tagName);

        return badge;
    }

    /**
     * Create the badge DOM element with styling
     * @private
     * @param {HTMLElement} container - Container element
     * @param {object} config - Badge configuration
     * @param {string} tagName - Tag name
     * @param {string|null} inheritedParent - Parent tag if inherited
     * @returns {HTMLElement} Badge element
     */
    _createBadgeElement(container, config, tagName, inheritedParent) {
        const badge = container.createDiv({ cls: CONSTANTS.CSS_CLASSES.BADGE });
        
        // Apply styling
        badge.style.backgroundColor = config.backgroundColor;
        badge.style.color = config.textColor;
        
        // Set tooltip and aria label
        const tooltipText = inheritedParent 
            ? `Inherits style from #${inheritedParent}`
            : `#${tagName}`;
        badge.title = tooltipText;
        badge.setAttribute('aria-label', tooltipText);
        badge.setAttribute('role', 'button');
        badge.setAttribute('tabindex', '0');

        // Add icon
        let iconEl;
        if (config.icon) {
            iconEl = badge.createSpan({ cls: CONSTANTS.CSS_CLASSES.BADGE_ICON });
            IconRenderer.renderIcon(iconEl, config.icon);
        }

        // Add text
        const displayText = config.alias || tagName;
        badge.createSpan({ 
            text: displayText, 
            cls: CONSTANTS.CSS_CLASSES.BADGE_TEXT 
        });

        return badge;
    }

    /**
     * Add event listeners to badge element
     * @private
     * @param {HTMLElement} badge - Badge element
     * @param {string} tagName - Tag name
     */
    _addBadgeEventListeners(badge, tagName) {
        const openModal = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.plugin.showTagConfigModal(tagName);
        };

        badge.addEventListener('click', openModal);
        badge.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                openModal(e);
            }
        });
    }
}

/**
 * Style manager for injecting and managing CSS styles
 */
class StyleManager {
    static STYLE_ID = CONSTANTS.STYLE_ID;

    /**
     * Inject plugin styles into the document
     */
    static injectStyles() {
        if (document.getElementById(this.STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = this.STYLE_ID;
        style.textContent = this._getStyleContent();
        document.head.appendChild(style);
    }

    /**
     * Remove plugin styles from the document
     */
    static removeStyles() {
        const styleEl = document.getElementById(this.STYLE_ID);
        if (styleEl) styleEl.remove();
    }

    /**
     * Get the CSS content for the plugin
     * @private
     * @returns {string} CSS content
     */
    static _getStyleContent() {
        return `
            .${CONSTANTS.CSS_CLASSES.CONTAINER} {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin: 8px 0;
            }
            
            .${CONSTANTS.CSS_CLASSES.BADGE} {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                border-radius: ${CONSTANTS.BADGE_BORDER_RADIUS}px;
                font-size: 0.8em;
                font-weight: 500;
                cursor: pointer;
                transition: opacity 0.2s ease, transform 0.1s ease;
                border: none;
                outline: none;
            }
            
            .${CONSTANTS.CSS_CLASSES.BADGE}:hover,
            .${CONSTANTS.CSS_CLASSES.BADGE}:focus {
                opacity: 0.8;
                transform: translateY(-1px);
            }
            
            .${CONSTANTS.CSS_CLASSES.BADGE}:focus-visible {
                box-shadow: 0 0 0 2px var(--accent-color);
            }
            
            .${CONSTANTS.CSS_CLASSES.BADGE_ICON} {
                display: inline-flex;
                align-items: center;
                width: ${CONSTANTS.ICON_SIZE}px;
                height: ${CONSTANTS.ICON_SIZE}px;
                flex-shrink: 0;
            }
            
            .${CONSTANTS.CSS_CLASSES.BADGE_ICON} svg {
                width: ${CONSTANTS.ICON_SIZE}px;
                height: ${CONSTANTS.ICON_SIZE}px;
            }
            
            .${CONSTANTS.CSS_CLASSES.BADGE_TEXT} {
                line-height: 1;
                white-space: nowrap;
            }
            
            .${CONSTANTS.CSS_CLASSES.NO_TAGS} {
                color: var(--text-muted);
                font-style: italic;
                padding: 8px 0;
            }
            
            .${CONSTANTS.CSS_CLASSES.CONFIG_SEPARATOR} {
                border-top: 1px solid var(--background-modifier-border);
                margin: 16px 0;
            }
            
            .${CONSTANTS.CSS_CLASSES.MODAL_ROW} {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 16px;
            }
            
            .${CONSTANTS.CSS_CLASSES.MODAL_LABEL} {
                font-weight: 500;
                margin-right: 12px;
                min-width: 120px;
            }
            
            .${CONSTANTS.CSS_CLASSES.MODAL_INPUT} {
                flex: 1;
                max-width: 200px;
            }
            
            .${CONSTANTS.CSS_CLASSES.MODAL_PREVIEW} {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                border-radius: ${CONSTANTS.BADGE_BORDER_RADIUS}px;
                font-size: 0.8em;
                font-weight: 500;
                margin: 16px 0;
            }
            
            .${CONSTANTS.CSS_CLASSES.MODAL_PREVIEW} .${CONSTANTS.CSS_CLASSES.BADGE_ICON} {
                width: ${CONSTANTS.ICON_SIZE}px;
                height: ${CONSTANTS.ICON_SIZE}px;
            }
            
            .${CONSTANTS.CSS_CLASSES.MODAL_PREVIEW} .${CONSTANTS.CSS_CLASSES.BADGE_ICON} svg {
                width: ${CONSTANTS.ICON_SIZE}px;
                height: ${CONSTANTS.ICON_SIZE}px;
            }
            
            .${CONSTANTS.CSS_CLASSES.TAG_LIST_ITEM} {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 12px;
                border: 1px solid var(--background-modifier-border);
                border-radius: 6px;
                margin-bottom: 8px;
                background: var(--background-secondary);
            }
            
            .${CONSTANTS.CSS_CLASSES.TAG_LIST_NAME} {
                font-weight: 500;
                color: var(--text-normal);
                flex: 1;
            }
            
            .${CONSTANTS.CSS_CLASSES.TAG_LIST_BUTTONS} {
                display: flex;
                gap: 8px;
            }

            .${CONSTANTS.CSS_CLASSES.INHERITANCE_INFO} {
                margin-bottom: 16px;
                padding: 8px 12px;
                background-color: var(--background-secondary);
                border-radius: 6px;
                font-size: 0.9em;
            }
        `;
    }
}

/**
 * Frontmatter parser for extracting tags from file metadata
 */
class FrontmatterParser {
    /**
     * Extract and normalize tags from a file's frontmatter
     * @param {object} file - The Obsidian file object
     * @param {object} metadataCache - The metadata cache
     * @returns {string[]} Array of cleaned tag names
     */
    static extractTags(file, metadataCache) {
        if (!file || !metadataCache) return [];

        try {
            const cache = metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter;

            if (!frontmatter?.tags) return [];

            return this._normalizeTags(frontmatter.tags);
        } catch (error) {
            console.error('Error extracting tags from frontmatter:', error);
            return [];
        }
    }

    /**
     * Normalize tags to array and clean them
     * @private
     * @param {string|string[]} tags - Raw tags from frontmatter
     * @returns {string[]} Normalized tag array
     */
    static _normalizeTags(tags) {
        const tagArray = Array.isArray(tags) ? tags : [tags];
        return tagArray
            .map(tag => String(tag).replace(/^#+/, '').trim())
            .filter(tag => tag.length > 0);
    }
}

/**
 * Utility class for common form operations
 */
class FormUtils {
    /**
     * Create a color picker setting
     * @param {HTMLElement} container - Container element
     * @param {string} label - Setting label
     * @param {string} description - Setting description
     * @param {string} value - Initial value
     * @param {Function} onChange - Change handler
     * @returns {HTMLElement} Input element
     */
    static createColorSetting(container, label, description, value, onChange) {
        const row = container.createDiv({ cls: CONSTANTS.CSS_CLASSES.MODAL_ROW });
        row.createDiv({ text: label, cls: CONSTANTS.CSS_CLASSES.MODAL_LABEL });
        
        const input = row.createEl('input', {
            type: 'color',
            value: value,
            cls: CONSTANTS.CSS_CLASSES.MODAL_INPUT
        });

        if (description) {
            input.title = description;
        }

        input.addEventListener('input', onChange);
        return input;
    }

    /**
     * Create a text input setting
     * @param {HTMLElement} container - Container element
     * @param {string} label - Setting label
     * @param {string} placeholder - Input placeholder
     * @param {string} value - Initial value
     * @param {Function} onChange - Change handler
     * @returns {HTMLElement} Input element
     */
    static createTextSetting(container, label, placeholder, value, onChange) {
        const row = container.createDiv({ cls: CONSTANTS.CSS_CLASSES.MODAL_ROW });
        row.createDiv({ text: label, cls: CONSTANTS.CSS_CLASSES.MODAL_LABEL });
        
        const input = row.createEl('input', {
            type: 'text',
            placeholder: placeholder,
            value: value || '',
            cls: CONSTANTS.CSS_CLASSES.MODAL_INPUT
        });

        input.addEventListener('input', onChange);
        return input;
    }

    /**
     * Validate tag name input
     * @param {string} tagName - The tag name to validate
     * @returns {object} Validation result with isValid and message
     */
    static validateTagName(tagName) {
        if (!tagName?.trim()) {
            return { isValid: false, message: 'Tag name cannot be empty' };
        }

        const cleanTagName = tagName.trim().replace(/^#+/, '');
        
        if (!cleanTagName) {
            return { isValid: false, message: 'Tag name cannot be empty' };
        }

        if (cleanTagName.includes(' ')) {
            return { isValid: false, message: 'Tag names cannot contain spaces' };
        }

        if (cleanTagName.includes('\n') || cleanTagName.includes('\t')) {
            return { isValid: false, message: 'Tag names cannot contain line breaks or tabs' };
        }

        return { isValid: true, tagName: cleanTagName };
    }

    /**
     * Debounce a function call
     * @param {Function} func - Function to debounce
     * @param {number} delay - Delay in milliseconds
     * @returns {Function} Debounced function
     */
    static debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }
}

/**
 * Configuration modal for tag settings
 */
class TagConfigModal extends Modal {
    /**
     * @param {object} app - Obsidian app instance
     * @param {TagBadgesPlugin} plugin - Plugin instance
     * @param {string} tagName - Tag name to configure
     */
    constructor(app, plugin, tagName) {
        super(app);
        this.plugin = plugin;
        this.originalTagName = tagName;
        this.tagName = tagName;
        this.configManager = plugin.configManager;
        this.config = this.configManager.getTagConfig(tagName);
        this.formInputs = {};
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        
        this._createHeader(contentEl);
        this._createInheritanceInfo(contentEl);
        
        const inputs = this._createFormInputs(contentEl);
        contentEl.createDiv({ cls: CONSTANTS.CSS_CLASSES.CONFIG_SEPARATOR });
        const preview = this._createPreviewSection(contentEl);
        
        this._setupLivePreview(inputs, preview);
        this._createActionButtons(contentEl, inputs);
        this._updatePreview(inputs, preview);
    }

    /**
     * Create modal header
     * @private
     * @param {HTMLElement} contentEl - Content element
     */
    _createHeader(contentEl) {
        const inheritedParent = this.configManager.getInheritedParent(this.tagName);
        const headerText = inheritedParent 
            ? `Configure #${this.tagName} (inherits from #${inheritedParent})`
            : `Configure #${this.tagName}`;
        
        contentEl.createEl('h5', { text: headerText });
    }

    /**
     * Create inheritance information section
     * @private
     * @param {HTMLElement} contentEl - Content element
     */
    _createInheritanceInfo(contentEl) {
        const inheritedParent = this.configManager.getInheritedParent(this.tagName);
        if (!inheritedParent) return;

        const inheritanceInfo = contentEl.createDiv({ 
            cls: CONSTANTS.CSS_CLASSES.INHERITANCE_INFO 
        });
        inheritanceInfo.innerHTML = `
            <strong>Inheritance:</strong> This tag currently inherits its style from <code>#${inheritedParent}</code>. 
            Configuring it here will override the inherited style.
        `;
    }

    /**
     * Create form input elements
     * @private
     * @param {HTMLElement} contentEl - Content element
     * @returns {object} Object containing all input elements
     */
    _createFormInputs(contentEl) {
        const inputs = {};

        // Tag name input
        inputs.tagNameInput = FormUtils.createTextSetting(
            contentEl, 'Target Tag:', 'Enter tag name', this.tagName,
            () => this._onTagNameChange(inputs)
        );

        // Style selector
        inputs.useStyleSelect = this._createStyleSelector(contentEl);

        contentEl.createDiv({ cls: CONSTANTS.CSS_CLASSES.CONFIG_SEPARATOR });

        // Icon input
        inputs.iconInput = FormUtils.createTextSetting(
            contentEl, 'Lucide Icon Name:', null, this.config.icon,
            () => {} // Will be handled by live preview
        );

        // Color inputs
        inputs.textColorInput = FormUtils.createColorSetting(
            contentEl, 'Text Color:', 'Choose badge text color', this.config.textColor,
            () => {} // Will be handled by live preview
        );

        inputs.backgroundColorInput = FormUtils.createColorSetting(
            contentEl, 'Background Color:', 'Choose badge background color', this.config.backgroundColor,
            () => {} // Will be handled by live preview
        );

        // Alias input
        inputs.aliasInput = FormUtils.createTextSetting(
            contentEl, 'Alias:', this.tagName, this.config.alias,
            () => {} // Will be handled by live preview
        );

        this.formInputs = inputs;
        return inputs;
    }

    /**
     * Handle tag name input change
     * @private
     * @param {object} inputs - Form inputs
     */
    _onTagNameChange(inputs) {
        const newTagName = inputs.tagNameInput.value.trim().replace(/^#+/, '');
        inputs.aliasInput.placeholder = newTagName || 'Enter alias';
    }

    /**
     * Create style selector dropdown
     * @private
     * @param {HTMLElement} container - Container element
     * @returns {HTMLElement} Select element
     */
    _createStyleSelector(container) {
        const availableTags = this.configManager.getConfiguredTagNames()
            .filter(tag => tag !== this.originalTagName);
        
        const row = container.createDiv({ cls: CONSTANTS.CSS_CLASSES.MODAL_ROW });
        row.createDiv({ text: 'Copy Style:', cls: CONSTANTS.CSS_CLASSES.MODAL_LABEL });
        
        const select = row.createEl('select', { 
            cls: CONSTANTS.CSS_CLASSES.MODAL_INPUT 
        });
        select.style.cursor = 'pointer';

        // Add options
        this._populateStyleSelector(select, availableTags);
        
        // Handle selection
        select.addEventListener('change', (e) => {
            e.stopPropagation();
            if (select.value) {
                this._applySelectedStyle(select.value);
                select.selectedIndex = 0; // Reset to placeholder
            }
        });

        return select;
    }

    /**
     * Populate style selector with options
     * @private
     * @param {HTMLElement} select - Select element
     * @param {string[]} availableTags - Available tag names
     */
    _populateStyleSelector(select, availableTags) {
        // Placeholder option
        const placeholderOption = select.createEl('option');
        placeholderOption.value = '';
        placeholderOption.textContent = availableTags.length > 0 
            ? 'Choose style to copy...' 
            : 'No other styles available';
        placeholderOption.disabled = true;
        placeholderOption.selected = true;

        if (availableTags.length === 0) {
            select.disabled = true;
            return;
        }

        // Default option
        const defaultOption = select.createEl('option');
        defaultOption.value = 'default';
        defaultOption.textContent = 'Default Style';

        // Tag options
        availableTags.forEach(tagName => {
            const option = select.createEl('option');
            option.value = tagName;
            option.textContent = `#${tagName}`;
        });
    }

    /**
     * Apply selected style to form inputs
     * @private
     * @param {string} selectedTag - Selected tag name or 'default'
     */
    _applySelectedStyle(selectedTag) {
        try {
            const sourceConfig = selectedTag === 'default' 
                ? this.plugin.settings.defaultConfig
                : this.plugin.settings.tagConfigs[selectedTag];

            if (!sourceConfig) {
                new Notice('Selected style not found');
                return;
            }

            // Apply configuration to inputs
            //this.formInputs.iconInput.value = sourceConfig.icon || CONSTANTS.DEFAULT_ICON;
            this.formInputs.iconInput.value = sourceConfig.icon;
            this.formInputs.textColorInput.value = sourceConfig.textColor;
            this.formInputs.backgroundColorInput.value = sourceConfig.backgroundColor;

            // Trigger input events for live preview
            Object.values(this.formInputs).forEach(input => {
                if (input.dispatchEvent) {
                    input.dispatchEvent(new Event('input'));
                }
            });

            const styleSource = selectedTag === 'default' ? 'default' : `#${selectedTag}`;
            new Notice(`Applied style from ${styleSource}`);
        } catch (error) {
            console.error('Error applying selected style:', error);
            new Notice('Failed to apply selected style');
        }
    }

    /**
     * Create preview section
     * @private
     * @param {HTMLElement} contentEl - Content element
     * @returns {HTMLElement} Preview element
     */
    _createPreviewSection(contentEl) {
        const previewContainer = contentEl.createDiv();
        previewContainer.createEl('h5', { text: 'Preview:' });
        return previewContainer.createDiv({ cls: CONSTANTS.CSS_CLASSES.MODAL_PREVIEW });
    }

    /**
     * Setup live preview with debounced updates
     * @private
     * @param {object} inputs - Form inputs
     * @param {HTMLElement} preview - Preview element
     */
    _setupLivePreview(inputs, preview) {
        const debouncedUpdate = FormUtils.debounce(
            () => this._updatePreview(inputs, preview), 
            CONSTANTS.PREVIEW_UPDATE_DEBOUNCE
        );
        
        Object.entries(inputs).forEach(([key, input]) => {
            if (key !== 'useStyleSelect' && input.addEventListener) {
                input.addEventListener('input', debouncedUpdate);
            }
        });
    }

    /**
     * Update preview element
     * @private
     * @param {object} inputs - Form inputs
     * @param {HTMLElement} preview - Preview element
     */
    _updatePreview(inputs, preview) {
        preview.empty();
        preview.style.backgroundColor = inputs.backgroundColorInput.value;
        preview.style.color = inputs.textColorInput.value;

        // Add icon
        let iconEl;
        if (inputs.iconInput.value) {
            iconEl = preview.createSpan({ cls: CONSTANTS.CSS_CLASSES.BADGE_ICON });
            IconRenderer.renderIcon(iconEl, inputs.iconInput.value);
        }

        // Add text
        const currentTagName = inputs.tagNameInput.value.trim().replace(/^#+/, '') || this.tagName;
        const displayText = inputs.aliasInput.value || currentTagName;
        preview.createSpan({ text: displayText });
    }

    /**
     * Create action buttons
     * @private
     * @param {HTMLElement} contentEl - Content element
     * @param {object} inputs - Form inputs
     */
    _createActionButtons(contentEl, inputs) {
        const buttonContainer = contentEl.createDiv();
        buttonContainer.style.textAlign = 'right';
        buttonContainer.style.marginTop = '24px';

        // Delete button
        const deleteButton = buttonContainer.createEl('button', { 
            text: 'Delete',
            cls: 'mod-warning'
        });
        deleteButton.style.marginRight = '8px';
        deleteButton.onclick = () => this._deleteConfiguration();

        // Cancel button
        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.style.marginRight = '8px';
        cancelButton.onclick = () => this.close();

        // Save button
        const saveButton = buttonContainer.createEl('button', { 
            text: 'Save',
            cls: 'mod-cta'
        });
        saveButton.onclick = () => this._saveConfiguration(inputs);
    }

    /**
     * Delete current tag configuration
     * @private
     */
    async _deleteConfiguration() {
        try {
            await this.configManager.deleteTagConfig(this.originalTagName);
            new Notice(`Deleted configuration for #${this.originalTagName} (will use default styling)`);
            this._refreshCurrentView();
            this.close();
        } catch (error) {
            console.error('Error deleting configuration:', error);
            new Notice('Failed to delete configuration');
        }
    }

    /**
     * Save current configuration
     * @private
     * @param {object} inputs - Form inputs
     */
    async _saveConfiguration(inputs) {
        try {
            // Validate tag name
            const tagValidation = FormUtils.validateTagName(inputs.tagNameInput.value);
            if (!tagValidation.isValid) {
                new Notice(tagValidation.message);
                inputs.tagNameInput.focus();
                return;
            }

            const newTagName = tagValidation.tagName;
            const tagNameChanged = newTagName !== this.originalTagName;
            
            // Check if new tag name already exists
            if (tagNameChanged && this.plugin.settings.tagConfigs[newTagName]) {
                new Notice(`Configuration for #${newTagName} already exists`);
                inputs.tagNameInput.focus();
                return;
            }

            const newConfig = {
                icon: inputs.iconInput.value,
                textColor: inputs.textColorInput.value,
                backgroundColor: inputs.backgroundColorInput.value,
                alias: inputs.aliasInput.value
            };

            // Check if configuration matches defaults
            if (this.configManager.isDefaultConfig(newConfig)) {
                // Remove configuration if it matches defaults
                if (tagNameChanged) {
                    await this.configManager.deleteTagConfig(this.originalTagName);
                }
                new Notice(`Removed custom configuration for #${newTagName} (using defaults)`);
            } else {
                // Save the configuration
                await this.configManager.saveTagConfig(newTagName, newConfig);
                
                if (tagNameChanged) {
                    await this.configManager.deleteTagConfig(this.originalTagName);
                    new Notice(`Moved configuration from #${this.originalTagName} to #${newTagName}`);
                } else {
                    new Notice(`Updated configuration for #${newTagName}`);
                }
            }
            
            this._refreshCurrentView();
            this.close();
        } catch (error) {
            console.error('Error saving configuration:', error);
            new Notice('Failed to save configuration');
        }
    }

    /**
     * Refresh current view to show updated badges
     * @private
     */
    _refreshCurrentView() {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (activeLeaf?.view?.previewMode) {
            activeLeaf.view.previewMode.rerender();
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * Modal for adding new tag configurations
 */
class AddTagModal extends Modal {
    /**
     * @param {object} app - Obsidian app instance
     * @param {Function} onSubmit - Callback function for submission
     */
    constructor(app, onSubmit) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: 'Add Tag Configuration' });

        const inputContainer = contentEl.createDiv();
        const input = inputContainer.createEl('input', {
            type: 'text',
            placeholder: 'Enter tag name (without #)'
        });
        input.style.width = '100%';
        input.style.marginBottom = '16px';

        this._createButtons(contentEl, input);
        this._setupEventListeners(input);
    }

    /**
     * Create action buttons
     * @private
     * @param {HTMLElement} contentEl - Content element
     * @param {HTMLElement} input - Input element
     */
    _createButtons(contentEl, input) {
        const buttonContainer = contentEl.createDiv();
        buttonContainer.style.textAlign = 'right';

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.style.marginRight = '8px';
        cancelButton.onclick = () => this.close();

        const addButton = buttonContainer.createEl('button', { 
            text: 'Add',
            cls: 'mod-cta'
        });
        addButton.onclick = () => this._handleSubmit(input);
    }

    /**
     * Setup event listeners
     * @private
     * @param {HTMLElement} input - Input element
     */
    _setupEventListeners(input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this._handleSubmit(input);
            }
        });
    }

    /**
     * Handle form submission
     * @private
     * @param {HTMLElement} input - Input element
     */
    _handleSubmit(input) {
        const validation = FormUtils.validateTagName(input.value);
        if (validation.isValid) {
            this.onSubmit(validation.tagName);
            this.close();
        } else {
            new Notice(validation.message);
            input.focus();
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * Main plugin class
 */
class TagBadgesPlugin extends Plugin {
    async onload() {
        try {
            // Initialize components
            await this.loadSettings();
            this._initializeManagers();
            this._registerProcessors();
            this._setupUI();
            
            console.log('Tag Badges Plugin loaded successfully');
        } catch (error) {
            console.error('Failed to load Tag Badges Plugin:', error);
            new Notice('Failed to load Tag Badges Plugin');
        }
    }

    /**
     * Initialize manager components
     * @private
     */
    _initializeManagers() {
        this.configManager = new TagConfigManager(this);
        this.badgeRenderer = new BadgeRenderer(this, this.configManager);
    }

    /**
     * Register markdown processors
     * @private
     */
    _registerProcessors() {
        this.registerMarkdownCodeBlockProcessor('tag-badges', (source, el, ctx) => {
            this.renderTagBadges(el, ctx);
        });
    }

    /**
     * Setup UI components
     * @private
     */
    _setupUI() {
        this.addSettingTab(new TagBadgesSettingTab(this.app, this));
        StyleManager.injectStyles();
    }

    /**
     * Load plugin settings with validation
     */
    async loadSettings() {
        try {
            const loadedData = await this.loadData();
            this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
            
            // Validate and clean settings
            this._validateSettings();
            
            // Save clean settings if this is first load
            if (!loadedData || Object.keys(loadedData).length === 0) {
                await this.saveSettings();
            }
        } catch (error) {
            console.error('Error loading settings:', error);
            this.settings = { ...DEFAULT_SETTINGS };
        }
    }

    /**
     * Validate and clean loaded settings
     * @private
     */
    _validateSettings() {
        // Ensure defaultConfig exists and has all required properties
        if (!this.settings.defaultConfig) {
            this.settings.defaultConfig = { ...DEFAULT_SETTINGS.defaultConfig };
        } else {
            // Fill in missing properties
            Object.keys(DEFAULT_SETTINGS.defaultConfig).forEach(key => {
                if (!(key in this.settings.defaultConfig)) {
                    this.settings.defaultConfig[key] = DEFAULT_SETTINGS.defaultConfig[key];
                }
            });
        }

        // Ensure tagConfigs exists
        if (!this.settings.tagConfigs) {
            this.settings.tagConfigs = {};
        }

        // Clean invalid tag configurations
        Object.keys(this.settings.tagConfigs).forEach(tagName => {
            const config = this.settings.tagConfigs[tagName];
            if (!config || typeof config !== 'object') {
                delete this.settings.tagConfigs[tagName];
            }
        });
    }

    /**
     * Save plugin settings
     */
    async saveSettings() {
        try {
            await this.saveData(this.settings);
        } catch (error) {
            console.error('Error saving settings:', error);
            new Notice('Failed to save plugin settings');
        }
    }

    /**
     * Render tag badges in the provided element
     * @param {HTMLElement} el - Element to render badges in
     * @param {object} ctx - Markdown processing context
     */
    renderTagBadges(el, ctx) {
        el.empty();

        try {
            const file = this.app.workspace.getActiveFile();
            if (!file) {
                el.createDiv({ text: 'No active file found' });
                return;
            }

            const tags = FrontmatterParser.extractTags(file, this.app.metadataCache);
            
            if (tags.length === 0) {
                el.createDiv({ 
                    text: 'No tags found in frontmatter',
                    cls: CONSTANTS.CSS_CLASSES.NO_TAGS
                });
                return;
            }

            this._renderBadgeContainer(el, tags);
        } catch (error) {
            console.error('Error rendering tag badges:', error);
            el.createDiv({ text: 'Error loading tags' });
        }
    }

    /**
     * Render badge container with tags
     * @private
     * @param {HTMLElement} el - Container element
     * @param {string[]} tags - Array of tag names
     */
    _renderBadgeContainer(el, tags) {
        const container = el.createDiv({ cls: CONSTANTS.CSS_CLASSES.CONTAINER });

        tags.forEach(tag => {
            try {
                this.badgeRenderer.createBadge(container, tag);
            } catch (error) {
                console.error(`Error creating badge for tag "${tag}":`, error);
                // Create fallback badge
                const fallbackBadge = container.createDiv({ 
                    cls: CONSTANTS.CSS_CLASSES.BADGE,
                    text: `#${tag}`
                });
                fallbackBadge.style.backgroundColor = DEFAULT_SETTINGS.defaultConfig.backgroundColor;
                fallbackBadge.style.color = DEFAULT_SETTINGS.defaultConfig.textColor;
            }
        });
    }

    /**
     * Show tag configuration modal
     * @param {string} tagName - Tag name to configure
     */
    showTagConfigModal(tagName) {
        if (!tagName) {
            console.error('Cannot show config modal: tag name is required');
            return;
        }

        try {
            const modal = new TagConfigModal(this.app, this, tagName);
            modal.open();
        } catch (error) {
            console.error('Error opening tag config modal:', error);
            new Notice('Failed to open configuration modal');
        }
    }

    /**
     * Plugin cleanup
     */
    onunload() {
        StyleManager.removeStyles();
        console.log('Tag Badges Plugin unloaded');
    }
}

/**
 * Settings tab for plugin configuration
 */
class TagBadgesSettingTab extends PluginSettingTab {
    /**
     * @param {object} app - Obsidian app instance
     * @param {TagBadgesPlugin} plugin - Plugin instance
     */
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        this._createDefaultConfigSection(containerEl);
        this._createTagConfigsSection(containerEl);
    }

    /**
     * Create default configuration section
     * @private
     * @param {HTMLElement} container - Container element
     */
    _createDefaultConfigSection(container) {
        container.createEl('b', { text: 'Default Badge Configuration' });
        container.createEl('p', { 
            text: 'These settings apply to all tags that don\'t have specific configurations.',
            cls: 'setting-item-description'
        });

        const config = this.plugin.settings.defaultConfig;

        // Icon setting
        new Setting(container)
            .setName('Icon')
            .setDesc('Choose a Lucide icon for default badges')
            .addText(text => {
                text.setPlaceholder(null)
                    .setValue(config.icon)
                    .onChange(async (value) => {
                        //this.plugin.settings.defaultConfig.icon = value || CONSTANTS.DEFAULT_ICON;
                        this.plugin.settings.defaultConfig.icon = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Text color setting
        new Setting(container)
            .setName('Text Color')
            .setDesc('Choose the default badge text color')
            .addColorPicker(color => {
                color.setValue(config.textColor)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultConfig.textColor = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Background color setting
        new Setting(container)
            .setName('Background Color')
            .setDesc('Choose the default badge background color')
            .addColorPicker(color => {
                color.setValue(config.backgroundColor)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultConfig.backgroundColor = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    /**
     * Create tag-specific configurations section
     * @private
     * @param {HTMLElement} container - Container element
     */
    _createTagConfigsSection(container) {
        container.createEl('br');
        container.createEl('b', { text: 'Tag-Specific Configurations' });
        
        // Add tag button
        new Setting(container)
            .setName('Add tag configuration')
            .setDesc('Configure a specific tag with custom styling and alias')
            .addButton(button => {
                button.setButtonText('Add Tag')
                    .onClick(() => this._showAddTagModal());
            });

        // Display existing configurations
        const tagConfigsContainer = container.createDiv({ cls: 'tag-configs-container' });
        this._displayTagConfigs(tagConfigsContainer);
    }

    /**
     * Display existing tag configurations
     * @private
     * @param {HTMLElement} container - Container element
     */
    _displayTagConfigs(container) {
        container.empty();
        
        const tagNames = this.plugin.configManager.getConfiguredTagNames();
        
        if (tagNames.length === 0) {
            container.createEl('p', { 
                text: 'No tag-specific configurations yet.',
                cls: 'setting-item-description'
            });
            return;
        }

        // Create list items for each configured tag
        tagNames.forEach(tagName => {
            this._createTagListItem(container, tagName);
        });
    }

    /**
     * Create list item for a configured tag
     * @private
     * @param {HTMLElement} container - Container element
     * @param {string} tagName - Tag name
     */
    _createTagListItem(container, tagName) {
        const listItem = container.createDiv({ cls: CONSTANTS.CSS_CLASSES.TAG_LIST_ITEM });
        
        // Tag name
        listItem.createDiv({ 
            text: `#${tagName}`, 
            cls: CONSTANTS.CSS_CLASSES.TAG_LIST_NAME 
        });
        
        // Buttons container
        const buttonsContainer = listItem.createDiv({ 
            cls: CONSTANTS.CSS_CLASSES.TAG_LIST_BUTTONS 
        });
        
        this._createTagActionButtons(buttonsContainer, tagName);
    }

    /**
     * Create action buttons for a tag
     * @private
     * @param {HTMLElement} container - Container element
     * @param {string} tagName - Tag name
     */
    _createTagActionButtons(container, tagName) {
        // Configure button
        const configureButton = container.createEl('button', { text: 'Configure' });
        configureButton.onclick = () => {
            this.plugin.showTagConfigModal(tagName);
        };
        
        // Duplicate button
        const duplicateButton = container.createEl('button', { text: 'Duplicate' });
        duplicateButton.onclick = async () => {
            try {
                const duplicatedTagName = await this._duplicateTagConfig(tagName);
                if (duplicatedTagName) {
                    this.display();
                    new Notice(`Duplicated configuration as #${duplicatedTagName}`);
                }
            } catch (error) {
                console.error('Error duplicating tag config:', error);
                new Notice('Failed to duplicate configuration');
            }
        };
        
        // Delete button
        const deleteButton = container.createEl('button', { 
            text: 'Delete',
            cls: 'mod-warning'
        });
        deleteButton.onclick = async () => {
            try {
                await this.plugin.configManager.deleteTagConfig(tagName);
                this.display();
                new Notice(`Deleted configuration for #${tagName}`);
            } catch (error) {
                console.error('Error deleting tag config:', error);
                new Notice('Failed to delete configuration');
            }
        };
    }

    /**
     * Duplicate a tag configuration
     * @private
     * @param {string} originalTagName - Original tag name
     * @returns {Promise<string|null>} New tag name or null if failed
     */
    async _duplicateTagConfig(originalTagName) {
        const originalConfig = this.plugin.settings.tagConfigs[originalTagName];
        if (!originalConfig) {
            new Notice(`Configuration for #${originalTagName} not found`);
            return null;
        }

        // Generate unique name
        let duplicatedTagName = `${originalTagName}-copy`;
        let counter = 1;
        
        while (this.plugin.settings.tagConfigs[duplicatedTagName]) {
            duplicatedTagName = `${originalTagName}-copy${counter}`;
            counter++;
        }

        // Create deep copy of configuration
        const duplicatedConfig = {
            icon: originalConfig.icon,
            textColor: originalConfig.textColor,
            backgroundColor: originalConfig.backgroundColor,
            alias: originalConfig.alias
        };

        await this.plugin.configManager.saveTagConfig(duplicatedTagName, duplicatedConfig);
        return duplicatedTagName;
    }

    /**
     * Show add tag modal
     * @private
     */
    _showAddTagModal() {
        const modal = new AddTagModal(this.app, async (tagName) => {
            try {
                if (!tagName) {
                    new Notice('Invalid tag name');
                    return;
                }

                if (this.plugin.settings.tagConfigs[tagName]) {
                    new Notice(`Configuration for #${tagName} already exists`);
                    return;
                }
                
                // Create initial configuration
                const initialConfig = {
                    icon: CONSTANTS.DEFAULT_ICON,
                    textColor: '#ffffff',
                    backgroundColor: '#6b7280',
                    alias: ''
                };
                
                await this.plugin.configManager.saveTagConfig(tagName, initialConfig);
                this.display();
                new Notice(`Added configuration for #${tagName}`);
            } catch (error) {
                console.error('Error adding tag configuration:', error);
                new Notice('Failed to add tag configuration');
            }
        });
        modal.open();
    }
}

module.exports = TagBadgesPlugin;
