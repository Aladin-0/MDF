curl -s -X POST http://localhost:8000/api/v1/sales/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(jq -r '.cookies[] | select(.name=="access_token").value' apps/frontend/tests/e2e/.auth/admin.json)" \
  -d @/tmp/failed_payload.json > /dev/null &
curl -s -X POST http://localhost:8000/api/v1/sales/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(jq -r '.cookies[] | select(.name=="access_token").value' apps/frontend/tests/e2e/.auth/admin.json)" \
  -d @/tmp/failed_payload.json > /dev/null &
curl -s -X POST http://localhost:8000/api/v1/sales/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(jq -r '.cookies[] | select(.name=="access_token").value' apps/frontend/tests/e2e/.auth/admin.json)" \
  -d @/tmp/failed_payload.json > /dev/null &
wait
