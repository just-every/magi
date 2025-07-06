/**
 * Processes Gemini CLI output to extract clean, formatted results
 * Filters out intermediate states and duplicate tool operations
 */
export class GeminiOutputProcessor {
    private seenTools: Set<string> = new Set();
    private currentTool: string | null = null;
    private isCodeBlock: boolean = false;
    private lastWasToolResult: boolean = false;
    private inBoxSection: boolean = false;
    private lastToolKey: string | null = null;

    /**
     * Process a single line of Gemini CLI output
     * @param line - Raw output line from Gemini CLI
     * @returns Processed line or null if it should be filtered
     */
    processLine(line: string): string | null {
        // Handle empty lines - generally preserve them for formatting
        if (!line.trim()) {
            return line;
        }

        // Check if we're entering or leaving a box section
        if (line.includes('╭') || line.includes('┌')) {
            this.inBoxSection = true;
        } else if (line.includes('╰') || line.includes('└')) {
            this.inBoxSection = false;
        }

        // Handle completion marker
        if (line.includes('[complete]')) {
            this.reset();
            return line; // Keep the complete marker
        }

        // Handle info messages
        if (line.startsWith('ℹ')) {
            return line; // Keep all info messages
        }

        // Handle assistant thoughts/explanations (✦ lines)
        if (line.trim().startsWith('✦')) {
            return line; // Keep all assistant content
        }

        // Handle tool operations
        if (this.isToolOperation(line)) {
            return this.processToolOperation(line);
        }

        // If we're inside a box section, clean but keep the content
        if (this.inBoxSection) {
            // Remove box drawing characters but keep the content
            const cleaned = this.cleanBoxDrawingChars(line);
            if (cleaned.trim()) {
                return '  ' + cleaned; // Indent for readability
            }
            return null;
        }

        // Handle code/content lines (numbered lines)
        if (this.isCodeLine(line)) {
            this.isCodeBlock = true;
            this.lastWasToolResult = false;
            return line;
        }

        // Keep all other content that isn't noise
        // Only filter very specific patterns we know are duplicates
        if (this.isNoiseLine(line)) {
            return null;
        }

        // Default: keep the line
        return line;
    }

    /**
     * Check if line represents a tool operation
     */
    private isToolOperation(line: string): boolean {
        return (
            line.startsWith('⊶') ||
            line.startsWith('o') ||
            line.startsWith('✔')
        );
    }

    /**
     * Process tool operation lines
     */
    private processToolOperation(line: string): string | null {
        // Extract tool name and operation
        const match = line.match(/^[⊶o✔]\s+(\w+)\s+(.+)$/);
        if (!match) return line; // If it doesn't match the pattern, keep it

        const [, toolName, operation] = match;
        const toolKey = `${toolName}:${operation.substring(0, 50)}`; // Use first 50 chars to handle truncation

        // Filter out intermediate states (⊶ and o lines) for the same operation
        if (line.startsWith('⊶') || line.startsWith('o')) {
            this.lastToolKey = toolKey;
            return null; // Filter these out
        }

        // For completed operations (✔), only show if we haven't seen this exact one
        if (line.startsWith('✔')) {
            // If this is the completion of the last seen operation, show it
            if (this.lastToolKey === toolKey || !this.seenTools.has(toolKey)) {
                this.seenTools.add(toolKey);
                this.currentTool = toolName;
                this.lastWasToolResult = true;
                this.lastToolKey = null;
                // Keep the original formatting
                return line;
            }
            // Skip if we've already shown this
            return null;
        }

        return line;
    }

    /**
     * Check if a line is noise that should be filtered
     */
    private isNoiseLine(line: string): boolean {
        const trimmed = line.trim();

        // Filter standalone tool names without context
        if (trimmed.match(/^(WriteFile|ReadFile|Shell|RunCommand):$/)) {
            return true;
        }

        // Filter lines that are just status bar junk
        if (
            trimmed.includes('(see   gemini-') ||
            (trimmed.includes('/docs)') && trimmed.includes('context left)')) ||
            (trimmed.includes('no sandbox') && !trimmed.includes('✔'))
        ) {
            return true;
        }

        // Filter task ID status lines
        if (trimmed.match(/^\(task-[A-Za-z0-9-]+\*?\)$/)) {
            return true;
        }

        return false;
    }

    /**
     * Check if line is a code line (starts with line number)
     */
    private isCodeLine(line: string): boolean {
        return /^\s*\d+\s+/.test(line);
    }

    /**
     * Process info messages
     */
    private processInfoMessage(line: string): string | null {
        // Clean up the info message
        const cleaned = line.replace(/^ℹ\s*/, 'ℹ ').trim();

        // Filter out certain repetitive info messages
        if (cleaned.includes('Working on') && this.currentTool) {
            // Skip if we're already in a tool context
            return null;
        }

        return cleaned;
    }

    /**
     * Remove box drawing and other special characters
     */
    private cleanBoxDrawingChars(line: string): string {
        // Only remove the vertical box chars at start and end, keep the content
        return line
            .replace(/^\s*[│┃]\s*/, '') // Remove leading box chars
            .replace(/\s*[│┃]\s*$/, '') // Remove trailing box chars
            .trim();
    }

    /**
     * Reset internal state
     */
    private reset(): void {
        this.seenTools.clear();
        this.currentTool = null;
        this.isCodeBlock = false;
        this.lastWasToolResult = false;
    }

    /**
     * Process multiple lines at once
     */
    processOutput(output: string): string {
        const lines = output.split('\n');
        const processedLines: string[] = [];

        for (const line of lines) {
            const processed = this.processLine(line);
            if (processed !== null) {
                processedLines.push(processed);
            }
        }

        // Clean up excessive empty lines
        const result = processedLines
            .join('\n')
            .replace(/\n{3,}/g, '\n\n') // Replace 3+ newlines with 2
            .trim();

        return result;
    }
}

// Export a singleton instance for convenience
export const geminiOutputProcessor = new GeminiOutputProcessor();
