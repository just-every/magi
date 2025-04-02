import * as React from 'react';
import { useSocket } from '../../context/SocketContext';
import { useState, useEffect } from 'react';

/**
 * Cost Display Component
 * 
 * Displays real-time LLM cost information in a fixed position in the top right corner
 */
const CostDisplay: React.FC = () => {
	const { costData } = useSocket();
	const [expanded, setExpanded] = useState<boolean>(false);
	
	if (!costData) {
		return null;
	}
	
	const formatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 4,
		maximumFractionDigits: 4
	});
	
	const costPerMinFormatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	});
	
	// Sort model costs by cost (highest first)
	const sortedModelCosts = [...costData.modelCosts].sort((a, b) => b.cost - a.cost);
	
	return (
		<div 
			className="position-fixed cost-display rounded p-2"
			style={{ 
				top: '10px', 
				right: '10px', 
				zIndex: 1000,
				fontSize: '0.85rem',
				maxWidth: expanded ? '300px' : '150px',
				transition: 'max-width 0.3s ease-in-out',
				cursor: 'pointer'
			}}
			onClick={() => setExpanded(!expanded)}
		>
			<div className="d-flex justify-content-between align-items-center">
				<span className="fw-bold">Total Cost:</span>
				<span>{formatter.format(costData.totalCost)}</span>
			</div>
			
			<div className="d-flex justify-content-between align-items-center">
				<span className="fw-bold">Per Minute:</span>
				<span>{costPerMinFormatter.format(costData.costPerMinute)}/min</span>
			</div>
			
			{expanded && (
				<div className="mt-2 border-top pt-2">
					<div className="fw-bold mb-1">Models:</div>
					{sortedModelCosts.map(model => (
						<div key={model.model} className="d-flex justify-content-between align-items-center small">
							<span title={model.model} className="model-name">
								{model.model}:
							</span>
							<span>{formatter.format(model.cost)} ({model.calls})</span>
						</div>
					))}
					
					{costData.numProcesses && (
						<div className="d-flex justify-content-between align-items-center mt-1">
							<span className="fw-bold">Processes:</span>
							<span>{costData.numProcesses}</span>
						</div>
					)}
					
					{costData.thoughtLevel !== undefined && (
						<div className="d-flex justify-content-between align-items-center">
							<span className="fw-bold">Thought Level:</span>
							<span>{costData.thoughtLevel}</span>
						</div>
					)}
					
					{costData.delay !== undefined && (
						<div className="d-flex justify-content-between align-items-center">
							<span className="fw-bold">Delay:</span>
							<span>{costData.delay}ms</span>
						</div>
					)}
					
					<div className="text-center small text-muted mt-1">Click to collapse</div>
				</div>
			)}
		</div>
	);
};

export default CostDisplay;