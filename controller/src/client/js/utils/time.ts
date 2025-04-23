/**
 * Formats a date as a relative time string (e.g., "2s ago", "3m ago", "1h ago")
 * @param date The date to format
 * @param now Optional reference date (defaults to current time)
 * @returns Formatted relative time string
 */
export function formatRelative(date: Date, now: Date = new Date()): string {
    const diffMs = now.getTime() - date.getTime();

    // Handle future dates
    if (diffMs < 0) {
        return 'now';
    }

    const diffSecs = Math.floor(diffMs / 1000);

    if (diffSecs < 60) {
        return `${diffSecs}s ago`;
    }

    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) {
        return `${diffMins}m ago`;
    }

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
        return `${diffHours}h ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) {
        return `${diffDays}d ago`;
    }

    // For older dates, fall back to localized date string
    return date.toLocaleDateString();
}
