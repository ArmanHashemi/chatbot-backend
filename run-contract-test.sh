#!/bin/bash

# Script to run Dify API contract tests
# This script sets up the environment and runs the Python test suite

echo "🚀 Setting up Dify API Contract Test Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is not installed. Please install Python 3 first.${NC}"
    exit 1
fi

# Navigate to contract-test directory
cd ../contract-test || exit 1

# Install Python dependencies
echo -e "${YELLOW}📦 Installing Python dependencies...${NC}"
pip3 install httpx || pip install httpx

# Load test environment variables
echo -e "${YELLOW}⚙️  Setting up environment variables...${NC}"

# Backend URL (running on port 3001)
export API_URL="http://localhost:3001/v1/chat-messages"

# Test API key and user (these should match what's in backend .env)
export API_KEY="app-test-key-change-me-for-production"
export USER_ID="test-user-id"

# Test query
export QUERY="سلام"

# Logging configuration
export DEBUG_LOG_ENABLED="true"
export DEBUG_LOG_FILE="debug.log"
export SUMMARY_LOG_FILE="summary.log"

# Clear previous logs
rm -f debug.log summary.log

echo -e "${GREEN}✅ Environment configured:${NC}"
echo "   API_URL: $API_URL"
echo "   API_KEY: ${API_KEY:0:20}..."
echo "   USER_ID: $USER_ID"
echo ""

# Check if backend is running
echo -e "${YELLOW}🔍 Checking if backend is running...${NC}"
if curl -s -f http://localhost:3001/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Backend is running${NC}"
else
    echo -e "${RED}❌ Backend is not running!${NC}"
    echo "   Please start the backend first with: npm run dev"
    exit 1
fi

# Run the contract tests
echo -e "${YELLOW}🧪 Running contract tests...${NC}"
echo "========================================="
python3 test_api_schema.py

# Check test results
if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Contract tests completed!${NC}"
    echo ""
    echo "📊 Check the following files for details:"
    echo "   - debug.log (detailed logs)"
    echo "   - summary.log (test summary)"
else
    echo ""
    echo -e "${RED}❌ Contract tests failed!${NC}"
    echo "   Check debug.log and summary.log for details"
fi
