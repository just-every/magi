// Type definitions for marked library

declare module 'marked' {
    export class Renderer {
        constructor();
        link(href: string, title: string | null, text: string): string;
        image(href: string, title: string | null, text: string): string;
    }
    
    export interface MarkedOptions {
        gfm?: boolean;
        breaks?: boolean;
        pedantic?: boolean;
        sanitize?: boolean;
        smartLists?: boolean;
        smartypants?: boolean;
        highlight?: (code: string, lang: string) => string;
        renderer?: Renderer;
    }
    
    export function parse(text: string, options?: MarkedOptions): string;
    export function use(options: { renderer?: Renderer }): void;
}

declare const marked: {
    parse(text: string, options?: marked.MarkedOptions): string;
    Renderer: typeof marked.Renderer;
    use(options: { renderer?: marked.Renderer }): void;
};
