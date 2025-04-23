import { useRef, useLayoutEffect } from 'react';

// Custom Hook for Auto-Scrolling Logic
export function useAutoScroll(ref, dependency) {
    // Store the previous scroll height to compare against
    const previousScrollHeightRef = useRef(null);

    // Use useLayoutEffect to read layout metrics and scroll if appropriate
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;

        const previousScrollHeight = previousScrollHeightRef.current;
        const currentScrollHeight = element.scrollHeight;

        // Define a tolerance for how close to the bottom counts as "at the bottom"
        const SCROLL_BUFFER = 10; // Pixels. Adjust as needed.

        // Determine if the user was near the bottom *before* this update potentially changed scrollHeight
        let wasNearBottom = false;
        if (previousScrollHeight === null) {
            // If it's the first render/content addition, assume we want to scroll to the bottom.
            wasNearBottom = true;
        } else {
            // Check if the scroll position was close to the bottom relative to the *previous* height
            // This prevents overriding manual scroll-up.
            wasNearBottom =
                previousScrollHeight -
                    element.scrollTop -
                    element.clientHeight <
                SCROLL_BUFFER;
        }

        // Update the stored scroll height for the *next* render's comparison AFTER calculations
        previousScrollHeightRef.current = currentScrollHeight;

        // Only auto-scroll if new content was added OR it's the initial load,
        // AND the user was already near the bottom before this update.
        if (
            wasNearBottom &&
            (previousScrollHeight === null ||
                currentScrollHeight > previousScrollHeight)
        ) {
            // Scroll to the new bottom
            element.scrollTop = element.scrollHeight;
        }

        // Note: We no longer need the isUserScrollingUp state or the scroll event listener.
        // The decision is based purely on the scroll position *before* the content update.
    }, [dependency, ref]); // Rerun only when dependency (content) or ref changes
}
