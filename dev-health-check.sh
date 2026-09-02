#!/bin/bash
set -e

echo "1. Pinging Redis..."
if docker exec mediflow_redis redis-cli ping > /dev/null 2>&1; then
    echo "Redis ping successful (PONG)"
else
    echo "Redis ping failed"
    exit 1
fi

echo "2. Logging in to get token..."
RESPONSE=$(curl -s -X POST http://localhost:8000/api/v1/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"phone": "9999999992", "password": "Admin123"}')

TOKEN=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('access', ''))" 2>/dev/null || echo "")
OUTLET_ID=$(echo "$RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('user', {}).get('outletId', ''))" 2>/dev/null || echo "")

if [ -z "$TOKEN" ] || [ -z "$OUTLET_ID" ]; then
  echo "Failed to get token or outletId! Response was: $RESPONSE"
  exit 1
fi
echo "Token and Outlet ID successfully retrieved."

echo "3. Testing GET /api/v1/purchases/"
PURCHASES_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "http://localhost:8000/api/v1/purchases/?outletId=$OUTLET_ID&page=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Outlet-Id: $OUTLET_ID")
echo "Purchases API returned HTTP $PURCHASES_STATUS"

echo "4. Testing GET /api/v1/sales/"
SALES_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X GET "http://localhost:8000/api/v1/sales/?outletId=$OUTLET_ID&page=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Outlet-Id: $OUTLET_ID")
echo "Sales API returned HTTP $SALES_STATUS"

if [ "$PURCHASES_STATUS" = "200" ] && [ "$SALES_STATUS" = "200" ]; then
    echo "All health checks passed!"
    exit 0
else
    echo "One or more API checks failed."
    exit 1
fi
