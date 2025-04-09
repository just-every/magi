import * as React from 'react';
import { useSocket } from '../../context/SocketContext';
import { useState, useEffect } from 'react';

/**
 * Cost Display Component
 *
 * Displays real-time LLM cost information in a fixed position in the top right corner
 */
/**
 * Cost Display Component
 *
 * Displays real-time LLM cost information using the updated GlobalCostData structure.
 */
const CostDisplay: React.FC = () => {
	// Assume useSocket returns data conforming to GlobalCostData | null
	const { costData } = useSocket();
	const [expanded, setExpanded] = useState<boolean>(false);

	// Render nothing if cost data is not yet available
	if (!costData) {
		return null;
	}

	// Formatter for detailed costs (e.g., total cost, model costs)
	const costFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 4, // Show more precision for small costs
		maximumFractionDigits: 4
	});

	// Formatter for cost per minute (less precision needed)
	const costPerMinFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});

	// Formatter for tokens (integer)
	const tokenFormatter = new Intl.NumberFormat('en-US');

	// Formatter for dates/times
	const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
		year: 'numeric', month: 'short', day: 'numeric',
		hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
	});

	// Convert the models object into a sorted array for display
	const sortedModelCosts = Object.entries(costData.usage.models)
		.map(([modelName, data]) => ({
			model: modelName,
			cost: data.cost,
			calls: data.calls
		}))
		.sort((a, b) => b.cost - a.cost); // Sort by cost, highest first

	// Safely format dates, handling potential invalid date strings
	const formatDateTime = (dateString: string): string => {
		try {
			return dateTimeFormatter.format(new Date(dateString));
		} catch (e) {
			return "Invalid Date";
		}
	};

	return (
		// Using basic inline styles and Bootstrap classes for layout
		<div
			className={"position-fixed p-2 "+(expanded ? 'bg-light border rounded shadow-sm' : '')} // Added background/shadow
			style={{
				top: '10px',
				right: '10px', // Adjusted position slightly
				zIndex: 1050, // Ensure it's above most elements
				fontSize: '0.8rem', // Slightly smaller font
				minWidth: '160px', // Set a min-width
				maxWidth: expanded ? '350px' : '160px', // Adjust max-width for expanded state
				transition: 'max-width 0.3s ease-in-out',
				cursor: 'pointer',
				userSelect: 'none' // Prevent text selection on click
			}}
			onClick={() => setExpanded(!expanded)}
			title={expanded ? "Click to collapse" : "Click to expand"} // Add tooltip
		>
			{/* Always Visible Section */}
			<div className={"d-flex align-items-center mb-1 "+(expanded ? 'justify-content-between' : 'justify-content-end')}>
				{expanded && <span className="fw-bold text-secondary">Total Cost:</span>}
				<span className={"fw-bold "+(expanded ? 'text-dark' : 'text-white')}>{(costData.usage.cost.total < 0.1 ? costFormatter : costPerMinFormatter).format(costData.usage.cost.total)}</span>
			</div>
			<div className={"d-flex align-items-center mb-1 "+(expanded ? 'justify-content-between' : 'justify-content-end')}>
				{expanded && <span className="fw-bold text-secondary">Current Rate:</span>}
				<span className={(expanded ? 'text-dark' : 'text-white')}>{costPerMinFormatter.format(costData.costPerMinute)}/min</span>
			</div>

			{/* Expanded Section */}
			{expanded && (
				<div className="mt-2 border-top pt-2">
					{/* --- Model Details --- */}
					<div className="fw-bold mb-1 text-dark">Models Used:</div>
					{sortedModelCosts.length > 0 ? (
						sortedModelCosts.map(model => (
							<div key={model.model} className="d-flex justify-content-between align-items-center small mb-1">
								<span title={model.model} className="text-muted me-2" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
									{model.model}:
								</span>
								<span className="text-dark">{costFormatter.format(model.cost)} ({model.calls} calls)</span>
							</div>
						))
					) : (
						<div className="small text-muted fst-italic">No model usage yet.</div>
					)}

					{/* --- Token Details --- */}
					<div className="fw-bold mb-1 mt-2 text-dark">Tokens:</div>
					<div className="d-flex justify-content-between align-items-center small">
						<span className="text-muted">Input:</span>
						{/* Access input tokens via usage.tokens.input */}
						<span className="text-dark">{tokenFormatter.format(costData.usage.tokens.input)}</span>
					</div>
					<div className="d-flex justify-content-between align-items-center small">
						<span className="text-muted">Output:</span>
						{/* Access output tokens via usage.tokens.output */}
						<span className="text-dark">{tokenFormatter.format(costData.usage.tokens.output)}</span>
					</div>

					{/* --- System Info --- */}
					<div className="fw-bold mb-1 mt-2 text-dark">System Info:</div>
					<div className="d-flex justify-content-between align-items-center small">
						<span className="text-muted">Processes:</span>
						{/* numProcesses is directly available */}
						<span className="text-dark">{costData.numProcesses}</span>
					</div>
					<div className="d-flex justify-content-between align-items-center small">
						<span className="text-muted">Tracking Since:</span>
						{/* systemStartTime is directly available */}
						<span className="text-dark">{formatDateTime(costData.systemStartTime)}</span>
					</div>
					<div className="d-flex justify-content-between align-items-center small">
						<span className="text-muted">Last Update Inc.:</span>
						{/* Access last update time via usage.time.now */}
						<span className="text-dark">{formatDateTime(costData.usage.time.now)}</span>
					</div>

					<div className="d-flex justify-content-between align-items-center small">
                        <span className="text-muted">Cost (Last Min*):</span>
                        <span className="text-dark">{costFormatter.format(costData.usage.cost.last_min)}</span>
                    </div>

					<div className="text-center small text-muted mt-2 fst-italic">Click to collapse</div>
				</div>
			)}
		</div>
	);
};

export default CostDisplay;
