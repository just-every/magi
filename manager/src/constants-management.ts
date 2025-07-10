export type ManagerSearchEngine =
    | 'gartner'
    | 'mckinsey'
    | 'hbr'
    | 'techcrunch'
    | 'forrester'
    | 'web_search';

export const MANAGER_SEARCH_ENGINES: ManagerSearchEngine[] = [
    'gartner',
    'mckinsey',
    'hbr',
    'techcrunch',
    'forrester',
    'web_search',
];

export const MANAGER_SEARCH_DESCRIPTIONS: string[] = [
    '- gartner: leading research and advisory company providing insights on technology trends, market analysis, and strategic planning',
    '- mckinsey: global management consulting firm offering insights on strategy, operations, technology, and organizational transformation',
    '- hbr: Harvard Business Review - authoritative management ideas, research, and best practices for business leaders',
    '- techcrunch: leading technology media platform covering startups, tech industry trends, and innovation insights',
    '- forrester: research and advisory firm specializing in technology market research and customer experience insights',
    '- web_search: broad web crawl for general business intelligence, market research, and strategic information',
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
    | 'market_analysis'
    | 'competitive_landscape'
    | 'strategic_roadmap'
    | 'quarterly_okrs'
    | 'executive_summary'
    | 'risk_assessment'
    | 'budget_forecast'
    | 'team_structure'
    | 'product_vision'
    | 'go_to_market_strategy';

// Type for spec dimensions
export interface ManagerAssetDimension {
    width: number;
    height: number;
}

// Type for spec.type
export type ManagerAssetSpecType = 'png' | 'svg' | 'json' | 'pdf' | 'markdown';

// Type for spec.background
export type ManagerAssetBackground = 'opaque' | 'transparent' | 'auto';

// Type for spec.aspect
export type ManagerAssetAspect = 'square' | 'landscape' | 'portrait' | 'auto';

// Type for variant values
export type ManagerAssetVariant = 'detailed' | 'summary' | 'visual';

/**
 * Interface for manager specifications returned by the LLM
 */
export interface ManagerSpec {
    run_id: string;
    context: string;
    asset_type: MANAGER_ASSET_TYPES;
    research_queries: Array<{
        engine: ManagerSearchEngine;
        query: string;
    }>;
    analysis_criteria: string;
    output_format: {
        type: ManagerAssetSpecType;
        structure: string;
        key_sections: string[];
    };
}

// Type for the spec object
export interface ManagerAssetSpec {
    type: ManagerAssetSpecType;
    dimensions?: ManagerAssetDimension[];
    background?: ManagerAssetBackground;
    aspect?: ManagerAssetAspect;
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
    research_sources: string[];
    evaluation_criteria: string[];
}

// Type for the full MANAGER_ASSET_GUIDE object
export type ManagerAssetGuideObject = {
    [key in MANAGER_ASSET_TYPES]?: ManagerAssetGuideItem;
};

export const MANAGER_ASSET_REFERENCE: ManagerAssetReferenceObject = {
    market_analysis: {
        name: 'Market Analysis Report',
        category: 'Research',
        description: 'Comprehensive analysis of market size, trends, opportunities, and threats',
        usage_context: 'Strategic planning, investor communications, and product development decisions',
        spec: {
            type: 'markdown',
        },
        variant: ['detailed', 'summary', 'visual'],
        depends_on: [],
    },
    competitive_landscape: {
        name: 'Competitive Landscape Analysis',
        category: 'Research',
        description: 'Detailed competitor mapping, positioning, and differentiation analysis',
        usage_context: 'Strategy formulation, product positioning, and go-to-market planning',
        spec: {
            type: 'markdown',
        },
        variant: ['detailed', 'summary', 'visual'],
        depends_on: ['market_analysis'],
    },
    strategic_roadmap: {
        name: '12-Month Strategic Roadmap',
        category: 'Planning',
        description: 'High-level strategic initiatives mapped to timeline with dependencies',
        usage_context: 'Executive alignment, board presentations, and resource planning',
        spec: {
            type: 'markdown',
        },
        variant: ['detailed', 'summary', 'visual'],
        depends_on: ['market_analysis', 'competitive_landscape'],
    },
    quarterly_okrs: {
        name: 'Quarterly OKRs',
        category: 'Planning',
        description: 'Objectives and Key Results broken down by team and priority',
        usage_context: 'Team alignment, performance tracking, and progress reporting',
        spec: {
            type: 'markdown',
        },
        variant: ['detailed', 'summary'],
        depends_on: ['strategic_roadmap'],
    },
    executive_summary: {
        name: 'Executive Summary',
        category: 'Communication',
        description: 'One-page overview of current state, key decisions, and priorities',
        usage_context: 'Board updates, investor briefings, and stakeholder communications',
        spec: {
            type: 'markdown',
        },
        variant: ['summary'],
        depends_on: ['strategic_roadmap', 'quarterly_okrs'],
    },
    risk_assessment: {
        name: 'Risk Assessment Matrix',
        category: 'Governance',
        description: 'Identified risks with probability, impact, and mitigation strategies',
        usage_context: 'Risk management, compliance reporting, and strategic planning',
        spec: {
            type: 'markdown',
        },
        variant: ['detailed', 'summary', 'visual'],
        depends_on: ['market_analysis', 'competitive_landscape'],
    },
    budget_forecast: {
        name: 'Budget Forecast',
        category: 'Finance',
        description: 'Financial projections including revenue, costs, and resource allocation',
        usage_context: 'Financial planning, board approval, and resource management',
        spec: {
            type: 'markdown',
        },
        variant: ['detailed', 'summary', 'visual'],
        depends_on: ['strategic_roadmap', 'quarterly_okrs'],
    },
    team_structure: {
        name: 'Organizational Structure',
        category: 'Operations',
        description: 'Team organization, reporting lines, and role definitions',
        usage_context: 'Hiring planning, team communications, and operational efficiency',
        spec: {
            type: 'markdown',
        },
        variant: ['detailed', 'visual'],
        depends_on: ['strategic_roadmap'],
    },
    product_vision: {
        name: 'Product Vision Document',
        category: 'Product',
        description: 'Long-term product vision, principles, and success metrics',
        usage_context: 'Product development, engineering alignment, and marketing strategy',
        spec: {
            type: 'markdown',
        },
        variant: ['detailed', 'summary'],
        depends_on: ['market_analysis', 'competitive_landscape'],
    },
    go_to_market_strategy: {
        name: 'Go-to-Market Strategy',
        category: 'Marketing',
        description: 'Launch strategy including positioning, channels, and timeline',
        usage_context: 'Product launches, marketing campaigns, and sales enablement',
        spec: {
            type: 'markdown',
        },
        variant: ['detailed', 'summary', 'visual'],
        depends_on: ['product_vision', 'competitive_landscape'],
    },
};

export const MANAGER_ASSET_GUIDE: ManagerAssetGuideObject = {
    market_analysis: {
        guide: [
            'Analyze total addressable market (TAM), serviceable addressable market (SAM), and serviceable obtainable market (SOM)',
            'Identify key market trends, growth drivers, and emerging technologies',
            'Segment the market by customer type, geography, and use case',
            'Analyze market maturity and adoption curves',
            'Include both quantitative data and qualitative insights',
        ],
        ideal: [
            'Data-driven with credible sources cited throughout',
            'Clear visualization of market size and growth projections',
            'Actionable insights tied to company strategy',
            'Balance of current state and future projections',
            'Comparison to adjacent markets for context',
        ],
        warnings: [
            'Avoid overly optimistic projections without supporting data',
            'Don\'t ignore emerging threats or disruptive technologies',
            'Ensure data sources are recent and relevant',
            'Avoid analysis paralysis - focus on actionable insights',
        ],
        research_sources: [
            'Gartner market reports and Magic Quadrants',
            'Forrester Wave reports and market forecasts',
            'Industry-specific analyst reports',
            'Government and trade association data',
            'Primary research and customer interviews',
        ],
        evaluation_criteria: [
            'Comprehensiveness of market coverage',
            'Quality and recency of data sources',
            'Clarity of insights and recommendations',
            'Alignment with company strategic goals',
            'Actionability of findings',
        ],
    },
    competitive_landscape: {
        guide: [
            'Map direct and indirect competitors by market segment',
            'Analyze competitor strengths, weaknesses, and strategies',
            'Identify differentiation opportunities and competitive advantages',
            'Track competitor funding, partnerships, and market moves',
            'Include emerging and potential future competitors',
        ],
        ideal: [
            'Visual competitive positioning map or matrix',
            'Clear articulation of competitive advantages',
            'SWOT analysis for key competitors',
            'Competitive response strategies',
            'Regular update cadence defined',
        ],
        warnings: [
            'Don\'t underestimate indirect competitors or new entrants',
            'Avoid copying competitor strategies without adaptation',
            'Consider platform and ecosystem competition',
            'Don\'t ignore international competitors',
        ],
        research_sources: [
            'Competitor websites and public filings',
            'Industry news and press releases',
            'Customer reviews and feedback',
            'Patent and trademark databases',
            'Social media and job postings',
        ],
        evaluation_criteria: [
            'Completeness of competitive coverage',
            'Accuracy of competitive intelligence',
            'Strategic insights quality',
            'Differentiation clarity',
            'Actionable recommendations',
        ],
    },
    strategic_roadmap: {
        guide: [
            'Define clear strategic themes and initiatives',
            'Map initiatives to specific quarters with dependencies',
            'Include resource requirements and success metrics',
            'Balance short-term execution with long-term vision',
            'Consider multiple scenarios and contingencies',
        ],
        ideal: [
            'Visual timeline with swim lanes by function/team',
            'Clear milestones and decision points',
            'Resource allocation and budget implications',
            'Risk factors and mitigation strategies',
            'Alignment with company mission and values',
        ],
        warnings: [
            'Avoid overcommitting resources or unrealistic timelines',
            'Don\'t ignore dependencies and critical paths',
            'Consider organizational capacity and change management',
            'Plan for market and technology uncertainties',
        ],
        research_sources: [
            'Internal capability assessments',
            'Market and competitive analysis',
            'Technology trend reports',
            'Customer feedback and requirements',
            'Industry best practices',
        ],
        evaluation_criteria: [
            'Strategic alignment and coherence',
            'Feasibility and resource planning',
            'Flexibility and adaptability',
            'Measurability of outcomes',
            'Stakeholder buy-in potential',
        ],
    },
    quarterly_okrs: {
        guide: [
            'Limit to 3-5 objectives per quarter',
            'Make key results specific, measurable, and time-bound',
            'Cascade OKRs from company to team to individual level',
            'Balance aspirational and achievable targets',
            'Include both output and outcome metrics',
        ],
        ideal: [
            'Clear linkage to strategic priorities',
            'Quantifiable key results with baselines',
            'Owner assigned to each objective',
            'Weekly or bi-weekly tracking cadence',
            'Learning and iteration built into process',
        ],
        warnings: [
            'Avoid too many objectives diluting focus',
            'Don\'t confuse activities with outcomes',
            'Ensure cross-functional alignment',
            'Plan for mid-quarter adjustments if needed',
        ],
        research_sources: [
            'Strategic roadmap and priorities',
            'Team capacity and capabilities',
            'Historical performance data',
            'Industry benchmarks',
            'Customer success metrics',
        ],
        evaluation_criteria: [
            'Strategic alignment',
            'Measurability and clarity',
            'Achievability with stretch',
            'Team ownership and buy-in',
            'Impact on business outcomes',
        ],
    },
    executive_summary: {
        guide: [
            'Limit to one page with clear structure',
            'Lead with key decisions and recommendations',
            'Include critical metrics and KPIs',
            'Highlight risks and opportunities',
            'Clear call-to-action or next steps',
        ],
        ideal: [
            'Scannable format with headers and bullets',
            'Data visualization for key metrics',
            'Balance of achievements and challenges',
            'Forward-looking perspective',
            'Crisp, executive-appropriate language',
        ],
        warnings: [
            'Avoid jargon and technical details',
            'Don\'t bury important information',
            'Ensure data is current and accurate',
            'Balance optimism with realism',
        ],
        research_sources: [
            'Current performance dashboards',
            'Strategic initiative status',
            'Financial reports',
            'Market intelligence',
            'Team updates',
        ],
        evaluation_criteria: [
            'Clarity and conciseness',
            'Relevance to audience',
            'Actionability',
            'Visual appeal',
            'Completeness within constraints',
        ],
    },
};