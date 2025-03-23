// Type definitions for the Marked library loaded from CDN
interface MarkedOptions {
	gfm?: boolean;
	breaks?: boolean;
	pedantic?: boolean;
	sanitize?: boolean;
	smartLists?: boolean;
	smartypants?: boolean;
	highlight?: (code: string, lang: string) => string;
}

interface MarkedStatic {
	parse(text: string, options?: MarkedOptions): string;
}

// Global variable declaration
declare const marked: MarkedStatic;
