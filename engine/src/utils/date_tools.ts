// Map of common timezone abbreviations to IANA timezone names
const timezoneMap: Record<string, string> = {
    // North America
    PST: 'America/Los_Angeles',
    PDT: 'America/Los_Angeles',
    EST: 'America/New_York',
    EDT: 'America/New_York',
    CST: 'America/Chicago',
    CDT: 'America/Chicago',
    MST: 'America/Denver',
    MDT: 'America/Denver',
    // Australia/Pacific
    AEST: 'Australia/Sydney',
    AEDT: 'Australia/Sydney',
    AWST: 'Australia/Perth',
    NZST: 'Pacific/Auckland',
    NZDT: 'Pacific/Auckland',
    // Asia
    JST: 'Asia/Tokyo',
    KST: 'Asia/Seoul',
    HKT: 'Asia/Hong_Kong',
    SGT: 'Asia/Singapore',
    IST: 'Asia/Kolkata',
    // Europe/Africa
    GMT: 'Europe/London',
    BST: 'Europe/London',
    CET: 'Europe/Paris',
    CEST: 'Europe/Paris',
    EET: 'Europe/Kiev',
    EEST: 'Europe/Kiev',
    SAST: 'Africa/Johannesburg',
};

/**
 * Format a date in the current timezone using a robust approach
 * Works with timezone abbreviations and IANA timezone names
 */
export function dateFormat(date?: Date | number): string {
    let timeZone: string;
    const dateToFormat = date ?? new Date();

    // Try to determine the best timezone to use
    if (process.env.TZ) {
        // If TZ is set directly, try to use it
        timeZone = process.env.TZ;

        // If it's an abbreviation, convert it to IANA format
        if (timezoneMap[timeZone]) {
            timeZone = timezoneMap[timeZone];
        }
    } else {
        // If no TZ env var, try to determine from system
        try {
            // Get the abbreviation using a Date object
            const timezoneAbbr = new Date()
                .toLocaleTimeString('en-us', { timeZoneName: 'short' })
                .split(' ')[2];

            // Try to map the abbreviation to an IANA name
            timeZone = timezoneMap[timezoneAbbr] || 'UTC';
        } catch (_e) {
            // Default to UTC if we can't determine the timezone
            timeZone = 'UTC';
        }
    }

    // Try to format with the detected timezone
    try {
        const formatter = new Intl.DateTimeFormat(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
            timeZoneName: 'short',
            timeZone: timeZone,
        });
        return formatter.format(dateToFormat);
    } catch (error) {
        // If that fails, fall back to UTC
        console.error(
            `Error formatting date with timezone ${timeZone}:`,
            error
        );
        try {
            const fallbackFormatter = new Intl.DateTimeFormat(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true,
                timeZoneName: 'short',
                timeZone: 'UTC',
            });
            return fallbackFormatter.format(dateToFormat);
        } catch (_fallbackError) {
            // Last resort: just return the date as a string
            return dateToFormat.toString();
        }
    }
}

export function readableTime(milliseconds: number): string {
    const seconds = Math.floor((milliseconds / 1000) % 60);
    const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
    const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);
    const days = Math.floor((milliseconds / (1000 * 60 * 60 * 24)) % 30);

    const times = [];
    if (days > 0) {
        times.push(`${days}d`);
    }
    if (hours > 0) {
        times.push(`${hours}h`);
    }
    if (minutes > 0) {
        times.push(`${minutes}m`);
    }
    if (seconds > 0) {
        times.push(`${seconds}s`);
    } else {
        times.push('0s');
    }
    return times.join(' ');
}
