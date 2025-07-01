export type ManagerSearchEngine =
    | 'dribbble'
    | 'behance'
    | 'envato'
    | 'pinterest'
    | 'awwwards'
    | 'web_search';

export const MANAGER_SEARCH_ENGINES: ManagerSearchEngine[] = [
    'dribbble',
    'behance',
    'envato',
    'pinterest',
    'awwwards',
    'web_search',
];

export const MANAGER_SEARCH_DESCRIPTIONS: string[] = [
    '- dribbble: massive designer-driven "shot" gallery focused on UI/UX, branding and motion—great for modern micro-interactions or single-component screenshots',
    "- behance: Adobe's portfolio network; long-form project breakdowns and full site/brand presentations—ideal when you need contextual hero + entire flow in one deck",
    '- envato: ThemeForest marketplace with thousands of production-ready site templates—best for full-page screenshots that already ship with code',
    '- pinterest: broad, lifestyle-driven inspiration boards—handy for eclectic or non-web visuals and quick style tiles',
    '- awwwards: daily judged showcase of cutting-edge, interactive web experiences—use this for avant-garde, animation-heavy screenshots',
    '- web_search: broad web crawl; use when you need raw screenshots beyond the curated sources (lower signal, but widest net)',
];

// Type definitions
export interface ManagerSearchResult {
    url: string;
    title?: string;
    thumbnailURL?: string;
    screenshotURL?: string;
    screenshotPath?: string;
}

export type MANAGER_ASSET_TYPES =
    | 'color_pallet'
    | 'typography_specimen'
    | 'manager_tokens'
    | 'primary_logo'
    | 'logomark_icon'
    | 'homepage_mockup'
    | 'homepage_content_mockup'
    | 'component_sheet'
    | 'content_page_mockup'
    | 'pricing_page_mockup'
    | 'product_page_mockup'
    | 'authentication_page_mockup'
    | 'dashboard_page_mockup'
    | 'favicon'
    | 'pwa_maskable_icon'
    | 'system_icon_library'
    | 'background_textures'
    | 'spot_illustrations'
    | 'hero_images'
    | 'section_header_images'
    | 'product_screenshots'
    | 'team_headshots'
    | 'infographics'
    | 'open_graph_card'
    | 'twitter_card'
    | 'email_banner'
    | 'error_illustration'
    | 'animated_asset'
    | 'loading_indicator';

// Type for spec dimensions
export interface ManagerAssetDimension {
    width: number;
    height: number;
}

// Type for spec.type
export type ManagerAssetSpecType = 'png' | 'svg' | 'json' | 'gif';

// Type for spec.background
export type ManagerAssetBackground = 'opaque' | 'transparent' | 'auto';

// Type for spec.aspect
export type ManagerAssetAspect = 'square' | 'landscape' | 'portrait' | 'auto';

// Type for variant values
export type ManagerAssetVariant = 'light' | 'dark';

/**
 * Interface for manager specifications returned by the LLM
 */
export interface ManagerSpec {
    run_id: string;
    context: string;
    aspect: ManagerAssetAspect;
    background: ManagerAssetBackground;
    inspiration_search: Array<{
        engine: ManagerSearchEngine;
        query: string;
    }>;
    inspiration_judge: string;
    manager_prompts: {
        draft: string[];
        medium: string;
        high: string;
    };
    manager_judge: {
        draft: string;
        medium: string;
        high: string;
    };
}

// Type for the spec object
export interface ManagerAssetSpec {
    type: ManagerAssetSpecType;
    dimensions: ManagerAssetDimension[];
    background: ManagerAssetBackground;
    aspect: ManagerAssetAspect;
}

// Type for individual manager asset specification
export interface ManagerAssetReferenceItem {
    name: string;
    category: string;
    description: string;
    usage_context: string;
    spec: ManagerAssetSpec;
    variant: ManagerAssetVariant[];
    depends_on: MANAGER_ASSET_TYPES[];
}

// Type for the full MANAGER_ASSET_REFERENCE object
export type ManagerAssetReferenceObject = {
    [key in MANAGER_ASSET_TYPES]: ManagerAssetReferenceItem;
};

// Type for individual manager asset guide
export interface ManagerAssetGuideItem {
    guide: string[];
    ideal: string[];
    warnings: string[];
    inspiration: string[];
    criteria: string[];
}

// Type for the full MANAGER_ASSET_GUIDE object
export type ManagerAssetGuideObject = {
    [key in MANAGER_ASSET_TYPES]?: ManagerAssetGuideItem;
};

export const MANAGER_ASSET_REFERENCE: ManagerAssetReferenceObject = {
    color_pallet: {
        name: 'Core color palette swatch',
        category: 'Branding',
        description: 'Master sheet of brand colors, tints and neutrals.',
        usage_context: 'Reference for all color choices.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 1024,
                    height: 1024,
                },
            ],
            background: 'opaque',
            aspect: 'square',
        },
        variant: ['light'],
        depends_on: [],
    },
    typography_specimen: {
        name: 'Typography scale specimen',
        category: 'Reference',
        description:
            'Shows font families, weights, heading hierarchy, body copy and code snippets.',
        usage_context:
            'Ensures text in every generated image matches approved styles.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 1024,
                    height: 1536,
                },
            ],
            background: 'opaque',
            aspect: 'portrait',
        },
        variant: ['light'],
        depends_on: ['color_pallet'],
    },
    manager_tokens: {
        name: 'Design-token export',
        category: 'Reference',
        description:
            'Machine-readable JSON containing color, type-scale, spacing, radius and shadow variables.',
        usage_context:
            'Imported directly by AI coding agents to generate CSS/SCSS variables.',
        spec: {
            type: 'json',
            dimensions: [],
            background: 'transparent',
            aspect: 'auto',
        },
        variant: [],
        depends_on: ['color_pallet', 'typography_specimen'],
    },
    primary_logo: {
        name: 'Primary logo',
        category: 'Branding',
        description:
            'Full word-mark for headers, footers and printed materials.',
        usage_context: '<header>, PDFs, social branding.',
        spec: {
            type: 'svg',
            dimensions: [
                {
                    width: 1024,
                    height: 256,
                },
                {
                    width: 512,
                    height: 128,
                },
            ],
            background: 'transparent',
            aspect: 'landscape',
        },
        variant: ['light', 'dark'],
        depends_on: ['color_pallet'],
    },
    logomark_icon: {
        name: 'Logomark / icon-only logo',
        category: 'Branding',
        description: 'Square symbol for avatars, favicons and small UI.',
        usage_context: 'Mobile nav, PWA icon, social avatars.',
        spec: {
            type: 'svg',
            dimensions: [
                {
                    width: 1024,
                    height: 1024,
                },
                {
                    width: 512,
                    height: 512,
                },
            ],
            background: 'transparent',
            aspect: 'square',
        },
        variant: ['light', 'dark'],
        depends_on: ['primary_logo'],
    },
    homepage_mockup: {
        name: 'Homepage high-fidelity mock-up',
        category: 'Reference',
        description:
            'Pixel-perfect composite showing hero, buttons and imagery style; master visual reference.',
        usage_context: 'All stylistic assets must visually match this design.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 1536,
                    height: 1024,
                },
            ],
            background: 'opaque',
            aspect: 'landscape',
        },
        variant: ['light'],
        depends_on: [
            'primary_logo',
            'logomark_icon',
            'typography_specimen',
            'color_pallet',
        ],
    },
    homepage_content_mockup: {
        name: 'Homepage below the fold mock-up',
        category: 'Reference',
        description:
            'Expands on homepage mock-up with cards, graphics and other content.',
        usage_context: 'All page assets must visually match this design.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 1024,
                    height: 1536,
                },
            ],
            background: 'opaque',
            aspect: 'portrait',
        },
        variant: ['light'],
        depends_on: [
            'primary_logo',
            'logomark_icon',
            'typography_specimen',
            'color_pallet',
            'homepage_mockup',
        ],
    },
    component_sheet: {
        name: 'UI component sheet',
        category: 'Reference',
        description:
            'Buttons, form fields, cards and their hover / active states, all on one canvas.',
        usage_context:
            'Prevents missing components later; used by code agent to map classes.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 1024,
                    height: 1024,
                },
            ],
            background: 'transparent',
            aspect: 'square',
        },
        variant: ['light'],
        depends_on: ['homepage_mockup', 'homepage_content_mockup'],
    },
    content_page_mockup: {
        name: 'Content page mock-up',
        category: 'Reference',
        description:
            'Pixel-perfect composite showing cards or list views, tag filters, pagination.',
        usage_context:
            'Locks in card component, metadata chips, search/filter controls.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 1536,
                    height: 1024,
                },
            ],
            background: 'opaque',
            aspect: 'landscape',
        },
        variant: ['light'],
        depends_on: [
            'primary_logo',
            'logomark_icon',
            'typography_specimen',
            'color_pallet',
            'homepage_content_mockup',
        ],
    },
    pricing_page_mockup: {
        name: 'Pricing page mock-up',
        category: 'Reference',
        description:
            'Pixel-perfect composite showing plan cards, monthly↔annual toggle, comparison table and CTA blocks.',
        usage_context:
            'Locks in pricing-card component, toggle styles, trust badges and table formatting for downstream code.',
        spec: {
            type: 'png',
            dimensions: [{ width: 1536, height: 1024 }],
            background: 'opaque',
            aspect: 'landscape',
        },
        variant: ['light'],
        depends_on: [
            'primary_logo',
            'logomark_icon',
            'typography_specimen',
            'color_pallet',
            'homepage_content_mockup',
        ],
    },
    product_page_mockup: {
        name: 'Product / feature detail mock-up',
        category: 'Reference',
        description:
            'Detail page with hero, screenshots carousel, tabset/accordion, feature call-outs and CTA.',
        usage_context:
            'Tests multi-column responsive layout and locks in call-out patterns reused across marketing pages.',
        spec: {
            type: 'png',
            dimensions: [{ width: 1536, height: 1024 }],
            background: 'opaque',
            aspect: 'landscape',
        },
        variant: ['light'],
        depends_on: [
            'primary_logo',
            'logomark_icon',
            'typography_specimen',
            'color_pallet',
            'homepage_content_mockup',
        ],
    },
    authentication_page_mockup: {
        name: 'Authentication flow mock-up',
        category: 'Reference',
        description:
            'Sign-in/sign-up screen with minimal nav, form states, error messaging and legal links.',
        usage_context:
            'Styles long forms and error states; ensures auth pages feel cohesive even without full header/footer.',
        spec: {
            type: 'png',
            dimensions: [{ width: 1024, height: 1536 }],
            background: 'opaque',
            aspect: 'portrait',
        },
        variant: ['light'],
        depends_on: [
            'primary_logo',
            'typography_specimen',
            'color_pallet',
            'component_sheet',
        ],
    },
    dashboard_page_mockup: {
        name: 'Dashboard / app shell mock-up',
        category: 'Reference',
        description:
            'Logged-in layout with sidebar, breadcrumb, data table, toast notifications and empty-state illustration.',
        usage_context:
            'Establishes core app shell and data-display components for any authenticated UX.',
        spec: {
            type: 'png',
            dimensions: [{ width: 1536, height: 1024 }],
            background: 'opaque',
            aspect: 'landscape',
        },
        variant: ['light'],
        depends_on: [
            'primary_logo',
            'logomark_icon',
            'typography_specimen',
            'color_pallet',
            'component_sheet',
        ],
    },
    favicon: {
        name: 'Favicon',
        category: 'Branding',
        description:
            'Single 512 × 512 PNG source for modern browsers to down-scale.',
        usage_context: '<head> favicon, app-icon fallback.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 512,
                    height: 512,
                },
            ],
            background: 'transparent',
            aspect: 'square',
        },
        variant: ['light'],
        depends_on: ['logomark_icon'],
    },
    pwa_maskable_icon: {
        name: 'PWA maskable icon',
        category: 'Branding',
        description: 'Installable web-app icon that fits Android/iOS masks.',
        usage_context: 'manifest.json → icons[]',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 512,
                    height: 512,
                },
            ],
            background: 'transparent',
            aspect: 'square',
        },
        variant: ['light', 'dark'],
        depends_on: ['logomark_icon'],
    },
    system_icon_library: {
        name: 'System UI icons',
        category: 'Interface',
        description: 'Stroke-style SVGs for navigation and controls.',
        usage_context: 'Imported as <svg> sprites or React components.',
        spec: {
            type: 'svg',
            dimensions: [
                {
                    width: 24,
                    height: 24,
                },
            ],
            background: 'transparent',
            aspect: 'square',
        },
        variant: [],
        depends_on: ['color_pallet'],
    },
    background_textures: {
        name: 'Background textures / patterns',
        category: 'Interface',
        description: 'Tileable visuals adding depth without heavy file size.',
        usage_context: 'Hero and section backgrounds (CSS `background-image`).',
        spec: {
            type: 'svg',
            dimensions: [
                {
                    width: 1024,
                    height: 1024,
                },
            ],
            background: 'transparent',
            aspect: 'square',
        },
        variant: ['light', 'dark'],
        depends_on: ['homepage_mockup'],
    },
    spot_illustrations: {
        name: 'Spot illustrations',
        category: 'Interface',
        description: 'Decorative SVGs for empty states and onboarding.',
        usage_context: 'Inline <svg> or <img>.',
        spec: {
            type: 'svg',
            dimensions: [
                {
                    width: 1024,
                    height: 768,
                },
            ],
            background: 'transparent',
            aspect: 'landscape',
        },
        variant: ['light'],
        depends_on: ['homepage_mockup'],
    },
    hero_images: {
        name: 'Hero / feature images',
        category: 'Content',
        description: 'Above-the-fold photographs or renders.',
        usage_context: '<section class="hero"> background or <img>.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 1536,
                    height: 1024,
                },
                {
                    width: 1024,
                    height: 682,
                },
            ],
            background: 'opaque',
            aspect: 'landscape',
        },
        variant: ['light'],
        depends_on: ['homepage_mockup'],
    },
    section_header_images: {
        name: 'Section header images',
        category: 'Content',
        description: 'Visual breaks between page sections.',
        usage_context: '<section> backgrounds.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 1024,
                    height: 640,
                },
                {
                    width: 768,
                    height: 480,
                },
            ],
            background: 'opaque',
            aspect: 'landscape',
        },
        variant: ['light'],
        depends_on: ['homepage_mockup'],
    },
    product_screenshots: {
        name: 'Product / UI screenshots',
        category: 'Content',
        description: 'App/dashboard captures, optionally inside device frames.',
        usage_context: 'Marketing sections, modals, galleries.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 1024,
                    height: 640,
                },
            ],
            background: 'transparent',
            aspect: 'landscape',
        },
        variant: [],
        depends_on: [],
    },
    team_headshots: {
        name: 'Team headshots & testimonial avatars',
        category: 'Content',
        description: 'Square portraits for About page and social proof.',
        usage_context: '<img class="avatar">',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 400,
                    height: 400,
                },
            ],
            background: 'opaque',
            aspect: 'square',
        },
        variant: [],
        depends_on: [],
    },
    infographics: {
        name: 'Infographics & diagrams',
        category: 'Content',
        description: 'Data-dense visuals explaining concepts or metrics.',
        usage_context: 'Blog posts, landing pages.',
        spec: {
            type: 'svg',
            dimensions: [
                {
                    width: 1024,
                    height: 683,
                },
            ],
            background: 'transparent',
            aspect: 'landscape',
        },
        variant: ['light'],
        depends_on: ['homepage_mockup'],
    },
    open_graph_card: {
        name: 'Open-Graph share card',
        category: 'Marketing / sharing',
        description: 'Preview image shown in Facebook, LinkedIn, Slack.',
        usage_context: 'og:image meta-tag.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 1024,
                    height: 540,
                },
            ],
            background: 'opaque',
            aspect: 'landscape',
        },
        variant: ['light'],
        depends_on: ['homepage_mockup', 'primary_logo'],
    },
    twitter_card: {
        name: 'Twitter / X share card',
        category: 'Marketing / sharing',
        description: 'Optimised aspect ratio for X link previews.',
        usage_context: 'twitter:image meta-tag.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 1024,
                    height: 576,
                },
            ],
            background: 'opaque',
            aspect: 'landscape',
        },
        variant: ['light'],
        depends_on: ['homepage_mockup', 'primary_logo'],
    },
    email_banner: {
        name: 'Email header banner',
        category: 'Marketing / sharing',
        description: 'Brand presence in newsletters and transactional emails.',
        usage_context: '<img> in MJML/HTML emails.',
        spec: {
            type: 'png',
            dimensions: [
                {
                    width: 1024,
                    height: 512,
                },
            ],
            background: 'opaque',
            aspect: 'landscape',
        },
        variant: ['light'],
        depends_on: ['homepage_mockup', 'primary_logo'],
    },
    error_illustration: {
        name: '404 / maintenance illustration',
        category: 'Special cases',
        description: 'Friendly artwork displayed on error or downtime pages.',
        usage_context: '404.html & 503.html',
        spec: {
            type: 'svg',
            dimensions: [
                {
                    width: 1024,
                    height: 683,
                },
            ],
            background: 'transparent',
            aspect: 'landscape',
        },
        variant: ['light', 'dark'],
        depends_on: ['homepage_mockup'],
    },
    animated_asset: {
        name: 'Animated GIF / Lottie asset',
        category: 'Special cases',
        description:
            'Lightweight motion element for quick demos or micro-delight.',
        usage_context: 'Onboarding, hover previews.',
        spec: {
            type: 'gif',
            dimensions: [
                {
                    width: 800,
                    height: 800,
                },
            ],
            background: 'transparent',
            aspect: 'square',
        },
        variant: [],
        depends_on: ['homepage_mockup'],
    },
    loading_indicator: {
        name: 'Loading / progress indicator',
        category: 'Special cases',
        description: 'Spinner or progress bar animation matching brand colors.',
        usage_context: 'Async UI states, skeleton loaders.',
        spec: {
            type: 'gif',
            dimensions: [
                {
                    width: 400,
                    height: 400,
                },
            ],
            background: 'transparent',
            aspect: 'square',
        },
        variant: ['light', 'dark'],
        depends_on: ['color_pallet'],
    },
};

