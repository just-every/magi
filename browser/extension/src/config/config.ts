/**
 * Configuration constants for the MAGI browser extension.
 */

// Native messaging host configuration
export const NATIVE_HOST_NAME = 'com.withmagi.magi_native_host';

// Extension version and debugging
export const DEBUGGER_VERSION = '1.3';

// Tab management settings
export const TAB_INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
export const TAB_GROUP_NAME = 'magi';
export const TAB_GROUP_COLOR = 'blue';
export const TAB_GROUP_COLLAPSED = true;

// Storage configuration
export const MAP_STORAGE_PREFIX = 'mapStore_'; // Prefix for session storage keys

// Navigation settings
export const NAVIGATION_TIMEOUT_MS = 10000; // 10 seconds timeout for page navigation

// DOM processing constants
export const DOM_CONFIG = {
    // Node types to include in processing
    INCLUDE_NODES: [1, 3, 9, 11], // ELEMENT_NODE, TEXT_NODE, DOCUMENT_NODE, DOCUMENT_FRAGMENT_NODE

    // Interactive elements
    INTERACTIVE_TAGS: [
        'A',
        'BUTTON',
        'INPUT',
        'SELECT',
        'TEXTAREA',
        'OPTION',
        'DETAILS',
        'SUMMARY',
    ],
    INTERACTIVE_ROLES: [
        'button',
        'link',
        'checkbox',
        'radio',
        'switch',
        'menuitem',
        'menuitemcheckbox',
        'menuitemradio',
        'tab',
        'textbox',
        'searchbox',
        'slider',
        'spinbutton',
        'combobox',
        'listbox',
        'option',
        'treeitem',
        'gridcell',
    ],

    // Landmark regions
    LANDMARK_TAGS: [
        'HEADER',
        'FOOTER',
        'NAV',
        'MAIN',
        'ASIDE',
        'FORM',
        'SECTION',
        'ARTICLE',
    ],
    LANDMARK_ROLES: [
        'banner',
        'contentinfo',
        'navigation',
        'main',
        'complementary',
        'form',
        'region',
        'search',
    ],

    // Elements to ignore
    IGNORE_TAGS: [
        'SCRIPT',
        'STYLE',
        'HEAD',
        'META',
        'LINK',
        'NOSCRIPT',
        'TEMPLATE',
        'OBJECT',
        'EMBED',
        'PATH',
        'LINE',
        'POLYLINE',
        'RECT',
        'CIRCLE',
        'ELLIPSE',
        'SVG',
    ],

    // Potentially interesting content elements
    POTENTIALLY_INTERESTING_TAGS: [
        'P',
        'LI',
        'TD',
        'TH',
        'DT',
        'DD',
        'CODE',
        'PRE',
        'BLOCKQUOTE',
        'FIGURE',
        'FIGCAPTION',
        'H1',
        'H2',
        'H3',
        'H4',
        'H5',
        'H6',
    ],
};
