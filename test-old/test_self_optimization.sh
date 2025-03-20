#!/bin/bash

echo "===== Testing Self-Optimization ====="

# Run the Python test suite first
echo -e "\nRunning Python tests..."
python test/test_self_optimization.py

# Run MAGI with self-optimization enabled
echo -e "\nRunning MAGI with self-optimization enabled..."
./test/magi-python.sh -p "Calculate the square root of 144 and tell me the result." --self-optimization true

# Run MAGI with self-optimization disabled
echo -e "\nRunning MAGI with self-optimization disabled..."
./test/magi-python.sh -p "Calculate the square root of 144 and tell me the result." --self-optimization false

echo -e "\nAll tests completed."