export const MANAGER_ASSET_GUIDE: ManagerAssetGuideObject = {
    color_pallet: {
        guide: [
            "Define primary, secondary, and accent colors that reflect the brand's personality and target audience.",
            'Include a versatile range of tints (color + white) and shades (color + black) for each core color to provide flexibility in UI design.',
            'Select a complementary set of neutral colors (e.g., greys, off-whites, beiges) that support the main palette and enhance readability.',
            'Consider the psychological impact of chosen colors and their cultural connotations, especially for global brands.',
            'Ensure sufficient color contrast between text and background elements to meet WCAG accessibility guidelines (aim for AA or AAA).',
            'Test the palette in both light and dark mode contexts to ensure usability and aesthetic appeal across themes.',
            'Document exact color values (HEX, RGB, HSL/HSV, and potentially CMYK for print) for consistency.',
            'Limit the number of core colors to maintain clarity and avoid overwhelming users (typically 3-5 main colors).',
        ],
        ideal: [
            'A palette that is unique, memorable, and aligns with 2025 trends such as nature-inspired tones (earthy terracotta, forest green, ocean blue, clay), optimistic pastels, or a sophisticated mix of vibrant/bold hues with softer, muted counterpoints.',
            "Incorporation of complex and dynamic gradients (e.g., aurora/aura gradients, layered chromatic transitions blending purples, pinks, and blues) to add depth and visual interest, particularly if the brand aims for a modern, 'athletic' (dynamic) feel.",
            'Consideration of high-tech metallics (silver, chrome) or pearlescent finishes for a futuristic or luxurious aesthetic, if appropriate for the brand.',
            "A 'monochromatic with a modern twist' approach, utilizing various shades and tints of a single color family, punctuated by a surprising and impactful accent color.",
            "Designed with adaptability for 'living color palettes' in mind, where colors might subtly shift based on user interaction or context, even if the primary swatch is static.",
            'Clear demonstration of accessibility compliance (e.g., color contrast ratios labeled) directly on the swatch sheet.',
            'Reflection of sustainable aesthetics through color choices if brand values align (e.g., colors evoking natural dyes, palettes optimized for reduced ink consumption in print).',
            'Inclusion of colors suitable for AI-generated realism or to complement AI-driven personalized experiences.',
            'Consideration for dual-tone schemes, creating compelling contrast between two vibrant colors.',
        ],
        warnings: [
            'Avoid overly complex palettes with too many distinct colors, which can lead to inconsistency and a chaotic user experience.',
            'Refrain from choosing colors based solely on personal preference; selections must be rooted in brand strategy, target audience analysis, and desired emotional response.',
            'Ensure colors do not vibrate or create visual fatigue when placed adjacently; test combinations thoroughly.',
            'Be cautious of fleeting color trends that might quickly date the brand, unless the brand identity is intentionally ephemeral or tied to fast fashion.',
            'Neglecting accessibility by choosing low-contrast color combinations can exclude users with visual impairments and lead to poor usability.',
            'Overuse of highly saturated or vibrant colors without adequate neutral balancing space can be visually overwhelming and aggressive.',
            'Failing to test colors on various devices and screen calibrations, as perceived color can vary significantly.',
            'Not considering cultural sensitivities related to color if the brand has an international audience.',
        ],
        inspiration: [
            "Search for 'Nature-inspired color palettes 2025' (e.g., forest greens, deep ocean blues, earthy browns, terracotta, clay).",
            "Explore 'Optimistic pastel color schemes' and 'Joyful color palettes 2025'.",
            "Look up 'Vibrant and bold color combinations web design' mixed with 'Muted neutral palettes'.",
            "Investigate 'Chromatic gradients inspiration' or 'Aurora borealis color gradients'.",
            "Find examples of 'Metallic and chrome UI color palettes' or 'Futuristic color schemes'.",
            "Search for 'Monochromatic design with pop of color' or 'Modern monochrome web design'.",
            "Research 'Sustainable design color palettes' or 'Eco-conscious branding colors'.",
            "Explore 'Retro-futuristic color palettes' (e.g., Y2K aesthetics, 90s revival with a modern twist).",
            "Look at 'AI-generated color palettes' or 'Color trends from WGSN/Coloro'.",
            "Search for 'Cherry red brand color examples' or 'Mocha Mousse color trend'.",
        ],
        criteria: [
            "Brand Alignment: How effectively does the palette reflect the brand's core personality, values, industry, and target audience?",
            'Versatility & Application: Can the colors be applied effectively and harmoniously across all brand touchpoints, including web, mobile, print, and UI elements like buttons and alerts?',
            'Timelessness vs. Trend Relevance: Does the palette feel contemporary and aligned with 2025 sensibilities (e.g., dynamic, authentic, sustainable choices) while also possessing qualities that ensure longevity, or is it intentionally trendy for specific impact?',
            'Accessibility Compliance: Do key color combinations (especially text on background) meet or exceed WCAG contrast standards for readability and inclusivity?',
            'Visual Harmony & Balance: Do the colors work cohesively together? Is there a good balance between primary, secondary, accent, and neutral colors? Does it avoid visual clutter?',
            'Uniqueness & Memorability: Does the palette help the brand stand out and create a distinct, memorable visual identity?',
            'Emotional Impact & Psychology: What specific emotions or associations does the palette evoke? Is this congruent with the intended brand messaging?',
            'Scalability for Themes: How well does the palette adapt or provide variations for different themes, such as light and dark modes, while maintaining brand integrity?',
        ],
    },
    typography_specimen: {
        guide: [
            'Select primary (usually for headings) and secondary (usually for body text) font families. Consider a harmonious pairing, e.g., a serif with a sans-serif, or different styles of sans-serif.',
            'Opt for variable fonts if possible, for greater flexibility in weight, width, and optical size with better performance.',
            'Define a clear typographic scale with distinct sizes for all heading levels (H1-H6), body copy, sub-copy, captions, labels, buttons, and code snippets.',
            'Showcase the available font weights (e.g., Light, Regular, Medium, Semibold, Bold, Black) and styles (e.g., Italic, Oblique) for each family.',
            'Ensure all chosen fonts are highly legible and readable across various screen sizes and resolutions.',
            'Verify font licensing for web and other intended uses; prioritize web-optimized fonts for performance.',
            'Apply colors from the approved core color palette to demonstrate text appearance on different background colors, checking for contrast.',
            'Specify line height (leading) and letter spacing (tracking) for different text elements to optimize readability and aesthetic appeal.',
            'Include examples of paragraph structure, list styles, and blockquotes if applicable.',
        ],
        ideal: [
            'Features **Variable Fonts** prominently, showcasing their adaptability in weight, width, and other axes, optimizing for both aesthetics and performance.',
            'Employs **Expressive Serifs** (especially bold serifs with character) for headings or key brand statements, or a sophisticated **Heritage Typography** if aligned with brand values, possibly paired with a clean and highly legible sans-serif for body text.',
            "Demonstrates **Bold and Oversized Typography** for impactful hero sections or key messages, alongside meticulously proportioned and readable body text, creating a dynamic 'athletic' visual hierarchy.",
            'Could incorporate **Customized or Hand-drawn Type Elements** (e.g., for a logotype or unique display headings) to inject a strong brand personality, or even playful **Bubble Fonts**, **Globby/Liquid Fonts**, or **Disruptive Fonts** if the brand identity is avant-garde or targets a specific niche.',
            'Illustrates how **Mixed Typefaces** (if more than two are used, which is increasingly acceptable) create a harmonious yet dynamic and layered hierarchy, enhancing visual storytelling.',
            'If aiming for structured simplicity, reflects **Bauhaus-inspired Minimal Typography** with clean lines and geometric balance.',
            'May showcase **Art Deco Revival Fonts** with their characteristic geometric elegance or **Retro-Futuristic Fonts** blending nostalgia with innovation.',
            "The typographic hierarchy is exceptionally clear, intuitive, and guides the user's eye effortlessly through content, establishing a strong visual rhythm.",
            'Suggests potential for innovative treatments like **Layered Text Effects**, **Text with Gradients**, or even hints at **Kinetic/Animated Typography** through static representations (e.g., text shown in a state implying movement or transformation).',
            'Includes examples of **Organic Handwritten Type** for a personal, authentic touch if it aligns with the brand.',
        ],
        warnings: [
            'Using too many disparate font families (more than 2-3 is often risky) can create a visually cluttered and unprofessional appearance.',
            'Choosing fonts that are difficult to read, especially for body copy or at smaller sizes, severely impacts usability.',
            'Inconsistent application of the defined typographic scale and hierarchy throughout designs.',
            'Ignoring or violating font licensing agreements, which can lead to legal issues.',
            'Neglecting web font performance; overly large font files or too many font requests can slow down page load times.',
            'Poor contrast between text color and background colors, leading to accessibility failures.',
            "Forcing a highly stylized or trendy font that does not align with the brand's core message, target audience, or desired longevity.",
            'Not thoroughly testing readability on various devices, screen sizes, and resolutions, including mobile.',
            "Using 'anti-design' or 'brutalist' typography without a clear strategic purpose, as it can alienate users if not executed thoughtfully for a specific audience.",
        ],
        inspiration: [
            "Search for 'Variable font showcases' and 'Variable font pairings'.",
            "Explore 'Expressive serif fonts' and 'Modern serif typography examples'.",
            "Look up 'Bold typography website design' and 'Oversized typography layouts'.",
            "Investigate 'Kinetic typography inspiration' and 'Animated text effects' (to understand how chosen fonts might animate).",
            "Find examples of 'Minimalist typography design' and 'Bauhaus typography layouts'.",
            "Search for 'Retro-futuristic font examples' and 'Y2K typography trends 2025'.",
            "Explore 'Handwritten typography in web design' and 'Organic font styles'.",
            "Look at 'Art Deco typography revival' examples.",
            "Study 'Typographic scale best practices' and 'Vertical rhythm in web typography'.",
            "Browse 'Fontfabric blog' or 'Creative Boom font trends' for curated lists and insights.",
        ],
        criteria: [
            'Readability & Legibility: Is all text clear, easy to read, and comfortable for extended reading (for body copy) across all defined sizes and weights?',
            "Visual Hierarchy: Is there a clear, logical, and aesthetically pleasing visual hierarchy that effectively guides the user's attention through different levels of information?",
            "Brand Alignment & Personality: Do the chosen fonts and their application accurately reflect the brand's intended personality, tone of voice, and values?",
            'Versatility & Scalability: Do the selected fonts and defined scale work well across diverse applications, screen sizes, and resolutions? If variable fonts are used, is their potential for adaptation fully realized?',
            'Modernity & Timelessness (or Intentional Trendiness): Does the typography feel contemporary and appropriate for 2025, incorporating relevant trends (like expressive serifs, bold weights, variable fonts) thoughtfully, while also having qualities that suggest longevity, unless a deliberately ephemeral trendy style is required?',
            'Aesthetic Appeal & Harmony: Is the overall typographic system visually engaging, well-balanced, and harmonious with other design elements like color and layout?',
            'Completeness & Detail: Does the specimen comprehensively cover all necessary text elements, their variations (weights, styles), and specifications (size, line height, letter spacing)?',
            'Innovation & Distinction: Does the typography offer a unique or memorable quality that helps differentiate the brand? Does it explore any innovative typographic treatments relevant to 2025?',
        ],
    },
    manager_tokens: {
        guide: [
            'Export all core color palette values, including primary, secondary, accent, and neutral colors. Provide HEX, RGB(A) values, and consider HSL(A) for easier manipulation in code.',
            'Export the full typography scale: font families, weights, sizes for all heading levels (H1-H6), body text, captions, code, etc. Include line heights and letter-spacing values.',
            'Define a consistent spacing scale (e.g., based on a 4px or 8px grid: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px) for margins, paddings, and layout grid gutters.',
            'Define a set of border radius values (e.g., small, medium, large, pill, circular) for UI elements like buttons, cards, and inputs.',
            'Define shadow variables (e.g., subtle, medium, large, inset) specifying properties like x-offset, y-offset, blur radius, spread radius, and color (often with alpha).',
            'Ensure token names are clear, consistent, hierarchical, and semantic (e.g., `color.brand.primary.base`, `font.body.size.medium`, `space.layout.gutter.xl`, `effect.shadow.deep`).',
            'Structure the JSON logically with nested objects for better organization and easier parsing by automated tools.',
            'Include metadata such as versioning and descriptions for tokens where necessary.',
        ],
        ideal: [
            'Tokens are highly comprehensive, covering not just basic values but also aliases or derivative tokens (e.g., `color.text.on-primary` derived for accessibility, `space.inset.squish.m`).',
            "Includes tokens for animation properties like durations, delays, and easing functions, reflecting a brand's motion language.",
            'Tokens for different UI element states (e.g., hover, active, focus, disabled) are explicitly defined for colors, borders, and shadows.',
            'Robustly structured to support advanced theming beyond just light/dark modes, potentially allowing for user-selected themes or seasonal variations.',
            "Reflects modern UI styles such as Glassmorphism (tokens for blur radii, transparency levels) or Neumorphism (specific inner/outer shadow tokens, subtle gradient definitions) if these are part of the brand's aesthetic.",
            'The spacing scale inherently supports responsive design principles and facilitates the creation of complex layouts like Bento Grids or asymmetrical arrangements by providing consistent units.',
            'Naming convention is exceptionally robust, human-readable, and scalable, possibly adhering to established standards like the W3C Design Tokens Community Group format.',
            'AI coding agents can seamlessly consume and interpret these tokens, enabling highly accurate and efficient generation of UI code, potentially including predictive suggestions based on token semantics.',
            'Tokens for specific UI components (e.g., `button.primary.background-color`) are defined, inheriting from global tokens but allowing for component-specific overrides.',
            'Includes tokens for iconography, such as fill/stroke colors and default sizes.',
        ],
        warnings: [
            'Using inconsistent or non-semantic naming conventions for tokens, making them difficult to understand and maintain.',
            "Creating an incomplete set of tokens, which forces developers to hardcode values and undermines the system's integrity.",
            'Over-reliance on literal value tokens (e.g., `blue-500`) without semantic meaning (e.g., `color.action.primary.default`), making refactoring difficult.',
            'Defining tokens that are either too granular (leading to an unmanageable number of tokens) or not granular enough (lacking necessary specificity).',
            'Not considering how tokens will translate or be consumed across different platforms (web, iOS, Android) if a cross-platform system is intended.',
            'Failing to adequately document the purpose, usage context, and intended output of each token or token group.',
            'Lack of a clear process for updating and versioning tokens as the design system evolves.',
            'Creating tokens that are difficult for AI tools to parse or that lack the necessary metadata for intelligent interpretation.',
        ],
        inspiration: [
            "Study 'W3C Design Tokens Community Group Format' for structured token standards.",
            "Review 'Material Design's token system' and 'Apple Human Interface Guidelines' for token examples.",
            "Explore 'IBM Carbon Design System tokens' or 'Shopify Polaris tokens' for enterprise-level examples.",
            "Search for 'Open-source design system token structures' on GitHub.",
            "Read articles on 'Semantic naming conventions for design tokens'.",
            "Look into 'Tools for managing and exporting design tokens' like Figma Tokens, Style Dictionary.",
            "Investigate 'Design tokens for advanced theming and dark mode implementation'.",
            "See how tokens are used to implement 'Glassmorphism design tokens' or 'Neumorphism design tokens'.",
        ],
        criteria: [
            'Completeness & Coverage: Do the tokens comprehensively cover all fundamental design properties (color, typography, spacing, layout, elevation, radii, motion, etc.) needed for the project?',
            'Clarity, Consistency & Semantics: Are token names logical, human-readable, consistently structured, and semantically meaningful, indicating their intended use rather than just literal values?',
            'Scalability & Maintainability: Is the token system well-organized and structured in a way that is easy to update, extend, and maintain as the design system evolves? Does it avoid redundancy?',
            'Machine Readability & Integration: Is the JSON output well-structured, valid, and easily parsable by development tools, build processes, and AI coding agents for automated UI generation?',
            'Theming & Adaptability Support: Do the tokens effectively facilitate theming, particularly for light/dark modes, and potentially other variations, while maintaining brand consistency?',
            'Accuracy & Fidelity: Do the token values precisely match the visual design specifications from the approved color palettes, typography scales, and other design definitions?',
            "Reflection of Modern Trends & Styles: Do the defined tokens enable and encourage the implementation of the brand's chosen 2025 aesthetic trends (e.g., specific shadow types for Neumorphism, blur radii for Glassmorphism, responsive spacing units)?",
            'Documentation & Usability: Are the tokens (or the system they are part of) adequately documented to ensure developers and designers understand their purpose and how to use them correctly?',
        ],
    },
    primary_logo: {
        guide: [
            'Ensure the logo design is simple, memorable, distinctive, and versatile to work across various media.',
            'Design in a vector format (SVG) to ensure infinite scalability without loss of quality.',
            'Consider how the full word-mark will appear and function in common usage contexts like website headers, email footers, and on printed materials.',
            'Test for legibility at various sizes, especially ensuring clarity when scaled down for smaller applications.',
            'Develop clear variations for use on light and dark backgrounds, ensuring optimal contrast and visibility.',
            'Establish clear space guidelines (exclusion zones) around the logo to prevent clutter and maintain its integrity.',
            "If the logo includes typographic elements, ensure they align with the brand's defined typography standards.",
            'The color(s) used must be from the approved core color palette.',
        ],
        ideal: [
            "Embodies **Bold Minimalism**: a design that is visually strong and impactful through its simplicity, efficiently conveying the brand's essence. It's clean, uncluttered, yet commands attention.",
            'Features distinctive **Artistic/Experimental Typography** or a sophisticated **Serif Resurgence** if the logo is primarily type-based, making it unique and aligned with 2025 typographic sensibilities. Examples include modernized serifs with high contrast or custom hand-drawn letterforms.',
            'Could incorporate **Subtle Icons** or abstract elements within the wordmark itself, or be a clean, impactful **Geometric Abstraction** if not purely typographic.',
            'The design language hints at **Dynamic/Motion** capabilities; even if the primary asset is a static SVG, its forms might suggest animation potential or adaptability (responsive logo thinking).',
            'Utilizes **innovative negative space** creatively to add layers of meaning or visual interest without adding complexity.',
            'Colors are thoughtfully chosen from a modern and impactful palette, such as nature-inspired tones, optimistic pastels with bold accents, or a striking monochrome, ensuring strong brand recall.',
            'Reflects **sustainable aesthetics** if relevant to the brand, perhaps through organic forms in the typography, an earthy color palette, or a design that minimizes ink usage in print.',
            "Achieves an 'athletic' feel through bold lines, dynamic shapes, impactful typography, or a sense of movement and energy.",
            'Examples like the Big Cartel logo (hand-drawn, approachable, all-lowercase sans-serif), Kindlife (minimalist abstraction, potential for dynamic color), and the updated Adobe logo (refined minimalism maintaining iconic color) illustrate various facets of modern logo ideals.',
            'It is highly responsive in its core design, meaning that while this is the full wordmark, considerations for how its elements might simplify or re-arrange for different contexts are already embedded in its DNA.',
        ],
        warnings: [
            'Overly complex or detailed designs that lose clarity and impact when scaled down or viewed from a distance.',
            "Relying on trendy visual effects (e.g., excessive gradients not suitable for all applications, complex 3D renderings that don't simplify well) that may quickly look dated or are not versatile for a primary mark.",
            'Poor legibility of typographic elements due to font choice, size, or spacing.',
            'Lack of visual cohesion with a secondary logomark/icon if one exists as part of the brand system.',
            'Using raster graphics (e.g., PNG, JPG) as the master file instead of a vector format (SVG), limiting scalability.',
            'Insufficient color contrast in its variations, making it difficult to see on certain backgrounds.',
            "Ignoring the need for clear space, allowing other elements to crowd and diminish the logo's impact.",
            'Choosing a generic style that fails to differentiate the brand from competitors.',
        ],
        inspiration: [
            "Search 'Bold minimalist wordmark logos 2025' or 'Impactful simple logo designs'.",
            "Explore 'Typographic logo trends 2025' (e.g., expressive serifs, custom sans-serifs, experimental type).",
            "Look up 'Geometric logo design inspiration' or 'Abstract wordmarks'.",
            "Investigate 'Logos with clever negative space' or 'Smart logo designs'.",
            "Find examples of 'Responsive logo systems' to understand adaptability.",
            "Browse 'Brand New logo reviews' on UnderConsideration for critical analysis of recent professional redesigns.",
            "Search 'Sustainable brand logo designs' or 'Eco-conscious logo aesthetics'.",
            "Look for 'Dynamic logo design examples' to see how static marks can be part of a larger motion identity.",
        ],
        criteria: [
            'Memorability & Impact: Is the logo visually striking, distinctive, and easy to recall after a brief glance?',
            'Scalability & Versatility: Does the logo maintain its integrity, legibility, and visual impact when scaled to various sizes and applied across different media (digital headers, print, social media profiles)?',
            'Timelessness & Modernity: Does the logo feel contemporary and aligned with 2025 design sensibilities (e.g., reflecting bold minimalism, unique typography, thoughtful color use) while also possessing enduring qualities that will prevent it from quickly looking dated?',
            "Brand Reflection & Appropriateness: Does the logo accurately and authentically convey the brand's personality, values, industry, and target audience?",
            'Legibility & Clarity: Are all elements, especially typographic components, clear, readable, and unambiguous, even at smaller sizes?',
            'Uniqueness & Originality: Does the logo effectively differentiate the brand from its competitors? Is the design original and ownable?',
            'Technical Execution (SVG): Is the vector file clean, well-constructed, and optimized for various uses? Are light/dark variants effective?',
            'Cohesion with Brand System: If part of a larger system (e.g., with a logomark), does it work harmoniously with other brand elements?',
        ],
    },
    logomark_icon: {
        guide: [
            'Derive the logomark from the primary logo (e.g., a distinctive letter, symbol, or an abstracted form) or create a complementary standalone symbol that is visually linked.',
            'Ensure the design is instantly recognizable and impactful even at very small sizes (e.g., 16x16 pixels for favicons).',
            'Prioritize extreme simplicity and boldness; remove all non-essential details.',
            'Ensure the design works effectively within a square or circular bounding box, as these are common for avatars and app icons.',
            'Design in vector format (SVG) for scalability and crisp rendering at all sizes.',
            'Provide clear variations for use on light and dark backgrounds, maintaining high contrast and visibility.',
            'Test the icon in various UI contexts: as a favicon, social media avatar, app icon, and within mobile navigation elements.',
        ],
        ideal: [
            'A **Bold Minimalist** mark that is highly distilled to its absolute essence, delivering immediate impact and recognition. Think of a powerful, singular statement.',
            'Could be a strong **Geometric Abstraction** that is visually balanced and memorable, or a clever and clear use of **Negative Space** to create an interesting form or secondary meaning.',
            "If derived from a characterful primary logo (e.g., one with hand-drawn elements or unique typography), it successfully captures that **playful or unique essence** in a simplified, iconic form. For instance, Big Cartel's plus sign, if used alone, would be very simple and friendly.",
            'Might be a distinctive **Monogram with personality** if initials are central to the brand, designed with unique ligatures or forms.',
            'The design should be robust enough to potentially be used in **Dynamic/Animated** contexts, such as a subtle loading animation, a hover effect, or as an element in a larger motion graphic. Consider trends like **Motion Logos**.',
            'Even as a static icon, it could subtly hint at **3D qualities** through clever use of shading, perspective, or layering if that aligns with broader trends like Neumorphism or Glassmorphism (though full 3D rendering might be too complex for a truly scalable icon, a 2.5D effect is possible).',
            "Employs colors from the core palette effectively to ensure high visibility, brand recognition, and emotional connection, even at small scales. The Kindlife logo's abstract bird with potential for gradient color is a good example of modern mark.",
            'Highly adaptable and could be suitable for creative interpretations such as **Pixelated versions** if a retro-tech or gaming aesthetic is desired by the brand.',
            "The design considers PWA maskable icon requirements, ensuring key elements are within a 'safe zone'.",
        ],
        warnings: [
            'Including too much detail, intricate lines, or small text that becomes completely illegible or muddy when scaled down to favicon or avatar sizes.',
            'Attempting to shrink the entire primary wordmark into a small square space, which rarely works effectively.',
            'Creating a logomark that lacks any visual connection or consistency with the primary logo, leading to brand confusion.',
            "Poor recognizability due to an overly abstract or generic shape that doesn't stand out.",
            'Using colors with insufficient contrast against various potential background colors, especially in dynamic UI contexts.',
            'Not testing how the icon looks within different operating system masks (e.g., circular, squircle for app icons) if used as a PWA or app icon.',
            'Forgetting to provide versions for both light and dark UI themes, leading to visibility issues.',
        ],
        inspiration: [
            "Search 'Simple iconic logos 2025' or 'Minimalist abstract logomarks'.",
            "Explore 'Geometric logo symbols' and 'Modern monogram designs'.",
            "Look up 'Clever favicons' and 'App icon design trends 2025'.",
            "Investigate 'Logos effectively using negative space in icons'.",
            "Find examples of 'Animated logomarks' or 'Microinteraction icons'.",
            "Study 'Brand identity systems' to see how logomarks relate to primary logos (e.g., on Behance, Identity Designed).",
            "Look for 'Responsive logo suites' showing how primary logos adapt down to iconic marks.",
        ],
        criteria: [
            'Recognizability at Small Sizes: Is the logomark instantly clear, identifiable, and impactful even when displayed at very small dimensions (e.g., browser tabs, mobile app lists)?',
            'Simplicity & Boldness: Is the design stripped down to its most essential, memorable, and visually potent form? Does it avoid unnecessary complexity?',
            'Consistency with Primary Logo: Does the logomark feel like an integral and harmonious part of the overall brand visual identity, clearly related to the primary logo?',
            'Versatility & Adaptability: Does the logomark work effectively in various UI contexts (favicons, avatars, app icons, PWA icons) and adapt well to square or circular masks?',
            'Memorability & Distinction: Is the symbol unique, distinct, and easy for users to remember and associate with the brand?',
            'Appropriateness for UI & Functionality: Does it function effectively as a UI element, aiding navigation or brand identification within digital interfaces? Are light/dark variants effective?',
            'Modern Aesthetic & Trend Relevance: Does the logomark reflect contemporary design approaches such as bold minimalism, geometric clarity, or clever abstraction suitable for 2025?',
            'Technical Quality (SVG): Is the vector file clean, well-constructed, and optimized for crisp rendering across all platforms and resolutions?',
        ],
    },
    homepage_mockup: {
        guide: [
            'Establish the overall visual tone, style, and personality for the website, ensuring it aligns with the brand identity.',
            'Define and apply a clear layout grid system (e.g., traditional column-based, asymmetrical, bento grid) that structures content effectively.',
            'Prominently showcase the primary logo in the header and consider its placement in the footer or other key branding areas.',
            'Demonstrate the full typographic scale in action, including headings (H1-H6), body text, calls to action (CTAs), and any specialized text styles.',
            'Apply the core color palette thoughtfully for backgrounds, text, interactive elements (buttons, links), and decorative accents, ensuring accessibility.',
            'Design a compelling and immersive hero section with high-quality imagery (photography, custom illustration, 3D graphics) and a clear, concise value proposition and primary call to action.',
            'Show examples of button styles (primary, secondary, tertiary) and their visual appearance (though interactive states might be detailed in a separate component sheet).',
            'Clearly indicate the intended style for all imagery to be used across the site (e.g., photographic style, illustration style, use of 3D renders).',
            "Utilize whitespace strategically to create balance, improve readability, guide the user's eye, and emphasize key content areas.",
            'Ensure the design is conceived with responsiveness in mind, even if the mockup is static (e.g., content blocks that can reflow, scalable typography).',
            "Consider the 'above the fold' content carefully to engage users immediately.",
        ],
        ideal: [
            'Showcases a striking and contemporary **Visual Style** for 2025, such as refined Bold Minimalism, edgy Neubrutalism (if appropriate for the brand), sleek Glassmorphism, tactile Neumorphism, or a sophisticated and curated Maximalism.',
            'Employs an innovative and engaging **Layout**, for example, a dynamic Asymmetrical design, a well-structured and modular **Bento Grid**, an explorative Off-Grid approach, or even a Deconstructed Hero Section for high impact.',
            'Features a **Bold and Immersive Hero Section** that captivates users instantly through impactful typography (oversized, expressive), stunning visuals (high-quality photography, unique custom illustrations, or integrated 3D elements), and potentially hints of motion.',
            'Demonstrates the potential for **Kinetic Typography** or other forms of **Motion Design** through its static representation (e.g., showing text elements that suggest animation paths, or incorporating storyboard-like panels for key interactions or scroll-triggered events). Consider also **Dynamic Cursors** or **Micro-interactions** cues.',
            "Utilizes **Whitespace strategically** not just for balance, but to create a sense of 'athleticism' – a dynamic, energetic, and focused user experience.",
            "Integrates **Interactive 3D Objects** as key visual elements or showcases **AI-Generated Imagery** if it aligns with the brand's narrative and desire for unique visuals.",
            'Visually cues **Scroll-triggered Animations** (scrollytelling) or **Parallax Scrolling** effects to create a sense of depth and engagement as the user navigates.',
            'If using illustration, it aligns with 2025 trends like **quirky, characterful, hand-drawn, or abstract styles** that add personality and warmth. Consider the **Scrapbook Aesthetic** for a more tactile feel.',
            'The color palette is expertly applied to establish mood, guide user attention (e.g., through **Bold Color Blocking**), and could feature **Complex Gradients** (aurora, chromatic) or **Nature-inspired Tones** for authenticity.',
            'The overall aesthetic is exceptionally cohesive, ensuring the logo, typography, colors, imagery, and layout work harmoniously to tell a compelling brand story.',
            'May reflect **Art Deco Revival** elements (geometric patterns, luxurious feel) or **Nostalgic Influences** (e.g., 90s/Y2K aesthetics, retro-futurism) if these are part of the brand concept.',
            'The Big Cartel website, with its approachable, clean, and modular design combined with friendly typography and authentic imagery, serves as an example of harmonizing brand personality with web aesthetics.',
            "Considers **Experimental Navigation** or **Huge Navigation/Footers** if it enhances user experience and aligns with the brand's bold stance.",
        ],
        warnings: [
            'Overcrowding the homepage with too many competing elements, leading to cognitive overload and a lack of clear focus.',
            'Inconsistent application of established branding guidelines (logo usage, color palette, typography hierarchy).',
            'Ignoring fundamental principles of visual hierarchy, making it difficult for users to scan content and identify key actions.',
            'Using low-quality, generic, or poorly chosen placeholder imagery that fails to convey the intended brand message or aesthetic quality.',
            'Designing the mockup for a single, fixed screen size without considering how elements will adapt or reflow on different devices (lack of responsive thinking).',
            "Choosing a highly specific or niche visual trend that clashes with the brand's core identity, values, or target audience, or that may date very quickly.",
            'Ineffective or insufficient use of whitespace, resulting in a design that feels cluttered, unbalanced, or difficult to read.',
            'Creating significant accessibility barriers through poor color contrast, unreadable font choices, or overly complex interactive cues that are not intuitive.',
            'Focusing too much on visual flair (e.g., excessive animations suggested) at the expense of performance and usability.',
        ],
        inspiration: [
            "Browse 'Awwwards Site of the Day/Year' and filter by relevant styles or industry if possible for cutting-edge examples.",
            "Explore 'Siteinspire gallery' and search for specific trends like 'minimalist websites 2025,' 'asymmetrical layouts,' 'bento grid design,' 'brutalist web design.'",
            "Search design blogs and publications (e.g., Creative Bloq, Smashing Magazine, Webdesigner Depot, Designmodo) for 'web design trends 2025 showcases' or 'best website designs 2025.'",
            "Look for 'Hero section design inspiration 2025' to see impactful above-the-fold treatments.",
            "Investigate 'Neubrutalism website examples' or 'Glassmorphism UI design' for specific stylistic approaches.",
            'Study websites of brands known for strong design (e.g., Apple for minimalism and motion, though specific 2025 examples for all trends are elusive).',
            "Explore Behance and Dribbble for curated collections and popular shots tagged with 'web design trends 2025', 'UI/UX inspiration'.",
            'Look at how brands like Big Cartel integrate their unique logo style into their overall website aesthetic.',
        ],
        criteria: [
            'Visual Impact & Aesthetic Appeal: Is the design immediately engaging, visually appealing, and modern? Does it successfully implement chosen 2025 aesthetic trends (e.g., Glassmorphism, Bold Minimalism, Neubrutalism)?',
            'Brand Consistency & Reflection: Does the mockup accurately reflect and powerfully reinforce the overall brand identity, including the consistent application of the logo, color palette, and typography? Does it convey the intended brand personality?',
            "Clarity & Visual Hierarchy: Is information presented in a clear, organized manner with a strong visual hierarchy that intuitively guides the user's eye to the most important content and calls to action?",
            'Layout Effectiveness & Innovation: Is the chosen layout (e.g., asymmetrical, bento grid, off-grid, traditional) used effectively to structure content, enhance usability, and create visual interest? Does it show innovation?',
            'Imagery Style & Quality: Is the chosen style for imagery (photography, illustration, 3D renders, AI-generated) appropriate for the brand, high quality, and impactful in conveying the message?',
            'Call to Action (CTA) Prominence & Effectiveness: Are the primary CTAs clear, compelling, and strategically placed to encourage user interaction?',
            'Overall Cohesion & Harmony: Do all design elements (typography, color, imagery, spacing, layout, UI components) work together harmoniously to create a unified and polished visual experience?',
            "Innovation & 'Athletics': Does the design feel dynamic, bold, and visually stimulating? Does it incorporate elements like motion (even if hinted at), impactful typography, or immersive visuals effectively?",
            'Strategic Use of Whitespace: Is whitespace used effectively to improve readability, create balance, emphasize key elements, and contribute to the overall aesthetic?',
            'Fitness for Purpose: Does the homepage design effectively serve its primary goals (e.g., introduce the brand, drive conversions, provide key information)?',
        ],
    },
    homepage_content_mockup: {
        guide: [
            "Extend the visual style established in the 'homepage_mockup' (above the fold) consistently to all below-the-fold content sections.",
            'Demonstrate how different types of content (e.g., feature blurbs, testimonials, blog post summaries, product grids) are presented using cards, lists, or other layout modules.',
            'Showcase the application of typography for longer text sections, ensuring readability and maintaining visual hierarchy.',
            "Integrate graphics, spot illustrations, or photography in a way that supports the content and aligns with the brand's imagery style.",
            'Define clear visual separation between different content sections using whitespace, color blocks, or subtle dividers/textures.',
            'Illustrate the design of common UI elements that appear in content sections, such as secondary buttons, links, or accordions.',
            'Ensure the layout effectively uses the established grid system (e.g., column grid, asymmetrical balance, or bento-style modules) to organize diverse content.',
            'Pay attention to the flow and rhythm of the page as the user scrolls, ensuring a balanced and engaging experience.',
        ],
        ideal: [
            'Seamlessly continues the narrative and visual impact of the hero section, creating a cohesive and engaging full-page experience.',
            'Effectively utilizes 2025 layout trends such as **Bento Grids** for organizing diverse content modules, or an elegant **Asymmetrical Layout** to create visual interest and guide the eye.',
            'Showcases beautifully designed **Cards** that might incorporate elements of **Glassmorphism** (subtle transparency, blur) or **Neumorphism** (soft, tactile feel), if aligned with the overall aesthetic.',
            "Integrates **custom Spot Illustrations** or high-quality **AI-generated Imagery** that reflect the brand's personality (e.g., quirky, abstract, nature-inspired) and enhance content understanding.",
            'Demonstrates strategic use of **Whitespace** to give content room to breathe, improve readability, and create a sophisticated, uncluttered feel, even with dense information.',
            'Typography for body content is exceptionally readable and well-styled, perhaps using **expressive serifs** for pull quotes or section intros, balanced with clean sans-serifs for main text.',
            "Incorporates **subtle animations or scroll-triggered effects (scrollytelling)** suggested through static cues, making the content feel dynamic and 'athletic'.",
            'Color palette is applied thoughtfully to define sections, highlight key information, and maintain visual harmony, possibly using **bold color blocking** or **nature-inspired tones**.',
            'If a **Maximalist** approach is chosen, below-the-fold content shows rich textures, layered elements, and bold graphic combinations in a curated, intentional way.',
            'The design might feature **Deconstructed Layouts** or **Overlapping Elements** to add depth and a contemporary edge.',
        ],
        warnings: [
            'Inconsistent application of the visual style established in the above-the-fold mockup, leading to a disjointed page experience.',
            'Overcrowding sections with too much information or too many visual elements, resulting in cognitive overload.',
            'Poor visual hierarchy within content sections, making it difficult for users to scan and find relevant information.',
            "Generic or low-quality graphics and imagery that detract from the brand's perceived quality.",
            'Insufficient whitespace, leading to a cramped and overwhelming layout.',
            'Readability issues with body text due to poor font choices, sizing, or color contrast.',
            'Layouts that feel static or uninspired, failing to maintain user engagement as they scroll.',
            'Ignoring how different content modules will reflow or adapt on responsive screens, even in a static mockup.',
        ],
        inspiration: [
            "Search 'Long-scrolling website design inspiration 2025'.",
            "Explore 'Bento grid content layouts' or 'Asymmetrical web page design'.",
            "Look for 'Website card design trends 2025' (e.g., glassmorphic cards, minimalist cards).",
            "Find examples of 'Effective use of whitespace in web design'.",
            "Study 'Websites with beautiful custom illustrations' or 'AI-enhanced web content visuals'.",
            "Browse 'Scrollytelling website examples' for dynamic content presentation ideas.",
            "Look at how leading brands structure their 'Features', 'Solutions', or 'Learn More' sections on their homepages.",
        ],
        criteria: [
            "Visual Cohesion & Consistency: Does the below-the-fold content seamlessly extend the aesthetic (color, typography, imagery style, UI elements) established in the 'homepage_mockup'?",
            'Content Organization & Layout: Is diverse content (cards, text blocks, graphics) organized clearly and effectively using the chosen layout strategy (e.g., bento, asymmetry, grid)? Does it maintain visual interest?',
            'Readability & Hierarchy: Is longer-form text highly readable? Is there a clear visual hierarchy within each content section and across the entire scrollable page?',
            'Engagement & Flow: Does the design encourage continued scrolling and exploration? Is there a good visual rhythm and flow between different content sections?',
            'Effective Use of Visuals: Are graphics, illustrations, and imagery used purposefully to enhance understanding, add visual appeal, and break up text effectively?',
            'Whitespace Management: Is whitespace used strategically to prevent clutter, improve focus, and create a balanced composition throughout the extended page?',
            'Application of Trends: Are relevant 2025 design trends (e.g., specific card styles, layout approaches, illustration styles) thoughtfully applied to enhance the user experience and brand perception?',
            'Fitness for Purpose: Does the below-the-fold content effectively communicate its intended messages and guide users towards desired actions or information?',
        ],
    },
    component_sheet: {
        guide: [
            'Document all common UI components: buttons (primary, secondary, tertiary, text, icon-only), form fields (text input, textarea, select, checkbox, radio button, toggle), cards, modals, tooltips, notifications, navigation elements (tabs, breadcrumbs, pagination).',
            'Clearly show all interactive states for each component: default, hover, focus, active, disabled.',
            'Ensure components are visually consistent with the homepage mockup and overall brand identity (color, typography, spacing, border-radius, shadows).',
            'Specify dimensions, padding, and margin for components where critical.',
            'Use the approved color palette and typography scale consistently.',
            'Organize the sheet logically for easy reference by designers and developers.',
            'Consider accessibility for all components (e.g., sufficient touch target sizes, clear focus states, ARIA attributes if implied for dev).',
            'If applicable, show responsive variations of components or how they adapt to different container sizes.',
        ],
        ideal: [
            'Components reflect advanced 2025 UI styles like **Glassmorphism** (frosted glass effect, transparency, blur on cards or modals), **Neumorphism** (soft UI with subtle extruded/indented effects, minimal contrast if carefully managed for accessibility), or a clean **Bold Minimalism**.',
            'Interactive states showcase engaging **Micro-interactions** (e.g., subtle animations, tactile feedback cues) that enhance usability and delight.',
            'Form fields and buttons are designed with a high degree of clarity and usability, perhaps incorporating **AI-driven UI suggestions** for optimal layout or input types.',
            'Cards might be designed for **Bento Grid layouts**, being modular and self-contained units of information.',
            'If the brand uses a **Neubrutalist** style, components would reflect this with raw, chunky outlines, high contrast, and perhaps unconventional hover states.',
            'Components are designed to be inherently accessible, with clear visual cues for all states and adherence to contrast guidelines, potentially using **AI tools for accessibility checking** during design.',
            'The sheet includes variants for dark mode if applicable, demonstrating how components adapt their styling.',
            'Shadows and layering are used effectively to create depth and visual hierarchy, potentially inspired by **spatial UI concepts** (even in 2D).',
            "The design of components, like buttons, uses bold typography and impactful color from the palette for an 'athletic' and confident feel.",
            'Custom icons used within components are consistent with the overall **System UI Icon Library**.',
        ],
        warnings: [
            'Inconsistent styling between different components or with the homepage mockup.',
            'Missing states (especially hover, focus, active, disabled) for interactive elements.',
            'Poor accessibility: low contrast, unclear focus indicators, insufficient touch target sizes.',
            'Overly complex component designs that are difficult to implement or use.',
            'Not considering how components will behave with different content lengths (e.g., text overflow in buttons or cards).',
            'Designing components in isolation without considering their context within larger page layouts.',
            "Using trendy styles that compromise usability (e.g., Neumorphism implemented with such low contrast it's unusable).",
            'Lack of responsiveness in component design thinking.',
        ],
        inspiration: [
            "Search 'UI component libraries examples' (e.g., Material Design, Ant Design, Bootstrap).",
            "Explore 'Figma UI kits' or 'Sketch UI kits' for common component examples.",
            "Look for 'Glassmorphism UI components' or 'Neubrutalist UI elements'.",
            "Study 'Accessible component design examples'.",
            "Browse 'UI design patterns' for common solutions to interface challenges.",
            "See 'Microinteraction examples in UI design'.",
            "Check 'Bento UI components' or 'Modular card design inspiration'.",
        ],
        criteria: [
            'Visual Consistency: Are all components styled consistently with the homepage mockup, brand guidelines (color, typography, spacing, radii, shadows), and each other?',
            'Completeness of States: Are all necessary interactive states (default, hover, focus, active, disabled) clearly defined and visually distinct for every interactive component?',
            'Usability & Clarity: Are the components intuitive to use? Is their purpose clear? Are interactive elements easily identifiable?',
            'Accessibility: Do components meet accessibility standards (e.g., color contrast for text, clear focus indicators, adequate touch target sizes)?',
            'Trend Relevance & Modernity: Do the components reflect current 2025 UI trends (e.g., Glassmorphism, Neumorphism if applicable, refined minimalism, thoughtful microinteractions) appropriately for the brand?',
            'Responsiveness & Adaptability: Are components designed to function well and look good across different screen sizes or within various containers (even if shown on a static sheet, the design should imply this)?',
            'Harmony with Overall Design: Do the components feel like a natural extension of the overall website aesthetic and contribute positively to the user experience?',
            'Attention to Detail: Is there evidence of careful consideration for details like padding, alignment, border styles, and the visual feedback provided by different states?',
        ],
    },
    content_page_mockup: {
        guide: [
            'Design the layout for displaying lists of content (e.g., blog posts, products, articles, resources) using either card-based views or list views.',
            'Showcase the detailed design of individual cards or list items, including imagery, titles, excerpts, metadata (date, author, tags), and CTAs.',
            'Incorporate UI elements for content interaction and organization, such as tag filters, category selectors, search bars, and sort options.',
            'Clearly design pagination controls (e.g., page numbers, next/previous buttons) for navigating through multiple pages of content.',
            "Apply the brand's typography, color palette, and spacing rules consistently, ensuring readability and visual hierarchy.",
            "Ensure content elements are well-aligned and the layout is balanced, whether it's a traditional grid, asymmetrical, or other modern layout.",
            'Consider responsive behavior: how cards or list items will reflow on different screen sizes, and how filter/pagination controls will adapt.',
        ],
        ideal: [
            'The layout for content display is innovative and engaging, perhaps utilizing a **Bento Grid** for varied content types or a sophisticated **Asymmetrical Layout** for visual dynamism.',
            '**Cards** are meticulously designed, potentially featuring **Glassmorphism** (for a sleek, layered look), **Neumorphism** (for a soft, tactile feel), or **Bold Minimalism** with strong typographic hierarchy and impactful imagery. Card hover states could include subtle **microinteractions** or zoom effects.',
            '**Tag filters and search/filter controls** are intuitive, visually appealing, and perhaps incorporate modern UI elements like stylized toggles or dynamic input fields. The presentation could be part of an **experimental navigation** approach if the brand is edgy.',
            '**Pagination controls** are clear and easy to use, possibly with custom styling or subtle animations on interaction.',
            'Typography effectively distinguishes between titles, excerpts, metadata (e.g., using smaller, lighter text for tags or dates), and calls to action, creating a rich but scannable page.',
            'Whitespace is generously used to prevent visual clutter, especially when displaying multiple cards or list items, making the page feel airy and focused.',
            'If the content includes user-generated elements or diverse media, the design gracefully accommodates this variety while maintaining consistency.',
            'The page might subtly hint at **AI-powered content recommendations** or personalized filtering options through its UI.',
            "The overall aesthetic aligns with the 'athletic' feel of the brand through dynamic card arrangements, bold visual cues for interaction, or impactful use of color for categories/tags.",
        ],
        warnings: [
            'Overly cluttered pages with too many cards or list items per view, leading to cognitive overload.',
            'Inconsistent card or list item design, making the page look messy and unprofessional.',
            'Poorly designed filters or pagination that are confusing or difficult to use.',
            'Insufficient visual hierarchy within cards/list items, making it hard to quickly scan for relevant information.',
            'Readability issues due to small text sizes for metadata or poor contrast.',
            'Layouts that do not adapt well to responsive screens, causing content to become cramped or misaligned.',
            "Generic or uninspired card designs that fail to engage the user or reflect the brand's quality.",
            "Neglecting empty states (e.g., 'No results found' for filters) or loading states for content.",
        ],
        inspiration: [
            "Search 'Blog list page design examples 2025' or 'Product grid layout inspiration'.",
            "Explore 'Modern card UI design trends' (e.g., cards with gradients, minimalist cards, interactive cards).",
            "Look for 'Filter and sort UI design best practices'.",
            "Find 'Creative pagination design examples'.",
            "Study 'Content-heavy website layouts' on Awwwards or Siteinspire.",
            "Browse 'Bento grid for content showcase' or 'Asymmetrical list view design'.",
            'Look at e-commerce category pages or digital publication archive pages for ideas.',
        ],
        criteria: [
            'Information Architecture & Scannability: Is the content (cards/list items) organized logically? Can users easily scan and find relevant information quickly due to clear visual hierarchy and layout?',
            'Card/List Item Design Effectiveness: Are individual cards or list items well-designed, providing the right amount of information, clear typography, appropriate imagery, and compelling CTAs (if any)?',
            'Filter & Sort Functionality Design: Are the tag filters, search controls, and sort options intuitive to use, visually clear, and do they effectively help users refine content?',
            'Pagination & Navigation Clarity: Are pagination controls easy to understand and use for navigating through large sets of content?',
            "Visual Consistency & Brand Adherence: Does the page maintain visual consistency with the homepage and other brand elements (typography, color, spacing, component styles from 'homepage_content_mockup')?",
            'Layout & Whitespace: Is the layout (grid, list, bento, etc.) effective for the type and amount of content? Is whitespace used appropriately to avoid clutter and enhance readability?',
            'Responsiveness Consideration: Does the design conceptually support adaptation to different screen sizes, ensuring usability on mobile and tablet devices?',
            "Modern Aesthetic & Trend Application: Does the page incorporate modern design trends (e.g., card styles, layout approaches) in a way that enhances the user experience and aligns with the brand's 2025 vision?",
        ],
    },
    pricing_page_mockup: {
        guide: [
            'Clearly present different pricing plans using distinct cards or columns.',
            'Highlight key features and limitations for each plan to facilitate comparison.',
            "Include prominent and clear Calls to Action (CTAs) for each plan (e.g., 'Sign Up', 'Get Started', 'Choose Plan').",
            'If offering monthly/annual billing options, design an intuitive toggle or selector for users to switch between them, clearly showing price differences.',
            'Design a readable and easy-to-scan comparison table if there are many features to compare across plans.',
            'Incorporate trust signals such as customer logos, testimonials, or security badges.',
            "Use the brand's typography and color palette to create a clear visual hierarchy and draw attention to important information (like the most popular plan or key benefits).",
            'Ensure the layout is clean, uncluttered, and helps users make an informed decision without feeling overwhelmed.',
        ],
        ideal: [
            'Pricing plan cards are visually engaging and easy to compare, perhaps using **Bold Minimalism** with clear typographic hierarchy or subtle **Glassmorphism/Neumorphism** effects to make them feel premium and distinct.',
            "A specific plan might be visually emphasized as 'Most Popular' or 'Best Value' using contrasting colors, slightly larger size, or a distinctive badge, aligning with an 'athletic' (direct, impactful) approach.",
            'The **monthly/annual toggle** is highly intuitive, with clear visual feedback and perhaps a satisfying **microinteraction** upon switching.',
            'The **comparison table** (if used) is exceptionally clear, scannable, and might use icons from the **System UI Icon Library** for features, aiding quick comprehension. The table design itself could be an area for modern aesthetic application.',
            '**CTA blocks** are prominent, using bold brand colors and compelling typography to drive conversions.',
            'Trust badges and testimonials are seamlessly integrated into the design, enhancing credibility without cluttering the layout.',
            'The page layout might use an **Asymmetrical balance** or clean **Grid system** to present information hierarchy effectively, guiding the user towards a decision.',
            'If the brand has a **sustainable or nature-inspired** theme, this could be subtly reflected in the color choices or iconography on the pricing page.',
            'The overall page feels trustworthy, transparent, and makes the value proposition for each plan exceptionally clear.',
            'Could incorporate **interactive elements** like sliders for usage-based pricing or feature checklists that update dynamically (suggested through static design).',
        ],
        warnings: [
            'Pricing information that is confusing, hidden, or difficult to understand, leading to user frustration and abandonment.',
            'Overly cluttered design with too much text or too many features listed, making it hard to compare plans.',
            'Weak or inconspicuous Calls to Action.',
            'Inconsistent styling of pricing cards or comparison table elements.',
            'Lack of clear differentiation between plans, making it hard for users to choose.',
            'Not clearly indicating the benefits of choosing a higher-tier or annual plan.',
            'Hidden fees or unclear terms that erode trust.',
            'Poor mobile responsiveness, making the pricing table or plan cards unusable on smaller screens.',
        ],
        inspiration: [
            "Search 'SaaS pricing page design examples 2025' or 'Best subscription pricing tables'.",
            'Look at pricing pages of successful B2B and B2C companies in similar industries.',
            "Explore 'UI design for comparison tables' and 'Pricing plan card design'.",
            "Find 'Toggle switch UI design inspiration'.",
            'Study how trust signals (badges, testimonials) are effectively integrated on pricing pages.',
        ],
        criteria: [
            'Clarity & Transparency: Is the pricing information for each plan clear, easy to understand, and transparent (no hidden costs suggested)?',
            'Comparability: Does the design make it easy for users to compare different plans and their features effectively?',
            'Visual Hierarchy & Emphasis: Is there a clear visual hierarchy guiding users to key information? If a plan is recommended, is it effectively highlighted without being misleading?',
            'Call to Action Effectiveness: Are the CTAs for each plan prominent, clear, and compelling?',
            'User Interface for Options (e.g., Toggle): If there are options like monthly/annual billing, is the UI for selecting them intuitive and does it clearly reflect price changes?',
            'Trust & Credibility: Does the page incorporate trust signals effectively to build user confidence?',
            "Brand Consistency: Does the pricing page adhere to the brand's visual identity (colors, typography, style from 'homepage_content_mockup')?",
            'Layout & Readability: Is the layout clean, uncluttered, and is all text easily readable? If a comparison table is used, is it scannable and well-formatted?',
            'Modern Aesthetic: Does the page feel modern and align with 2025 design trends appropriate for a pricing context (e.g., clear card design, intuitive controls)?',
        ],
    },
    product_page_mockup: {
        guide: [
            'Design an engaging hero section specific to the product/feature, including a clear title, benefit-oriented tagline, and relevant imagery or product shot.',
            'Showcase product screenshots or visuals effectively, perhaps using a carousel, gallery, or inline placement.',
            'Organize detailed information using tabsets or accordions if necessary to prevent overwhelming the user.',
            "Create clear and visually distinct 'feature call-out' sections that highlight key benefits or functionalities, often pairing icons with short descriptive text.",
            "Include one or more prominent Calls to Action (CTAs) relevant to the product/feature (e.g., 'Buy Now', 'Request a Demo', 'Learn More').",
            "Maintain brand consistency in typography, color, and overall style, ensuring it aligns with the 'homepage_content_mockup'.",
            'Structure the page with a clear visual hierarchy, guiding the user through the information logically.',
            'Consider a multi-column layout for desktop and how it will adapt responsively for tablet and mobile views.',
        ],
        ideal: [
            'The hero section is highly **immersive and product-focused**, potentially using **interactive 3D models** of the product (represented statically), high-quality video stills, or exceptionally detailed photography/renders. The typography is bold and benefit-driven.',
            'The **screenshots carousel** is sleek, perhaps with subtle animations, **Glassmorphism** overlays for controls, or unique transition effects. Device mockups, if used, are modern and unobtrusive.',
            '**Tabsets or accordions** are styled according to modern UI trends, with clear visual cues for active states and smooth transitions (implied). They help manage information density effectively.',
            '**Feature call-outs** are visually engaging, using custom icons from the **System UI Icon Library**, impactful typography, and perhaps short animated Lottie files (represented statically) to illustrate benefits. These could be arranged in a **Bento Grid** or an interesting **Asymmetrical layout**.',
            'CTAs are unmissable, using bold brand colors and persuasive copy, and might feature subtle **microinteractions** on hover.',
            'The layout makes excellent use of **whitespace** to highlight key product information and create a premium feel.',
            'If the product has a physical or tactile quality, the design might subtly incorporate **Neumorphic** elements or textures that evoke this.',
            "The page tells a compelling story about the product/feature, guiding the user from initial interest to conversion with an 'athletic' sense of purpose and clarity.",
            'Could integrate **AI-generated visuals** for feature explanations or showcase **AI-driven features** of the product itself with innovative visual cues.',
            'The design considers **Scroll-triggered animations (scrollytelling)** to reveal features or benefits sequentially as the user explores the page.',
        ],
        warnings: [
            'Overwhelming the user with too much technical jargon or too many features at once without clear organization.',
            'Poor quality or uninformative product screenshots/visuals.',
            'Clunky or confusing navigation within carousels, tabsets, or accordions.',
            'Weak or hidden Calls to Action.',
            'Inconsistent styling compared to other pages or brand elements.',
            "Layout that doesn't adapt well to different screen sizes, making information hard to access on mobile.",
            'Feature call-outs that are generic or fail to highlight unique selling propositions.',
            'Slow page load times due to unoptimized images or heavy scripts for interactive elements.',
        ],
        inspiration: [
            "Search 'Best product detail page design 2025' or 'SaaS feature page examples'.",
            'Look at product pages from leading e-commerce sites (e.g., Apple, Sonos) or software companies (e.g., Figma, Slack).',
            "Explore 'Screenshot carousel UI design' and 'Tab and accordion design patterns'.",
            "Find 'Creative feature call-out examples'.",
            "Study how websites use 'Interactive 3D product views' or 'Video for product showcases'.",
        ],
        criteria: [
            'Product/Feature Clarity: Does the page clearly and effectively communicate the value, benefits, and key functionalities of the product or feature?',
            'Visual Engagement & Storytelling: Is the page visually engaging? Does it use imagery, screenshots, and layout to tell a compelling story about the product?',
            'User Experience of Interactive Elements: Are interactive elements like carousels, tabsets, or accordions intuitive to use and do they effectively organize information?',
            'Call to Action Prominence & Effectiveness: Are CTAs clear, compelling, and strategically placed to guide the user towards the desired next step?',
            'Information Hierarchy & Readability: Is detailed information well-organized with a clear visual hierarchy? Is all text easily readable?',
            "Brand Consistency: Does the page maintain strong brand consistency in terms of visual style, typography, color, and tone, aligning with the 'homepage_content_mockup'?",
            'Layout & Responsiveness: Is the layout (e.g., multi-column) effective for presenting product information? Does the design conceptually support responsiveness across devices?',
            'Modern Aesthetic & Innovation: Does the page incorporate modern design trends and potentially innovative ways of showcasing product information, making it feel current for 2025?',
        ],
    },
    authentication_page_mockup: {
        guide: [
            'Design clear and simple forms for sign-in and sign-up processes.',
            'Use minimal navigation, often just the primary logo and perhaps essential legal links (Privacy Policy, Terms of Service).',
            "Clearly display all form field states: default, active/focus, error, success. Utilize components from the 'component_sheet'.",
            'Provide clear, concise, and helpful error messaging directly associated with the relevant field or form.',
            'Ensure input labels are always visible and associated with their respective fields.',
            "Design prominent and clear primary action buttons (e.g., 'Sign In', 'Create Account').",
            'Include options for social sign-in if applicable, using official brand icons for social platforms.',
            'Ensure sufficient contrast for all text and UI elements for accessibility.',
            'Maintain brand consistency through logo placement, color usage, and typography, even with minimal UI.',
        ],
        ideal: [
            'The authentication flow embodies **Bold Minimalism**, focusing on extreme clarity and ease of use, with no distracting elements. The **Primary Logo** is often the sole branding element.',
            'Form fields and buttons from the **Component Sheet** are impeccably styled, perhaps with subtle **Neumorphic** depth or clean **Glassmorphic** input backgrounds if that aligns with a premium/modern feel, while ensuring high usability.',
            '**Error messaging** is not only clear but also human-centered and reassuring, possibly using a slightly softer tone or a guiding icon.',
            'The layout makes excellent use of **whitespace** to create a calm, focused environment for these critical tasks.',
            'If the brand uses a **quirky or characterful** illustration style, a very simple, on-brand spot illustration might be used to add personality without distraction (e.g., for a success state or a general welcome).',
            'Typography is exceptionally clear, with generous sizing for input fields and labels, ensuring readability.',
            'Loading states for form submissions are indicated by a sleek, on-brand **Loading Indicator**.',
            'The transition between sign-in and sign-up options is seamless and intuitive.',
            'Security and trust are subtly reinforced through clean design, clear legal links, and perhaps reassuring microcopy.',
            "The page provides a glimpse of the brand's 'athletic' efficiency through a streamlined, no-friction process.",
        ],
        warnings: [
            'Cluttered or confusing forms with too many fields or unclear instructions.',
            "Poor error handling: vague messages, errors shown far from the input, or no clear indication of what's wrong.",
            'Weak or inconsistent branding, making the page feel untrustworthy or disconnected from the main site.',
            'Accessibility issues: low contrast, missing labels, poor keyboard navigation for forms.',
            'Distracting background images or animations that interfere with the task-focused nature of auth pages.',
            'Insecure practices suggested by the design (e.g., asking for unnecessary information too early).',
            'Forgetting to style all form field states (default, focus, error, disabled), leading to an incomplete user experience.',
        ],
        inspiration: [
            "Search 'Sign in page design examples 2025' or 'User registration UI best practices'.",
            'Look at authentication flows from well-known and trusted platforms (e.g., Google, Apple, Stripe).',
            "Explore 'Minimalist form design inspiration'.",
            "Find 'Error message UI design examples'.",
            "Study 'Social login button design guidelines'.",
        ],
        criteria: [
            'Clarity & Simplicity: Is the sign-in/sign-up process exceptionally clear, simple, and focused, minimizing cognitive load on the user?',
            "Usability of Forms: Are form fields well-labeled, easy to interact with, and are all states (default, focus, active, error, success, disabled) clearly designed and visually distinct, consistent with the 'component_sheet'?",
            'Error Handling & Messaging: Is error messaging clear, concise, helpful, and visually associated with the problematic input? Is it presented in a non-alarming way?',
            'Brand Consistency (Minimal): Even with minimal navigation, does the page feel on-brand through the use of the primary logo, typography, and color palette?',
            'Trust & Security Cues: Does the design inspire trust and a sense of security (e.g., clear links to legal policies, professional appearance)?',
            'Accessibility: Are forms and interactive elements accessible (e.g., sufficient contrast, clear focus states, proper labeling)?',
            'Efficiency of Flow: Does the design support an efficient and straightforward authentication process?',
            'Visual Appeal (within constraints): While functional, is the page aesthetically pleasing and does it avoid a purely utilitarian or uninviting look?',
        ],
    },
    dashboard_page_mockup: {
        guide: [
            'Design the main application shell, including a clear navigation structure (e.g., sidebar, top navigation).',
            'Showcase how breadcrumbs are used for indicating user location within the app.',
            'Design data tables with clear headers, readable row data, and consider elements like sorting indicators, pagination, and action buttons per row.',
            'Illustrate the style and placement of toast notifications for user feedback (success, error, warning, info).',
            'Include an example of an empty-state illustration and message for sections that may not yet have data, making it engaging and informative.',
            "Apply brand colors, typography, and icons (from 'logomark_icon' and 'system_icon_library') consistently throughout the dashboard UI, using components from the 'component_sheet'.",
            'Prioritize information hierarchy and scannability, especially for data-dense views.',
            'Ensure the layout is clean, organized, and provides a focused workspace for the user.',
        ],
        ideal: [
            'The dashboard layout is highly efficient and customizable, perhaps utilizing a **Bento Grid** to display various data widgets or modules, allowing for personalization (a growing AI-driven trend).',
            'Navigation (sidebar/top bar) is intuitive, perhaps incorporating **Glassmorphism** for a sleek, modern feel, or **Bold Minimalism** for clarity. The **Logomark Icon** might be prominently used in a collapsed sidebar.',
            '**Data tables** are exceptionally clear, readable, and might feature subtle **microinteractions** for sorting or filtering, with clean visual styling for rows and headers. Alternating row colors or subtle dividers enhance scannability.',
            '**Toast notifications** are unobtrusive yet noticeable, using brand colors effectively for different states and perhaps a smooth animation on entry/exit.',
            'The **empty-state illustration** is on-brand, creative (as per **Spot Illustrations** style), and provides clear guidance or encouragement to the user.',
            "The overall UI feels 'athletic' – responsive, efficient, and empowering for the user.",
            'If the app deals with complex data, visualizations (charts, graphs) are integrated seamlessly and styled according to modern data viz trends (clean, interactive, possibly with **AI-driven insights** highlighted).',
            '**Dark mode variant** of the dashboard is exceptionally well-executed, providing a comfortable and focused environment for data-heavy tasks.',
            'Elements of **Neumorphism** might be used for controls or cards if a soft, tactile UI is desired and can be made accessible.',
            'The design subtly hints at **AI-powered features** within the dashboard, such as predictive analytics or personalized summaries, reflected in the UI.',
        ],
        warnings: [
            'Overly cluttered dashboard with too much information presented at once, leading to cognitive overload.',
            'Confusing or inconsistent navigation structure.',
            'Poorly designed data tables that are hard to read, scan, or interact with.',
            'Toast notifications that are too intrusive, disappear too quickly, or lack clear messaging.',
            'Generic or unhelpful empty states.',
            "Inconsistent application of styling (colors, typography, icons, components from 'component_sheet') across different dashboard sections.",
            'Accessibility issues, especially with data visualization (e.g., relying on color alone) or complex interactive elements.',
            'Slow performance due to overly complex UI elements or unoptimized data loading and display.',
        ],
        inspiration: [
            "Search 'SaaS dashboard UI design examples 2025' or 'Admin panel design inspiration'.",
            'Look at dashboards from well-known analytics, project management, or finance applications.',
            "Explore 'Data table UI design best practices' and 'Chart and graph design for dashboards'.",
            "Find 'Toast notification UI examples' and 'Creative empty state design'.",
            "Study 'Sidebar navigation design patterns' and 'Breadcrumb UI examples'.",
            "Look for 'Bento grid dashboard layouts'.",
        ],
        criteria: [
            'Information Hierarchy & Clarity: Is information presented in a clear, organized, and hierarchical manner, allowing users to quickly find what they need and understand complex data?',
            'Navigation & Usability: Is the navigation (sidebar, breadcrumbs, etc.) intuitive and easy to use? Can users efficiently move through different sections of the application?',
            'Data Display Effectiveness (Tables, Charts): Are data tables, charts, and other visualizations clear, readable, and effective in conveying information? Are they interactive where appropriate?',
            "Component Consistency & Application: Are UI components (from 'component_sheet') used consistently and correctly throughout the dashboard? Do they function as expected?",
            'Feedback Mechanisms (Toasts, States): Are toast notifications and other feedback mechanisms clear, timely, and appropriately styled for different message types (success, error, etc.)?',
            "Empty State Design: Are empty states thoughtfully designed, providing helpful guidance or an engaging visual (using 'spot_illustrations' style) rather than just a blank space?",
            'Brand Integration: Does the dashboard maintain brand consistency through the use of the logo/logomark, color palette, typography, and system icons, even in a data-rich environment?',
            'Layout & Organization (App Shell): Is the overall app shell (sidebar, header, content area) well-structured, balanced, and does it provide a productive workspace? Does it effectively use layout trends like Bento Grids if applicable?',
            'Modern Aesthetic & Professionalism: Does the dashboard look modern, professional, and align with 2025 UI/UX sensibilities for application design?',
        ],
    },
    favicon: {
        guide: [
            'Use the approved logomark/icon as the basis for the favicon.',
            'Ensure the design is extremely simple and instantly recognizable at very small sizes (typically 16x16 or 32x32 pixels in browser tabs).',
            'Test for clarity on different browser tab backgrounds (light and dark).',
            'Avoid small text or intricate details.',
            'A single, bold, clear shape or letter often works best.',
            'Export as a PNG (512x512 is a good source size for modern needs, allowing browsers/OS to downscale) with a transparent background.',
            'Consider providing an SVG version as well for optimal scalability if supported by all target contexts.',
        ],
        ideal: [
            'The favicon is a **perfectly distilled, ultra-minimalist version** of the logomark, retaining its core essence and recognizability even at micro sizes. Aligns with **Bold Minimalism**.',
            "It's pixel-perfect and exceptionally crisp at common display sizes (16x16, 32x32).",
            'If the logomark has a unique **geometric form** or uses **negative space** cleverly, this is effectively translated into the favicon.',
            'The color(s) used are highly visible and provide strong contrast against typical browser tab backgrounds, reinforcing brand identity instantly.',
            'The design is so simple and iconic that it becomes an immediate visual shorthand for the brand.',
            "Could subtly hint at the brand's 'athletic' or dynamic nature through a sharp, energetic shape if applicable.",
            'If the brand uses a **pixelated** aesthetic, the favicon could intentionally be a well-crafted pixel art version of the logomark.',
        ],
        warnings: [
            'Trying to shrink down the full primary logo or a complex logomark, resulting in an illegible blur.',
            "Using too many colors or gradients that don't render well at small sizes.",
            "Including any text unless it's a single, very bold, and clear initial that forms the core of the logomark.",
            'Having a design that is not visually distinct and gets lost among other browser tabs.',
            'Not testing the favicon on different browser themes (light/dark) or operating systems.',
            'Using a non-transparent background if the icon shape is not square, which can look clunky.',
        ],
        inspiration: [
            'Look at the favicons of well-known brands in your browser tabs.',
            "Search 'Best favicon design examples' or 'Creative favicons'.",
            'Study how iconic logomarks are simplified into effective favicons.',
            "Explore 'Minimalist icon design' for inspiration on extreme simplification.",
        ],
        criteria: [
            'Clarity & Recognizability at Tiny Sizes: Is the favicon instantly recognizable and clear when displayed at 16x16 or 32x32 pixels in a browser tab or bookmark list?',
            'Simplicity: Is the design extremely simple, avoiding any unnecessary detail that would be lost at small scale?',
            "Brand Consistency: Does the favicon accurately represent the brand's logomark and overall visual identity?",
            'Visual Impact: Does it stand out and provide a quick visual cue for the brand among multiple open tabs?',
            'Adaptability to Backgrounds: Does it work effectively on both light and dark browser tab backgrounds?',
            'Technical Quality: Is the PNG crisp and well-rendered? Does it use transparency appropriately?',
        ],
    },
    pwa_maskable_icon: {
        guide: [
            'Use the primary logomark as the foundation.',
            "Design the icon so that its key elements are within a 'safe zone', ensuring no important parts are clipped when various OS masks (circle, squircle, rounded square, etc.) are applied.",
            'The icon should fill most of the canvas, but the safe zone is typically around 80% of the center.',
            'Ensure the design is bold, simple, and clearly recognizable as an app icon.',
            "Provide variations for light and dark themes if the icon's appearance needs to adapt.",
            'Test the icon with maskable icon preview tools to ensure it looks good across different mask shapes.',
            "Export as a high-resolution PNG (e.g., 512x512) with a transparent background, but ensure the design looks good when a background color is applied by the OS if transparency isn't fully supported by the mask.",
        ],
        ideal: [
            "The icon leverages the **Bold Minimalism** of the logomark, ensuring it's impactful and instantly recognizable when masked.",
            'Key visual elements are perfectly centered and sized within the safe zone, looking intentional and polished regardless of the OS mask applied.',
            'If the logomark has a strong **geometric form** or **characterful element**, this is the focal point and remains fully visible after masking.',
            'The design uses colors from the brand palette that provide excellent contrast and visibility on various home screen backgrounds and in different OS themes (light/dark).',
            "The icon feels 'native' to the platform while still strongly representing the brand, creating a seamless user experience for the PWA.",
            "Could subtly incorporate a brand texture or a very simple **3D effect** (like a slight bevel or depth cue) if it enhances the icon's presence without cluttering, aligning with tactile trends like Neumorphism (if very carefully done) or more general depth.",
            'Dark mode variant is thoughtfully designed, not just an inversion, enhancing its appearance on dark OS themes.',
        ],
        warnings: [
            'Placing essential parts of the logomark too close to the edges, causing them to be cut off by OS masks.',
            'Creating a design that looks awkward or unbalanced once masked.',
            'The icon being too small within the canvas, leaving excessive empty space after masking.',
            'Poor contrast or visibility against common home screen wallpaper colors.',
            'Not testing with maskable icon preview tools, leading to unexpected clipping.',
            'Inconsistent appearance between light and dark mode variants if provided.',
        ],
        inspiration: [
            "Search 'PWA maskable icon examples' and 'Maskable icon generator/preview tools'.",
            "Study Google's guidelines on maskable icons for PWAs.",
            'Look at well-designed PWA icons on your own mobile devices.',
            "Explore 'App icon design trends 2025' for general app icon aesthetics that might apply.",
        ],
        criteria: [
            "Mask Adaptability: Does the icon look good and maintain its core visual integrity when subjected to various OS-specific masks (circular, squircle, rounded rectangle, etc.)? Are key elements within the 'safe zone'?",
            "Clarity & Recognizability: Is the icon clear, simple, and instantly recognizable as representing the brand when displayed on a user's home screen or app drawer?",
            "Brand Consistency: Does it strongly reflect the brand's logomark and overall visual identity?",
            'Visual Appeal: Is the icon aesthetically pleasing and well-crafted within the constraints of being maskable?',
            'Light/Dark Mode Performance: If variants are provided, do they adapt well to both light and dark OS themes, maintaining visibility and brand character?',
            'Technical Requirements: Does it meet the technical specifications for PWA icons (e.g., size, format)?',
        ],
    },
    system_icon_library: {
        guide: [
            'Design a cohesive set of icons for common UI actions and navigation (e.g., search, menu, user profile, settings, close, arrows, edit, delete).',
            'Maintain a consistent visual style: stroke weight, corner radius, level of detail, and overall geometry.',
            "Prioritize clarity and instant recognizability of each icon's meaning.",
            'Design as SVGs for scalability and crispness at any size.',
            'Ensure icons are pixel-perfect when rendered at their target size (e.g., 24x24).',
            'Use colors from the approved palette, ensuring they meet contrast requirements for accessibility, especially for interactive states.',
            'Consider providing both stroke and filled versions if needed for different UI contexts or states.',
            'Organize the library with clear naming conventions.',
        ],
        ideal: [
            "The icon set exhibits a unique yet highly functional style that aligns with the brand's personality, potentially incorporating subtle **custom elements** or a **geometric simplicity** that feels modern for 2025.",
            'Stroke weights and details are perfectly balanced for clarity at small sizes, possibly using **variable icon properties** if the SVG format and rendering engines support it in the future.',
            "The design language of the icons subtly echoes elements from the brand's logomark or typography, creating a deeply cohesive system.",
            'If the brand aesthetic leans towards **Neubrutalism**, icons might have a chunkier, more raw appearance.',
            'If a **hand-drawn or organic** style is part of the brand, the icons could reflect this with subtle imperfections while maintaining clarity.',
            'The library includes icons that support **emerging UI patterns or features**, showing foresight.',
            'Icons are designed with consideration for **micro-animations** or transitions when interacted with (e.g., a menu icon smoothly morphing into a close icon).',
            "The set includes custom icons that go beyond standard libraries, reinforcing the brand's uniqueness, a growing trend noted for 2025.",
        ],
        warnings: [
            'Inconsistent visual style across the icon set (e.g., varying stroke weights, different corner treatments).',
            'Icons that are too complex or detailed, making them hard to understand at small UI sizes.',
            'Ambiguous icon metaphors that confuse users.',
            'Poor scalability or rendering issues due to improper SVG construction.',
            'Accessibility failures due to insufficient contrast with backgrounds or unclear active/focus states.',
            'Creating icons that are too similar to each other, leading to misclicks.',
            'Not providing enough icons to cover common UI needs, forcing the use of inconsistent third-party icons.',
        ],
        inspiration: [
            "Study major icon libraries like 'Material Symbols', 'Font Awesome', 'Feather Icons', 'Heroicons'.",
            "Explore 'Custom icon set design' on Behance or Dribbble.",
            "Look for 'Minimalist UI icon design'.",
            "Search for 'SVG icon best practices'.",
            "See how icon styles align with specific UI trends like 'Neubrutalist icons' or 'Organic style UI icons'.",
        ],
        criteria: [
            'Clarity & Recognizability: Is the meaning of each icon immediately clear and unambiguous at its intended display size (e.g., 24x24)?',
            'Visual Cohesion & Consistency: Do all icons in the library share a consistent visual style (stroke weight, corner style, geometric language, level of detail), creating a harmonious set?',
            'Brand Alignment: Does the style of the icons align with the overall brand aesthetic and personality (e.g., minimalist, playful, technical)?',
            'Scalability & Technical Quality: Are the SVGs well-constructed, scalable without distortion, and pixel-perfect at their target sizes? Are they optimized for performance?',
            "Completeness: Does the library provide a comprehensive set of icons needed for the application's UI controls and navigation?",
            'Accessibility: Are icons designed to be clear for users with visual impairments? When used with color, do they maintain sufficient contrast?',
            "Usability: Do the icons effectively communicate function and improve the user's ability to navigate and interact with the interface?",
            'Modernity: Does the icon style feel current and align with 2025 interface design sensibilities (e.g., clean lines, appropriate level of detail, potential for subtle animation)?',
        ],
    },
    background_textures: {
        guide: [
            'Design textures or patterns that are subtle enough not to overpower content but still add visual interest or depth.',
            'Ensure the patterns are seamlessly tileable to avoid visible edges or repetition artifacts.',
            'Use SVG format for scalability and small file sizes, especially for geometric or abstract patterns.',
            "Consider the brand's aesthetic: textures can be organic, geometric, hand-drawn, digital, etc.",
            'Provide variations for light and dark modes, adjusting color or intensity as needed.',
            'Test how text and other UI elements look when placed on top of the texture to ensure readability.',
            'Keep file sizes minimal to avoid impacting page load speed.',
        ],
        ideal: [
            'The textures subtly incorporate elements of **Glassmorphism** (e.g., a frosted noise texture) or create a sense of depth reminiscent of **Neumorphism** (e.g., a very subtle embossed/debossed pattern).',
            'Patterns might be inspired by **nature-inspired tones and forms** (e.g., subtle leaf motifs, water ripples, wood grain) for an organic, sustainable feel, or **geometric abstractions** for a modern, tech look.',
            'Could feature **retro-futuristic patterns** (e.g., subtle grids, pixelated noise, sci-fi inspired geometric forms) if aligned with the brand.',
            'The texture adds a tactile quality, enhancing a **scrapbook aesthetic** or a more **handcrafted/artisan** feel if appropriate.',
            'Subtle **gradient meshes or noise textures** are used to add depth and vibrancy, aligning with gradient trends.',
            'For a **Maximalist** approach, patterns might be bolder and more complex, yet still designed to work as backgrounds.',
            'The patterns are designed to be **dynamic**, perhaps subtly animating (e.g., a slow-moving abstract pattern) or reacting to scroll or cursor movement (though the asset is static, the design should support this).',
            'The texture contributes to an **immersive experience** without being distracting, potentially using **linework** or abstract illustrative styles.',
        ],
        warnings: [
            'Textures that are too loud, busy, or high-contrast, making foreground content difficult to read.',
            'Patterns that are not seamlessly tileable, creating obvious and distracting seams.',
            'Large file sizes for raster-based textures that slow down page loading.',
            'Choosing textures that clash with the overall brand aesthetic or the message of the content.',
            'Not testing textures in both light and dark modes, where they might render very differently.',
            'Overusing textures, leading to a visually cluttered and dated design.',
        ],
        inspiration: [
            "Search 'Subtle SVG background patterns' or 'Seamless vector textures'.",
            "Explore 'Geometric pattern design' or 'Organic texture backgrounds'.",
            "Look for 'Noise texture CSS' or 'Gradient mesh background examples'.",
            "Find inspiration from 'Retro patterns web design' or 'Hand-drawn background textures'.",
            'Check design resources like Hero Patterns or SVGBackgrounds.com for ideas (though aim for custom).',
            "Consider textures used in 'Glassmorphism backgrounds' or 'Neubrutalist patterns'.",
        ],
        criteria: [
            'Subtlety & Readability: Does the texture add visual interest and depth without overpowering or distracting from the foreground content? Is text still highly readable when placed over it?',
            'Tileability: Is the texture or pattern seamlessly tileable, avoiding any visible edges or awkward repetition when applied as a background?',
            'Brand Alignment: Does the style of the texture (e.g., organic, geometric, retro, minimalist) align with the overall brand aesthetic and the style of the homepage mockup?',
            'Visual Appeal: Is the texture aesthetically pleasing and does it enhance the overall design?',
            'Performance (File Size): If SVG, is it optimized? If raster (less ideal for tileable), is it compressed effectively?',
            'Light/Dark Mode Adaptability: Do the provided variants work effectively in both light and dark themes, maintaining their intended effect and harmony with other elements?',
            'Versatility: Can the texture be used effectively in different sections or contexts (e.g., hero, content sections) if needed?',
            'Modernity: Does the texture feel current and align with 2025 trends (e.g., subtle noise, organic forms, geometric patterns)?',
        ],
    },
    spot_illustrations: {
        guide: [
            "Develop a consistent illustration style that aligns with the brand's personality (e.g., playful, sophisticated, technical, hand-drawn).",
            'Keep illustrations relatively simple and focused, especially if used for empty states or small decorative elements.',
            'Ensure the meaning or emotion conveyed by the illustration is appropriate for its context (e.g., helpful for onboarding, empathetic for error states).',
            'Use SVG format for scalability and crispness.',
            'Apply brand colors effectively within the illustrations.',
            'Consider how illustrations will look on different background colors from the palette.',
            'Optimize SVGs for web to keep file sizes down.',
        ],
        ideal: [
            'The illustration style is unique and highly **characterful**, reflecting 2025 trends like **quirky illustrations, hand-drawn aesthetics, or organic forms** that add warmth and personality.',
            'Could feature **abstract illustrations** that are eye-catching yet subtle enough not to distract from core content.',
            'If the brand has a **retro-futuristic** or **nostalgic (90s/Y2K)** theme, the illustrations would embody this with appropriate motifs, color palettes, and linework (perhaps even **pixel art** elements if suitable).',
            'Illustrations might incorporate **subtle 3D elements** or a 2.5D perspective for added depth and visual appeal, without being overly complex for SVG.',
            'The style could align with a **scrapbook aesthetic**, feeling tactile and collage-like.',
            'Uses **linework** creatively to achieve a textured, dynamic, and memorable feel.',
            'Colors are applied thoughtfully from the brand palette, possibly using **gradients or bold color blocking** within the illustration itself to create impact.',
            'The illustrations are designed with potential for **subtle animation or micro-interactions** (e.g., elements reacting on hover, characters subtly moving in an empty state).',
            'Reflects **sustainable aesthetics** through nature-inspired themes or an earthy, handcrafted style if aligned with brand values.',
            "If AI-generated, they are carefully curated and refined to match the brand's unique style rather than feeling generic.",
        ],
        warnings: [
            'Inconsistent illustration style across different spot illustrations or with other brand visuals.',
            'Illustrations that are too complex or detailed, becoming distracting or slow to load.',
            "Using generic stock illustrations that don't align with the brand's unique personality.",
            'Illustrations that convey the wrong message or emotion for the context (e.g., a flippant illustration on an error page).',
            'Poor color choices within illustrations that clash with the brand palette or have accessibility issues.',
            'SVG files that are not optimized, leading to larger than necessary file sizes.',
            'Illustrations that are purely decorative and add no value or meaning to the user experience.',
        ],
        inspiration: [
            "Search 'Modern SVG spot illustration examples 2025'.",
            "Explore 'Hand-drawn illustration style web design'.",
            "Look for 'Quirky character illustrations for UI'.",
            "Find 'Abstract geometric illustration examples'.",
            "Study 'Empty state illustration design' or 'Onboarding illustration inspiration'.",
            "Browse Dribbble and Behance for 'UI illustration' or 'Brand illustration systems'.",
            "Look at 'Retro-futuristic illustration styles' or 'Y2K aesthetic illustrations'.",
        ],
        criteria: [
            "Brand Alignment & Style Consistency: Does the style of the spot illustrations (e.g., hand-drawn, geometric, abstract, quirky) align perfectly with the brand's personality, the homepage mockup's aesthetic, and remain consistent across all illustrations?",
            'Contextual Appropriateness: Is each illustration suitable for its intended use case (e.g., empty states, onboarding, feature highlights), effectively communicating the right message or emotion?',
            'Visual Appeal & Uniqueness: Are the illustrations aesthetically pleasing, original, and do they add positive visual value to the interface? Do they reflect current illustration trends for 2025?',
            'Clarity & Simplicity: Are the illustrations clear and easy to understand, especially when conveying a concept or state? Do they avoid unnecessary complexity?',
            "Color Harmony: Do the colors used within the illustrations harmonize with the brand's core color palette and ensure good visibility?",
            'Scalability & Technical Quality (SVG): Are the SVG files well-crafted, optimized for web, and do they scale crisply without rendering issues?',
            'Contribution to User Experience: Do the illustrations enhance the user experience by making it more engaging, informative, or delightful, rather than just being decorative filler?',
            'Originality: Do the illustrations feel custom and unique to the brand, avoiding a generic stock feel?',
        ],
    },
    hero_images: {
        guide: [
            'Select high-quality, professional photographs or create custom 3D renders that are visually compelling and relevant to the brand or product.',
            'Ensure the image clearly communicates the primary message or value proposition of the hero section.',
            'Optimize images for web to balance quality and file size for fast loading times (use appropriate compression).',
            "Consider the composition carefully, ensuring there's space for text overlays (headings, CTAs) if needed, and that the focal point is clear.",
            "Maintain a consistent visual style with other imagery on the site and with the brand's overall aesthetic.",
            'Ensure the image is high-resolution enough for large displays but also provide responsive versions for smaller screens.',
            "If using photography with people, ensure models and expressions align with the brand's target audience and tone.",
        ],
        ideal: [
            'The hero image creates an **immersive and captivating first impression**, immediately drawing the user in. This could be achieved through stunning, high-resolution photography, unique **AI-generated imagery**, or sophisticated **3D renders**.',
            'Aligns with 2025 trends like **AI realism** (if using AI), or a specific photographic style like **authentic, natural lighting** versus highly stylized.',
            "If illustrative, it's a high-impact custom piece reflecting styles like **modern abstract, detailed character art, or retro-futuristic scenes**.",
            "The imagery might incorporate **subtle motion** (e.g., a cinemagraph if the final asset could be a short video/GIF, or a still that implies motion) to enhance the 'athletic' feel.",
            'Features **bold visuals with vibrant colors** or, conversely, uses a **minimalist aesthetic with impactful negative space** to draw focus.',
            'If 3D, it could be an **interactive 3D object** previewed as a still, or a scene with dynamic lighting and textures.',
            'The composition is exceptional, seamlessly integrating with **bold typography** and calls to action, creating a cohesive and powerful hero unit.',
            'Reflects **sustainable aesthetics** through imagery of nature, eco-friendly products, or community engagement if relevant.',
            'Could be part of a **deconstructed hero section**, where the image is fragmented or interacts with other elements in an unconventional way.',
        ],
        warnings: [
            'Using generic, low-quality, or cliché stock photography that cheapens the brand.',
            'Images that are irrelevant to the brand or the message of the hero section.',
            'Poorly optimized images that significantly slow down page load times.',
            'Compositions where important text overlays are difficult to read due to busy backgrounds or poor contrast.',
            'Inconsistent visual style compared to other brand imagery.',
            'Images that are not high-resolution enough, appearing pixelated on larger screens.',
            'Using images that raise ethical concerns or are not properly licensed.',
        ],
        inspiration: [
            "Browse 'Award-winning website hero sections 2025'.",
            "Search for 'High-impact hero image photography' or 'Creative 3D hero renders'.",
            "Explore 'AI-generated art for websites' (e.g., Midjourney, DALL-E showcases).",
            "Look at 'Immersive website design examples'.",
            "Study 'Hero sections with bold typography and imagery'.",
            "Find 'Minimalist hero section designs'.",
            'Check websites of leading brands in relevant industries for their hero image strategies.',
        ],
        criteria: [
            'Visual Impact & Relevance: Is the image immediately captivating and highly relevant to the brand, product, or the core message of the homepage? Does it evoke the desired emotion?',
            'Quality & Professionalism: Is the image technically excellent (high resolution, well-lit, sharp, professionally produced/rendered)?',
            'Brand Alignment: Does the style, tone, and subject matter of the image align with the overall brand identity and the aesthetic of the homepage mockup?',
            'Composition & CTA Integration: Is the image well-composed, with a clear focal point? If text or CTAs overlay it, is there sufficient clear space or contrast for them to be legible and impactful?',
            'Originality & Uniqueness: Does the image feel original and distinctive, avoiding a generic stock photo appearance? If AI-generated, is it unique and high quality?',
            'Trend Relevance: Does the image reflect current trends in photography, 3D rendering, or illustration for 2025 (e.g., AI realism, authentic lifestyle, bold visuals, immersive quality)?',
            'Emotional Connection: Does the image help to create an emotional connection with the target audience?',
            'Technical Optimization (Implied for Web): While this is a PNG spec, the choice of image should lend itself to good web optimization for performance in the final build.',
        ],
    },
    section_header_images: {
        guide: [
            'Select images (photographs, illustrations, abstract graphics) that are thematically relevant to the content of the subsequent section.',
            'Ensure these images provide a clear visual break and help to delineate different parts of the page.',
            'Maintain a consistent visual style with the hero image and other brand imagery.',
            'Optimize for web to balance quality and file size.',
            'Consider using more abstract or textural images if the goal is purely a visual separator without conveying specific information.',
            "If used as full-width backgrounds for header areas, ensure they don't overpower the text content within that section.",
            'Provide responsive versions or ensure the chosen images crop well at different aspect ratios.',
        ],
        ideal: [
            'These images are not just generic dividers but act as compelling visual chapter markers, subtly reinforcing the narrative of each section. They could be **abstract representations, close-up textures, or thematically relevant details** that pique curiosity.',
            "The style aligns perfectly with the homepage hero and overall 2025 aesthetic, whether it's through **AI-generated abstract art, minimalist photography with ample negative space, or richly textured 3D renders**.",
            'Might incorporate **subtle gradients, Glassmorphism-inspired blurs, or noise textures** to add depth and align with modern UI trends.',
            'If illustrative, they are consistent with the spot illustration style, perhaps offering more atmospheric or conceptual visuals.',
            'Could be used to introduce **bold color blocking** as section backgrounds, creating strong visual anchors.',
            'The images work harmoniously with section titles and any introductory text, potentially allowing for interesting typographic overlays or interactions.',
            "They contribute to the overall **immersive or 'athletic' feel** of the site through dynamic compositions or evocative content.",
        ],
        warnings: [
            'Using irrelevant or distracting images that break the flow of content.',
            'Inconsistent styling that makes the page feel disjointed.',
            'Images that are too visually dominant, overshadowing the actual content of the section.',
            'Poorly optimized images leading to slow load times for multiple large background images.',
            'Text placed over these images becoming illegible due to insufficient contrast or busy image details.',
            'Relying on generic stock photos that add no real value or brand personality.',
        ],
        inspiration: [
            "Search 'Website section divider inspiration' or 'Creative section background images'.",
            "Look at 'Abstract background textures for web'.",
            "Explore 'Minimalist photography for section breaks'.",
            "Find examples of 'Websites with strong visual storytelling through section imagery'.",
            'Study how long-scrolling websites use imagery to transition between content blocks.',
        ],
        criteria: [
            "Thematic Relevance & Transition: Does the image effectively signal a transition to a new content section and is it thematically relevant to that section's topic?",
            'Visual Consistency: Does the image maintain the established visual style (photography, illustration, color grading, etc.) of the homepage mockup and other brand assets?',
            'Aesthetic Contribution: Does the image enhance the overall aesthetic of the page and provide a pleasing visual break, or does it feel like an afterthought?',
            'Hierarchy & Content Support: If used as a background, does it support (or at least not detract from) the legibility and prominence of any text or UI elements within that section header?',
            'Originality & Quality: Is the image high quality and does it avoid a generic stock appearance?',
            'Subtlety vs. Impact: Does it strike the right balance between being a subtle visual break and making an impact, depending on its intended role?',
            'Responsiveness Consideration: Is the image composed in a way that it will still be effective when cropped or scaled for different screen sizes?',
        ],
    },
    product_screenshots: {
        guide: [
            'Capture clean, high-resolution screenshots of the product or UI.',
            "Showcase key features or common user flows that highlight the product's value.",
            'Ensure any data shown in screenshots is sample data and not sensitive information.',
            'Optionally, place screenshots within modern device frames (laptop, phone, tablet) to provide context.',
            'Maintain consistency in how screenshots are captured and presented (e.g., same window size, consistent device frames).',
            'Optimize PNGs for web to keep file sizes reasonable.',
            'Use transparent backgrounds if the screenshots are meant to be overlaid on other design elements or if only the UI window is shown.',
        ],
        ideal: [
            'Screenshots are presented creatively, perhaps with **subtle 3D perspectives, dynamic angling, or within stylized device mockups** that align with 2025 aesthetics (e.g., sleek, minimalist frames).',
            "Could be enhanced with **annotations or callouts** that are styled according to the brand's typography and color palette, highlighting key features in an engaging way.",
            'If showcasing a complex UI, the screenshots are chosen to demonstrate clarity and ease of use, possibly reflecting **minimalist UI principles** within the product itself.',
            'Might be part of a **scroll-triggered animation sequence (scrollytelling)** on a webpage, revealing different features as the user scrolls.',
            'Screenshots could be integrated into **Bento Grid layouts** on a marketing page, each highlighting a specific feature in a modular way.',
            "The UI depicted in the screenshots itself reflects modern design trends (e.g., if it's a SaaS product, its own UI should look current).",
            "For an 'athletic' feel, screenshots might be presented with a sense of dynamism or motion, even if static (e.g., angled, overlapping, part of a larger visual composition).",
        ],
        warnings: [
            'Using outdated or low-resolution screenshots of the product.',
            'Displaying sensitive or placeholder data that looks unprofessional.',
            'Inconsistent styling of device frames or presentation methods.',
            'Screenshots that are too small or cluttered, making them difficult to understand.',
            'Not optimizing images, leading to slow load times, especially if many are used.',
            'Using distracting or overly ornamental device mockups that overshadow the product UI itself.',
        ],
        inspiration: [
            "Search 'SaaS product screenshot examples' or 'App feature showcase design'.",
            "Look at 'Creative ways to display UI screenshots on websites'.",
            "Explore 'Device mockup templates for product presentation'.",
            'Study marketing websites of successful software companies to see how they present their products.',
            "Find inspiration for 'Annotated screenshot design'.",
        ],
        criteria: [
            "Clarity & Relevance: Do the screenshots clearly and accurately depict the product's UI and showcase relevant features or benefits?",
            'Quality & Presentation: Are the screenshots high-resolution, clean, and professionally presented (e.g., within appropriate and modern device frames, if used)?',
            'Consistency: Is there a consistent approach to capturing and styling screenshots across the set?',
            "Context & Storytelling: Do the chosen screenshots effectively tell a story about the product's functionality or user experience?",
            'Visual Appeal within Layout: How well do the screenshots integrate into the overall design of the marketing page or section where they are used? Do they complement the brand aesthetic?',
            'Focus on Value: Do the screenshots emphasize the value and key functionalities of the product effectively?',
            'Data Representation: Is any data shown appropriate, non-sensitive, and does it make the UI look realistic and useful?',
        ],
    },
    team_headshots: {
        guide: [
            'Ensure all headshots have a consistent style (e.g., background, lighting, pose, cropping).',
            "Aim for professional, high-quality photographs that are approachable and reflect the brand's culture.",
            'Optimize images for web while maintaining good resolution for clarity.',
            'Ensure a square aspect ratio if specified for avatars.',
            'Consider how these will look at smaller sizes if used as testimonial avatars.',
            "Obtain necessary permissions for using individuals' images.",
        ],
        ideal: [
            'Headshots have an **authentic and natural feel**, aligning with trends that move away from overly corporate or stiff portraits. Lighting is professional yet soft and approachable.',
            "The background style is consistent and complements the brand's color palette, perhaps using a solid brand color, a subtle texture from the **Background Textures** library, or a clean, neutral tone.",
            'Could incorporate subtle brand elements, like a color accent in clothing or a background detail, if done tastefully.',
            'Testimonial avatars are crisp and clear even at small UI sizes, possibly using a circular mask which is common.',
            'The overall presentation of team members or testimonial providers feels human-centered and builds trust.',
            'If the brand has a **playful or quirky** personality, this could be subtly reflected in the expressions or poses, while still maintaining professionalism.',
            'Reflects **sustainable or nature-inspired aesthetics** if for an eco-brand, perhaps taken in natural light or outdoor settings (if appropriate and consistent).',
        ],
        warnings: [
            'Inconsistent quality, lighting, backgrounds, or posing across different headshots, making the team presentation look unprofessional.',
            'Using low-resolution or poorly cropped images.',
            "Overly casual or inappropriate photos for a professional context (unless that's the explicit brand style).",
            'Stiff, unfriendly, or outdated-looking headshots.',
            'Avatars that are too small or unclear to recognize the person.',
            'Not having a consistent aspect ratio or cropping for all images used in a similar context.',
        ],
        inspiration: [
            "Search 'Modern team headshot photography examples'.",
            "Look at 'Creative about us page designs' to see how team photos are integrated.",
            "Explore 'Testimonial section design' for avatar usage.",
            "Find 'Consistent professional portrait styles for websites'.",
        ],
        criteria: [
            'Consistency: Is there a consistent style across all headshots/avatars in terms of lighting, background, cropping, pose, and overall quality?',
            "Professionalism & Approachability: Do the images look professional yet approachable, aligning with the brand's desired tone and culture?",
            'Quality: Are the photographs high-resolution, well-lit, and sharp?',
            'Brand Alignment: Does the style of the headshots/avatars fit with the overall brand aesthetic?',
            'Clarity at Different Sizes: Are faces clear and recognizable, especially for avatars that might be displayed at smaller sizes?',
            'Authenticity: Do the images feel genuine and help to build trust and human connection?',
            "Contextual Fit: Do they integrate well into the layouts where they are used (e.g., 'About Us' page, testimonial blocks)?",
        ],
    },
    infographics: {
        guide: [
            'Present complex information or data in a visually engaging and easy-to-understand format.',
            'Use brand colors, typography, and iconography consistently within the infographic.',
            'Prioritize clarity and accuracy of the information.',
            'Keep the design clean and uncluttered, even with dense data.',
            'Use charts, graphs, icons, and illustrations effectively to support the data.',
            'Ensure a logical flow and visual hierarchy to guide the viewer through the information.',
            'Design as SVGs for scalability, especially if they will be viewed on various devices or embedded.',
            'Optimize for readability on both desktop and mobile (consider responsive infographic design if highly complex).',
        ],
        ideal: [
            "The infographic is not just data visualization but a piece of **visual storytelling**, using the brand's aesthetic (colors, typography, illustration style from **Spot Illustrations**) to make complex information digestible and engaging.",
            'Incorporates modern data visualization trends, perhaps with **interactive elements** (if the final output supports it, e.g., on a webpage) or **animated transitions** between data points (even if the SVG is static, it can be designed for this).',
            "Uses **bold typography and color blocking** to highlight key statistics or sections, aligning with the 'athletic' feel of the brand if applicable.",
            "May feature **custom icons from the System UI Icon Library** or unique illustrative elements consistent with the brand's visual language.",
            'If appropriate for the data and brand, could use a **Bento Grid approach** to organize different pieces of information within the infographic.',
            'The design might subtly incorporate **3D elements or perspectives** to make charts and graphs more dynamic and visually appealing.',
            "The layout is clean and uses whitespace effectively, even with complex data, ensuring it doesn't feel overwhelming. Perhaps an **asymmetrical layout** is used for visual interest.",
            'For a **Neubrutalist** brand, the infographic might use raw, high-contrast graphics and stark typography.',
            'If **AI-generated visuals or data interpretations** are used, they are presented clearly and ethically.',
        ],
        warnings: [
            'Overly cluttered design with too much text or too many visual elements, making it hard to read and understand.',
            'Inaccurate or misleading data representation.',
            "Inconsistent styling with the brand's visual identity (colors, fonts, icons).",
            "Poor visual hierarchy that doesn't guide the viewer effectively.",
            'Using charts or graphs that are not appropriate for the type of data being presented.',
            'Accessibility issues, such as poor color contrast in charts or text that is too small.',
            'Making the infographic an excessively long image that is difficult to view or share, especially on mobile.',
        ],
        inspiration: [
            "Search 'Best infographic design examples 2025'.",
            "Explore 'Data visualization trends 2025'.",
            "Look for 'Infographics using brand style guides effectively'.",
            "Find 'SVG infographic examples for web'.",
            "Study 'Storytelling through data visualization'.",
            'Check out infographics from reputable sources like The Economist, National Geographic, or major research firms for quality and clarity.',
        ],
        criteria: [
            'Clarity & Understandability: Is complex information presented in a clear, concise, and easily digestible manner? Can the average target user quickly grasp the key takeaways?',
            'Accuracy of Data: Is the data represented accurately and without distortion or misrepresentation?',
            "Visual Engagement & Appeal: Is the infographic visually engaging and aesthetically pleasing? Does it effectively use color, typography, icons, and illustrations from the brand's system?",
            "Brand Consistency: Does the infographic strongly adhere to the brand's visual identity guidelines (colors, fonts, illustration style from homepage mockup)?",
            'Hierarchy & Flow: Is there a logical visual flow that guides the viewer through the information? Is the hierarchy of information clear?',
            'Appropriate Visualization: Are the chosen charts, graphs, and visual elements appropriate for the type of data being presented?',
            'Effectiveness in Communication: Does the infographic successfully achieve its goal of explaining a concept, showcasing metrics, or telling a data-driven story?',
            'Technical Quality (SVG): Is the SVG well-structured, optimized, and does it scale correctly without loss of quality or readability?',
        ],
    },
    open_graph_card: {
        guide: [
            'Design an image that is compelling and accurately represents the content of the page being shared.',
            'Include the primary logo or a recognizable brand element.',
            'Often includes the title of the page or article, and sometimes a short description or key visual.',
            'Ensure text is large and clear enough to be legible in small preview sizes on social feeds.',
            'Use brand colors and typography consistently.',
            'Adhere to recommended dimensions for Open Graph images (e.g., 1200x630 is common, but the spec says 1024x540, which is also acceptable, a ~1.91:1 aspect ratio is key).',
            'Optimize the PNG for web to keep file size down while maintaining visual quality.',
        ],
        ideal: [
            'The card is highly **visually engaging**, using a striking image, illustration, or graphic from the **Homepage Mockup** style that encourages clicks and shares.',
            'The **Primary Logo** is clearly visible and well-placed for brand recognition.',
            "Typography is **bold and legible**, ensuring the title or key message stands out even in a busy social media feed, reflecting the brand's typographic style.",
            'The design might incorporate a **subtle brand pattern or texture** from the **Background Textures** library to add depth and visual interest.',
            'If the shared content is visual (e.g., a blog post with a strong hero image), that image is effectively adapted for the OG card.',
            "The color palette is used to make the card pop and align with the brand's 'athletic' or vibrant feel if applicable.",
            'The design is clean, uncluttered, and focuses on conveying the core message quickly.',
            'Could be dynamically generated with the specific page title for better relevance, though this asset is a static template.',
            'Aligns with **Minimalist Maximalism** by being simple in layout but bold in its visual elements.',
        ],
        warnings: [
            'Text that is too small or poorly contrasted, making it illegible in social media previews.',
            "Generic or irrelevant imagery that doesn't entice clicks.",
            'Missing or poorly placed branding (logo).',
            'Designs that are too cluttered with information.',
            'Not adhering to the recommended aspect ratio, leading to awkward cropping by social platforms.',
            'Very large file sizes that might cause issues with some platforms or slow down preview generation.',
            "Inconsistent design with the brand's overall visual identity.",
        ],
        inspiration: [
            "Search 'Best Open Graph image examples' or 'Social media share card design'.",
            'Look at how popular blogs and news sites design their OG images.',
            "Use Facebook's Sharing Debugger or LinkedIn's Post Inspector to preview how cards will look.",
            "Explore 'OG image templates' for layout ideas (but customize for brand).",
        ],
        criteria: [
            'Visual Appeal & Click-worthiness: Is the card visually attractive and compelling enough to encourage users to click when shared on social media?',
            'Brand Representation: Is the brand clearly identifiable through the prominent and correct use of the primary logo and adherence to brand colors/typography?',
            'Clarity of Information: If it includes text (like a page title), is it highly legible and does it accurately represent the linked content?',
            'Relevance to Content: Does the imagery or visual theme of the card align with the content of the page it represents?',
            'Optimal Dimensions & Aspect Ratio: Does it meet the typical aspect ratio (approx. 1.91:1) and recommended dimensions to display well across platforms like Facebook, LinkedIn, etc.?',
            "Consistency with Homepage Mockup: Does the design feel like a natural extension of the website's visual style established in the homepage mockup?",
            'Readability in Feeds: Is the design effective when viewed as a smaller thumbnail within a social media feed?',
            'Technical Quality: Is the PNG optimized for web, balancing quality and file size?',
        ],
    },
    twitter_card: {
        guide: [
            "Similar to Open Graph cards, but optimize for Twitter's recommended aspect ratios (often 1:1 for summary card with large image, or 2:1, but spec here is ~16:9). The provided 1024x576 is a 16:9 aspect ratio, which is common.",
            'Include compelling imagery, the primary logo, and potentially a concise title.',
            "Ensure text is clear and legible within Twitter's card previews.",
            'Use brand colors and typography.',
            'Keep file size optimized for fast loading on Twitter feeds.',
        ],
        ideal: [
            "The card leverages a **strong visual from the Homepage Mockup** or a custom graphic that is specifically tailored for Twitter/X's feed aesthetic, ensuring it grabs attention.",
            'The **Primary Logo** is prominent and clearly legible.',
            "Typography is **bold, concise, and highly readable**, adapted from the brand's typographic system to work well in the Twitter/X card format.",
            "The design might incorporate **dynamic elements or a sense of urgency** if appropriate for the content, reflecting an 'athletic' brand communication style.",
            'Effectively uses the 16:9 aspect ratio for a visually balanced and impactful presentation.',
            'If the brand has a **Neubrutalist** or **Maximalist** style, the Twitter card could be an opportunity to showcase this with bold graphics and high contrast, designed to stand out.',
            "Consistent with the Open Graph card in terms of core messaging and branding, but optimized for Twitter's specific display nuances.",
        ],
        warnings: [
            'Using an image with an incorrect aspect ratio, leading to poor cropping by Twitter/X.',
            'Text that is too small, illegible, or gets cut off.',
            "Weak or generic imagery that doesn't encourage engagement.",
            'Missing or unclear branding.',
            'Overly cluttered design.',
            'Large file sizes that may not load quickly or be rejected by the platform.',
        ],
        inspiration: [
            "Search 'Best Twitter card examples' or 'X summary card with large image design'.",
            "Use Twitter's Card Validator to preview how the card will appear.",
            'Observe how brands in your industry use Twitter cards effectively.',
            "Look at 'Social media image templates for Twitter/X'.",
        ],
        criteria: [
            'Visual Impact on Twitter/X: Is the card visually striking and designed to capture attention within the fast-moving Twitter/X feed?',
            "Brand Consistency: Does it clearly feature the primary logo and align with the brand's visual identity (colors, typography, homepage style)?",
            'Information Clarity: If text is included, is it concise, legible, and does it accurately reflect the linked content?',
            'Optimal Aspect Ratio & Display: Is it designed for the specified 16:9 aspect ratio (1024x576) and does it render well in Twitter/X card previews without awkward cropping?',
            "Relevance & Engagement: Does the card's visual and textual content accurately represent the linked page and entice users to click?",
            'Consistency with Other Share Cards: While optimized for Twitter/X, does it maintain a degree of consistency with other social sharing images like the Open Graph card?',
            'Technical Quality: Is the PNG optimized for web, ensuring good quality at a reasonable file size suitable for social media platforms?',
        ],
    },
    email_banner: {
        guide: [
            'Design a visually appealing banner that reinforces brand identity at the top of emails.',
            'Typically includes the primary logo and may incorporate brand colors, patterns, or relevant imagery.',
            'Keep the design relatively simple and uncluttered, as email clients have varying rendering capabilities.',
            'Ensure any text included is large and clear enough to be legible, but often logos and key visuals are prioritized over extensive text in the banner itself.',
            'Optimize the image for email (file size is critical for deliverability and load times).',
            'Consider how the banner will look on different email clients and devices (responsive email design principles).',
            'The height should not be excessive, to avoid pushing down important email content.',
        ],
        ideal: [
            'The banner is a concise and impactful representation of the brand, using the **Primary Logo** effectively alongside a striking visual or color treatment derived from the **Homepage Mockup** aesthetic.',
            'May use a **bold brand color block, a subtle brand pattern/texture, or a section of a compelling hero image** as its background.',
            'If the brand has a **minimalist** style, the banner will be clean and sophisticated, relying on strong typography (if any text beyond logo) and color.',
            'Could incorporate a **seasonal or campaign-specific visual element** while maintaining core brand identity.',
            'The design feels modern and aligns with 2025 aesthetics, perhaps using a clean **geometric layout** or an **asymmetrical balance** if space allows.',
            'If the brand uses **gradients**, a subtle and tasteful gradient could be part of the banner background.',
            "The visual elements chosen are 'athletic' and engaging, setting a positive tone for the email content.",
            'Exceptionally well-optimized for file size without sacrificing too much visual quality, ensuring quick loads in email clients.',
        ],
        warnings: [
            'Banner that is too large in file size, causing emails to load slowly or get clipped.',
            'Design that is too tall, pushing critical email content too far down.',
            'Cluttered design with too much text or too many visual elements, making it hard to process.',
            "Using images that don't render well or are blocked by default in some email clients (ensure ALT text is always used in the HTML).",
            'Inconsistent branding compared to the website and other marketing materials.',
            'Text within the image banner that is too small to be legible, especially on mobile devices.',
            'Not testing the banner across different email clients (Outlook, Gmail, Apple Mail etc.) as rendering can vary.',
        ],
        inspiration: [
            "Search 'Email header banner design best practices' or 'Newsletter banner examples'.",
            'Look at email newsletters from brands you admire.',
            "Explore 'MJML email templates' or 'HTML email banner design'.",
            "Find 'Branded email header inspiration'.",
        ],
        criteria: [
            'Brand Reinforcement: Does the banner effectively and immediately reinforce brand identity through clear logo placement and adherence to brand colors and style (as seen in homepage mockup)?',
            'Visual Appeal & Professionalism: Is the banner aesthetically pleasing, professional, and does it create a positive first impression for the email content?',
            'Clarity & Simplicity: Is the design clean, uncluttered, and easy to understand at a glance? Does it avoid overwhelming the recipient?',
            'Appropriate Dimensions & File Size: Is the banner appropriately sized for email headers (not too tall, specified 1024x512 landscape) and optimized for a small file size to ensure quick loading and good deliverability?',
            "Consistency: Is it consistent with other marketing materials like social media cards and the website's overall look and feel?",
            'Legibility (if text present): If any text is part of the banner image (beyond the logo), is it clearly legible across devices?',
            'Adaptability Hint (Conceptual): While a static PNG, does the design conceptually lend itself to looking good in various email clients and on different screen sizes where emails are read?',
        ],
    },
    error_illustration: {
        guide: [
            "Create an illustration that is on-brand but also empathetic, lighthearted, or helpful for the error context (e.g., a lost character for 404, a 'under construction' theme for maintenance).",
            "Use the brand's illustration style, color palette, and typography (if text is included in the SVG).",
            'Keep the message clear and provide helpful next steps if possible (e.g., link to homepage, search bar).',
            'Design as an SVG for scalability and crispness.',
            'Ensure it looks good in both light and dark mode if variants are provided.',
            'Optimize the SVG for web.',
        ],
        ideal: [
            'The illustration is highly **creative and characterful**, turning a potentially frustrating user experience (like a 404 page) into a memorable and even delightful brand touchpoint. It aligns with 2025 trends for **quirky, hand-drawn, or unique custom illustrations**.',
            "Perfectly captures the brand's personality – whether it's humorous, apologetic, or cleverly on-theme.",
            'Might subtly incorporate elements of **motion or animation** if the SVG is designed to be animated with CSS/JS, or even be a Lottie file exported as SVG.',
            "If the brand has a **retro-futuristic** or **nostalgic** theme, the error illustration could playfully lean into this (e.g., a pixelated 'glitch' for an error, a 90s style 'system down' graphic).",
            'The illustration provides a clear visual metaphor for the error (e.g., lost, searching, disconnected) that is easy to understand.',
            'The **dark mode variant** is particularly well-executed, maintaining the mood and clarity effectively.',
            'Could align with a **scrapbook aesthetic** if the brand uses this, appearing like a hand-placed, empathetic doodle.',
            "Uses **bold color and linework** if that's part of the brand's 'athletic' or dynamic style.",
        ],
        warnings: [
            'Illustrations that are too generic, cliché (e.g., a simple broken link icon), or off-brand.',
            'Artwork that is confusing, frustrating, or makes light of a serious issue (for maintenance pages).',
            'Missing helpful links or information to guide the user.',
            'Poorly optimized SVGs that are slow to load.',
            'Inconsistent illustration style with other brand visuals.',
            'Not providing appropriate light/dark mode variants if the site supports them.',
        ],
        inspiration: [
            "Search 'Creative 404 page design examples 2025' or 'Best error page illustrations'.",
            "Look at 'Brand personality in UI illustration'.",
            "Explore 'Animated 404 pages' or 'Interactive error states'.",
            "Find 'On-brand maintenance page designs'.",
        ],
        criteria: [
            "Brand Alignment & Tone: Does the illustration's style, character, and tone perfectly match the brand's personality (as established in homepage mockup) and the specific error/maintenance context (e.g., empathetic, humorous, helpful)?",
            'Creativity & Originality: Is the illustration creative, original, and memorable? Does it avoid clichés and offer a unique brand experience even in an error state?',
            "Clarity of Message (if applicable): If the illustration aims to visually communicate the error (e.g., 'page not found,' 'site under construction'), is this message clear?",
            "Visual Appeal: Is the illustration aesthetically pleasing and well-executed according to the brand's illustration style?",
            'User Experience Enhancement: Does the illustration help to mitigate user frustration by being friendly, engaging, or providing a moment of delight, rather than exacerbating the negative experience?',
            'Light/Dark Mode Adaptability: Do the light and dark variants both work effectively, maintaining clarity and appeal in their respective themes?',
            'Technical Quality (SVG): Is the SVG well-optimized, scalable, and does it render correctly across browsers?',
            'Consistency with Other Illustrations: Does it maintain style consistency with other brand illustrations like spot illustrations?',
        ],
    },
    animated_asset: {
        guide: [
            'Keep animations short, smooth, and purposeful.',
            "Ensure the animation style aligns with the brand's visual identity (colors, shapes, illustration style from homepage mockup).",
            'Optimize for small file size (Lottie files are generally much better than GIFs for complex animations).',
            'Focus on creating delight, providing feedback, or quickly demonstrating a feature.',
            'Ensure looping animations are seamless and not distracting.',
            'Test performance across different devices and browsers.',
            "Consider accessibility: ensure animations don't cause issues for users with motion sensitivity (provide ways to pause if necessary for longer animations).",
        ],
        ideal: [
            'The animation is a delightful **micro-interaction** or a concise **kinetic typography** piece that enhances user experience and brand personality, aligning with 2025 motion design trends.',
            'Leverages modern motion principles like **Minimalist Maximalism** (simple elements with bold, engaging movement) or a **playful Bubble Typography** animation.',
            'If illustrative, the animation brings **quirky characters or hand-drawn elements** to life in a charming way.',
            'Could be a subtle **3D animation** or an animation that uses **Glassmorphism or Neumorphism effects** dynamically.',
            'The animation might reflect a **retro-futuristic** style with smooth, sci-fi inspired transitions or pixelated effects if on-brand.',
            "If it's a Lottie file, it's highly scalable and interactive, potentially reacting to user input.",
            "The motion design is 'athletic' – fluid, energetic, and purposeful, adding a dynamic layer to the interface.",
            'The loop is seamless and crafted to provide continuous delight without becoming annoying.',
            "Perfectly optimized for performance, ensuring it doesn't degrade the user experience with jank or slow load times.",
            'Could be an example of a **dynamic logo** in a simple animated form.',
        ],
        warnings: [
            'Animations that are too long, complex, or distracting, negatively impacting usability.',
            'Large file sizes (especially for GIFs) that slow down page load or app performance.',
            'Animations that are purely decorative and serve no clear purpose, adding clutter.',
            'Jerky, unsmooth, or poorly timed animations.',
            'Overuse of animations, leading to a chaotic or overwhelming interface.',
            'Accessibility issues: animations that trigger motion sickness or lack controls for users who prefer reduced motion.',
            "Animations that clash with the brand's style or feel out of place.",
            'Loops that are not seamless and have a noticeable jump.',
        ],
        inspiration: [
            "Search 'Lottie animation examples' or 'SVG animation showcases'.",
            "Explore 'Microinteraction design inspiration 2025'.",
            "Look at 'Kinetic typography animations'.",
            "Find 'UI animation trends 2025' on motion design blogs (e.g., Pixflow).",
            "Study 'Animated onboarding examples' or 'Delightful UI animations'.",
            "Check out 'Subtle hover animations' and 'Animated loading indicators'.",
        ],
        criteria: [
            'Purpose & Enhancement: Does the animation serve a clear purpose (e.g., provide feedback, guide the user, demonstrate a feature, add delight) and genuinely enhance the user experience?',
            "Brand Alignment: Does the style, timing, and feel of the animation align with the brand's personality and visual identity (as seen in homepage mockup, colors, shapes)?",
            'Smoothness & Performance: Is the animation smooth and fluid? Is the file size optimized for web/app performance (Lottie preferred over GIF for vector/complex animations)?',
            'Subtlety & Appropriateness: Is the animation appropriately subtle for its context, avoiding distraction or annoyance, especially if looping?',
            'Visual Appeal & Craftsmanship: Is the animation well-crafted, visually appealing, and does it reflect modern motion design trends for 2025?',
            "Looping Quality (if applicable): If it's a looping animation, is the loop seamless and natural?",
            'Clarity (if demonstrating something): If used for a quick demo, is the demonstration clear and easy to understand?',
            'Accessibility Consideration: Is the animation designed with motion sensitivity in mind (e.g., brief, option to pause for more complex animations, adheres to reduced motion preferences)?',
        ],
    },
    loading_indicator: {
        guide: [
            'Design a simple, clean spinner or progress bar that clearly indicates activity.',
            'Use brand colors from the core color palette effectively.',
            'Ensure the animation is smooth and loops seamlessly.',
            'Keep the design lightweight and optimized for performance (SVG/CSS animations are often better than GIFs for simple spinners).',
            'Provide variations for light and dark modes if the site supports them.',
            "Ensure it's visually consistent with other UI elements and the brand's aesthetic.",
            'Consider the perceived speed – an animation that looks fast can make loading feel shorter.',
        ],
        ideal: [
            'The indicator is a unique, **custom-branded animation** rather than a generic spinner, possibly incorporating elements of the **logomark or brand shapes** in its motion.',
            'The animation is elegant and fluid, reflecting **modern motion design principles** and contributing to a polished user experience even during wait times. Could align with **Minimalist Maximalism** (simple form, engaging motion).',
            'If using a progress bar, it might feature **subtle gradient animations** or a fill style that is on-brand.',
            'The animation could be a clever **typographic animation** using brand initials or a short word if the brand style supports it.',
            'The light and dark mode variants are thoughtfully designed to maintain visibility and brand character on different backgrounds.',
            "The animation is not just functional but also a small moment of **brand delight or 'athletic' dynamism**.",
            'Could be an opportunity to use a simple **3D animated element** (if lightweight) or a **playful character animation** if the brand identity allows.',
            'Extremely well-optimized, ensuring it adds minimal overhead and starts instantly.',
        ],
        warnings: [
            'Animations that are jerky, distracting, or visually annoying.',
            'Indicators that are too large or too small for their context.',
            'Poor color contrast, making the indicator hard to see, especially in light/dark mode variations.',
            "Generic or off-the-shelf spinners that don't align with the brand's visual identity.",
            'Animations that are too complex, leading to large file sizes (if GIF) or performance issues.',
            "Progress indicators that don't accurately reflect progress or appear stalled.",
            'Not providing clear light/dark mode versions, causing visibility issues.',
        ],
        inspiration: [
            "Search 'Creative loading animation examples 2025' or 'Branded spinners and progress bars'.",
            "Look at 'SVG and CSS loading animations'.",
            "Explore 'Lottie loading animations'.",
            "Find 'Minimalist loading indicator designs'.",
            'Study loading animations in popular apps and websites for inspiration on smoothness and brand integration.',
        ],
        criteria: [
            'Clarity of Indication: Does the indicator clearly communicate that a process is ongoing and the system is not frozen?',
            "Brand Integration: Does the design of the indicator (shape, color, motion) align with the brand's visual identity, using elements from the core color palette and potentially reflecting the logo's style?",
            'Visual Appeal & Smoothness: Is the animation visually appealing, smooth, and professional? Does it avoid being jarring or distracting?',
            "Performance & Optimization: Is the asset lightweight and optimized for performance, ensuring it doesn't negatively impact the loading experience it's meant to cover? (SVG/CSS preferred over GIF for simple animations).",
            'Light/Dark Mode Adaptability: Do the light and dark variants work effectively in their respective themes, maintaining visibility and brand character?',
            'Appropriateness for Context: Is the style and complexity of the indicator appropriate for its typical usage contexts (e.g., full-page load vs. small async UI update)?',
            "Looping Quality: If it's a looping animation (like a spinner), is the loop seamless and continuous?",
            'Uniqueness (if applicable): Does it offer a touch of brand personality beyond a generic system spinner?',
        ],
    },
};
