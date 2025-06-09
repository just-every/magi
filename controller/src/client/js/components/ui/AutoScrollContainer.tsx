import React, { useState, useEffect, useRef, useCallback } from 'react';

// Define the props for the AutoScrollContainer component
interface AutoScrollContainerProps {
    children: React.ReactNode; // Content to be rendered inside the scrollable container
    className?: string; // Optional CSS classes for the container
    threshold?: number; // Optional threshold (in pixels) to re-enable auto-scroll when near the bottom
    style?: React.CSSProperties; // Optional inline styles for the container
}

/**
 * AutoScrollContainer Component
 *
 * A container that automatically scrolls to the bottom when new children are added,
 * unless the user has manually scrolled up. Auto-scrolling resumes if the user
 * scrolls back close to the bottom.
 */
const AutoScrollContainer: React.FC<AutoScrollContainerProps> = ({
    children,
    className = '',
    threshold = 20, // Default threshold of 20px
    style = {}, // Default to empty style object
}) => {
    // Ref to the scrollable div element
    const scrollRef = useRef<HTMLDivElement>(null);
    // State to track if the user is manually scrolled up
    const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
    // State to track the previous scroll height to detect content changes reliably
    const [prevScrollHeight, setPrevScrollHeight] = useState<number | null>(
        null
    );

    /**
     * Scrolls the container to the bottom.
     */
    const scrollToBottom = useCallback(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, []);

    /**
     * Effect to handle scrolling when children update.
     * Scrolls to bottom only if the user isn't manually scrolled up OR
     * if the scroll height has changed (indicating new content).
     */
    useEffect(() => {
        if (scrollRef.current) {
            const { scrollHeight } = scrollRef.current;

            // Check if new content might have been added by comparing scroll heights
            const hasContentChanged = prevScrollHeight !== scrollHeight;

            // Only scroll down if not manually scrolled up AND content has changed
            if (!isUserScrolledUp && hasContentChanged) {
                scrollToBottom();
            }

            // Update the previous scroll height *after* potential scroll adjustment
            // This ensures we correctly detect the *next* content change
            if (hasContentChanged) {
                setPrevScrollHeight(scrollHeight);
            }
        }
        // Dependency array: Re-run when children change or auto-scroll status changes.
        // Don't include prevScrollHeight to avoid infinite loops
    }, [children, scrollToBottom, isUserScrolledUp]);

    /**
     * Effect to scroll to bottom on initial mount and set initial scroll height.
     */
    useEffect(() => {
        scrollToBottom();
        // Initialize prevScrollHeight on mount
        if (scrollRef.current) {
            setPrevScrollHeight(scrollRef.current.scrollHeight);
        }
    }, [scrollToBottom]); // Run only once on mount

    /**
     * Handles the scroll event on the container.
     * Determines if the user has manually scrolled up or scrolled back down near the bottom.
     */
    const handleScroll = useCallback(() => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            // Calculate distance from the bottom
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

            // Use a small buffer (e.g., 1px) for floating point inaccuracies
            const buffer = 1;

            // If the distance from the bottom is greater than the threshold + buffer,
            // assume the user has scrolled up manually.
            if (distanceFromBottom > threshold + buffer) {
                // Only update state if it's changing to avoid unnecessary re-renders
                setIsUserScrolledUp(prev => {
                    if (!prev) return true;
                    return prev;
                });
            } else {
                // If the user scrolls back down within the threshold, re-enable auto-scrolling.
                setIsUserScrolledUp(prev => {
                    if (prev) return false;
                    return prev;
                });
            }
        }
    }, [threshold]); // Dependency: threshold

    return (
        <div
            ref={scrollRef}
            onScroll={handleScroll}
            className={`overflow-y-auto ${className}`} // Ensure vertical scrolling is enabled
            style={{ WebkitOverflowScrolling: 'touch', ...style }} // Merge default styles with custom styles
        >
            {children}
        </div>
    );
};

export default AutoScrollContainer;
