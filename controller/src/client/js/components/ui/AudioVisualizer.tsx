import React, { useEffect, useRef, useState } from 'react';

interface AudioVisualizerProps {
    audioContext: AudioContext | null;
    source: MediaStreamAudioSourceNode | null;
    height?: number;
    barCount?: number;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
    audioContext,
    source,
    height = 24,
    barCount = 20,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const animationRef = useRef<number>();
    const analyserRef = useRef<AnalyserNode | null>(null);
    const [containerWidth, setContainerWidth] = useState(200);

    // Observe container size changes
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                if (width > 0) {
                    setContainerWidth(width);
                }
            }
        });

        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    useEffect(() => {
        if (!audioContext || !source || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size based on container
        canvas.width = containerWidth;
        canvas.height = height;

        // Create analyser with same settings as the example
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64; // Same as example
        analyser.smoothingTimeConstant = 0.8;

        // Connect source to analyser
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        // Add left padding
        const leftPadding = 10;
        const availableWidth = containerWidth - leftPadding;

        // Calculate bar width and gap
        const barWidth = Math.floor((availableWidth / barCount) * 0.5);
        const barGap = Math.floor((availableWidth / barCount) * 0.5);
        const totalBarWidth = barWidth + barGap;

        const draw = () => {
            animationRef.current = requestAnimationFrame(draw);

            // Get frequency data
            analyser.getByteFrequencyData(dataArray);

            // Clear canvas with transparent background
            ctx.clearRect(0, 0, containerWidth, height);

            // Calculate step to distribute bars evenly across frequency data
            const step = Math.floor(dataArray.length / barCount);

            // Draw bars
            for (let i = 0; i < barCount; i++) {
                const value = dataArray[i * step];
                // Scale height: minimum 2px, maximum is canvas height * 0.8
                const barHeight = Math.max(2, (value / 255) * height * 0.8);

                const x = leftPadding + i * totalBarWidth;
                const y = height - barHeight;

                // Skip drawing if bar would be outside canvas
                if (x + barWidth > containerWidth) break;

                // Set color and draw rounded rect
                ctx.fillStyle = '#00a2ff';

                // Draw rounded rectangle
                const radius = 1.5; // Slightly rounded corners
                ctx.beginPath();
                ctx.moveTo(x + radius, y);
                ctx.lineTo(x + barWidth - radius, y);
                ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
                ctx.lineTo(x + barWidth, y + barHeight - radius);
                ctx.quadraticCurveTo(
                    x + barWidth,
                    y + barHeight,
                    x + barWidth - radius,
                    y + barHeight
                );
                ctx.lineTo(x + radius, y + barHeight);
                ctx.quadraticCurveTo(
                    x,
                    y + barHeight,
                    x,
                    y + barHeight - radius
                );
                ctx.lineTo(x, y + radius);
                ctx.quadraticCurveTo(x, y, x + radius, y);
                ctx.closePath();
                ctx.fill();
            }
        };

        draw();

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
            if (analyserRef.current) {
                try {
                    // Disconnect the analyser from the source if it's connected
                    if (source) {
                        source.disconnect(analyserRef.current);
                    }
                } catch (e) {
                    // Node might already be disconnected, which is fine
                    console.debug(
                        'AudioVisualizer cleanup: Node already disconnected'
                    );
                }
                analyserRef.current = null;
            }
        };
    }, [audioContext, source, containerWidth, height, barCount]);

    return (
        <div
            ref={containerRef}
            style={{ width: '100%', height: height + 'px' }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    display: 'block',
                    width: '100%',
                    height: height + 'px',
                }}
            />
        </div>
    );
};

export default AudioVisualizer;
