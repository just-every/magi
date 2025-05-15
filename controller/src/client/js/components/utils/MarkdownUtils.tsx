/**
 * Markdown utilities for rendering content
 */
import * as marked from 'marked';

/**
 * Custom renderer for Markdown with enhanced link and image handling
 */
export class CustomRenderer extends marked.Renderer {
    link(
        href: string | { href?: string } | null,
        title: string | null,
        text: string | null
    ): string {
        // Convert href to string and handle object case
        const hrefStr =
            typeof href === 'object'
                ? href && href.href
                    ? href.href
                    : String(href)
                : String(href || '');

        // Handle title safely
        const titleAttr = title ? ` title="${title}"` : '';

        // Use href as text fallback if text is undefined
        const linkText = text || hrefStr;

        return `<a href="${hrefStr}" target="_magi" rel="noopener noreferrer"${titleAttr}>${linkText}</a>`;
    }

    image(href: string, title: string | null, text: string): string {
        const titleAttr = title ? ` title="${title}"` : '';
        const altAttr = text ? ` alt="${text}"` : '';

        // Check if this is a /magi_output/ path
        if (href && href.startsWith('/magi_output/')) {
            // For images, render both the link and the image
            return `
                <div class="magi-output-image">
                    <a href="${href}" target="_magi" rel="noopener noreferrer"${titleAttr}>
                        <img src="${href}"${altAttr}${titleAttr} class="img-fluid">
                    </a>
                </div>
            `;
        }

        // Regular image handling
        return `<img src="${href}"${altAttr}${titleAttr} class="img-fluid">`;
    }
}

/**
 * Parse markdown with enhanced features
 * @param content The raw content to parse
 * @returns Object with __html property for dangerouslySetInnerHTML
 */
export const parseMarkdown = (content: string): { __html: string } => {
    try {
        // Ensure that newlines are preserved before markdown parsing
        const formattedContent = content.replace(/\n/g, '\n\n');

        // Apply custom renderer
        const renderer = new CustomRenderer();
        const parsedOutput = marked.parse(formattedContent, { renderer });

        return { __html: parsedOutput };
    } catch (e) {
        console.error('Error parsing markdown:', e);
        return { __html: content };
    }
};
