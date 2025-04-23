import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

// Component for displaying text with start-truncation when overflowing 2 lines
interface TruncatedStartTextProps {
    text: string;
}

export const TruncatedStartText: React.FC<TruncatedStartTextProps> = ({
    text,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);

    useEffect(() => {
        const checkOverflow = () => {
            if (containerRef.current && textRef.current) {
                const containerHeight = containerRef.current.clientHeight;
                const textHeight = textRef.current.scrollHeight;

                const isTextOverflowing = textHeight > containerHeight;
                setIsOverflowing(isTextOverflowing);

                // If text is overflowing, scroll to show the end
                if (isTextOverflowing && containerRef.current) {
                    containerRef.current.scrollTop = textHeight;
                }
            }
        };

        // Check initially
        checkOverflow();

        // Set up resize observer to check when container size changes
        const resizeObserver = new ResizeObserver(() => {
            checkOverflow();
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => {
            if (containerRef.current) {
                resizeObserver.unobserve(containerRef.current);
            }
        };
    }, [text]);

    return (
        <div
            ref={containerRef}
            style={{
                height: '2.8em', // 2 lines of text (adjust as needed)
                lineHeight: '1.4em',
                overflow: 'hidden',
                position: 'relative',
                wordBreak: 'break-word',
            }}
        >
            {isOverflowing && (
                <span
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        backgroundColor: 'inherit',
                        paddingRight: '2px',
                        zIndex: 1,
                    }}
                >
                    ...
                </span>
            )}
            <div ref={textRef}>{text}</div>
        </div>
    );
};
