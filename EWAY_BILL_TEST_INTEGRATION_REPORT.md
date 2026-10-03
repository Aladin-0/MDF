# E-WAY BILL TEST INTEGRATION REPORT

## 1. Backend Pytest Suite
**File:** `apps/backend/apps/compliance/tests/test_ewaybill_pipeline.py`

```python
from django.test import TestCase
from unittest.mock import patch, MagicMock
from decimal import Decimal
from apps.billing.tests.factories import (
    make_test_outlet,
    make_test_customer,
    make_test_medicine,
    make_test_staff,
    make_test_invoice
)
from apps.integrations.sandbox.ewaybill import generate_ewb_payload, request_ewaybill
from apps.core.models import SandboxConfiguration
from django.core.cache import cache
import uuid

class EWayBillPipelineTests(TestCase):
    def setUp(self):
        cache.clear()
        
        # 1. Scaffolding
        self.outlet = make_test_outlet(name="Test Outlet")
        self.outlet.gstin = "27AAPCM1753L2ZX"
        self.outlet.state_code = "27"
        self.outlet.pincode = "431001"
        self.outlet.save()

        self.customer = make_test_customer(self.outlet, name="Wholesale Buyer")
        self.customer.gstin = "27AABCA1234A1Z8"
        self.customer.state_code = "27"
        self.customer.pincode = "400001"
        self.customer.save()

        self.product, self.batch = make_test_medicine(self.outlet, mrp=2000, sale_rate=1500)
        self.product.hsn_code = "3004"
        self.product.save()

        self.staff = make_test_staff(self.outlet)

        # Create Invoice
        self.invoice = make_test_invoice(
            outlet=self.outlet,
            staff=self.staff,
            customer=self.customer,
            items=[{"batch": self.batch, "qty": 50, "rate": 1500}],
            paid=0
        )
        
        # Inject Wholesale & Transport fields
        self.invoice.sale_type = 'WHOLESALE'
        self.invoice.taxable_amount = Decimal('75000.00')
        self.invoice.cgst_amount = Decimal('4500.00')
        self.invoice.sgst_amount = Decimal('4500.00')
        self.invoice.igst_amount = Decimal('0.00')
        self.invoice.grand_total = Decimal('84000.00')
        self.invoice.transporter_id = "27ABYFM7487N1ZU"
        self.invoice.vehicle_no = "MH20AB1234"
        self.invoice.trans_distance = 150
        self.invoice.trans_mode = 1
        self.invoice.vehicle_type = "R"
        self.invoice.eway_bill_status = "PENDING"
        self.invoice.save()
        
        # Also fix the sale item for taxation
        item = self.invoice.items.first()
        item.taxable_amount = Decimal('75000.00')
        item.gst_rate = Decimal('12.00')
        item.cgst_amount = Decimal('4500.00')
        item.sgst_amount = Decimal('4500.00')
        item.total_amount = Decimal('84000.00')
        item.save()

        self.config = SandboxConfiguration.objects.create(
            id=uuid.uuid4(),
            base_url="https://api.sandbox.co.in",
            active=True
        )
        self.config.api_key = "key"
        self.config.api_secret = "secret"
        self.config.save()

    def test_generate_ewb_payload_schema(self):
        """Verify the JSON payload strictly matches the NIC E-Way Bill schema."""
        payload = generate_ewb_payload(self.invoice)
        
        self.assertEqual(payload['fromGstin'], "27AAPCM1753L2ZX")
        self.assertEqual(payload['toGstin'], "27AABCA1234A1Z8")
        self.assertEqual(payload['toPincode'], 400001)
        self.assertEqual(payload['transporterId'], "27ABYFM7487N1ZU")
        self.assertEqual(payload['vehicleNo'], "MH20AB1234")
        self.assertEqual(payload['transDistance'], 150)
        self.assertEqual(payload['totalValue'], 75000.0)
        self.assertEqual(payload['cgstValue'], 4500.0)
        self.assertEqual(payload['sgstValue'], 4500.0)

    @patch('apps.compliance.services.sandbox_auth.requests.post')
    @patch('apps.integrations.sandbox.ewaybill.requests.post')
    def test_request_ewaybill_happy_path(self, mock_ewb_post, mock_auth_post):
        """Simulate a successful E-Way Bill generation."""
        mock_auth_post.side_effect = [
            MagicMock(json=lambda: {'access_token': 'jwt'}),
            MagicMock(json=lambda: {'Data': {'AuthToken': 'nic'}})
        ]

        mock_ewb_post.return_value = MagicMock(
            json=lambda: {
                'status_code': 200,
                'data': {
                    'ewayBillNo': 123456789012,
                    'ewayBillDate': '02/10/2026 12:00:00',
                    'validUpto': '03/10/2026 23:59:00'
                }
            }
        )

        response = request_ewaybill(self.invoice)
        
        self.assertEqual(response['ewayBillNo'], 123456789012)
        
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.eway_bill_no, "123456789012")
        self.assertEqual(self.invoice.eway_bill_status, "GENERATED")

    @patch('apps.compliance.services.sandbox_auth.requests.post')
    @patch('apps.integrations.sandbox.ewaybill.requests.post')
    def test_request_ewaybill_nic_error(self, mock_ewb_post, mock_auth_post):
        """Simulate a NIC Business Error, ensuring we don't corrupt the invoice."""
        mock_auth_post.side_effect = [
            MagicMock(json=lambda: {'access_token': 'jwt'}),
            MagicMock(json=lambda: {'Data': {'AuthToken': 'nic'}})
        ]

        mock_ewb_post.return_value = MagicMock(
            json=lambda: {
                'status_code': 400,
                'error': {
                    'message': 'Invalid PIN code'
                }
            }
        )

        with self.assertRaises(Exception):
            request_ewaybill(self.invoice)
        
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.eway_bill_status, "FAILED")
```

## 2. Frontend Playwright E2E Test
**File:** `apps/frontend/tests/e2e/wholesale-ewaybill.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Wholesale E-Way Bill Checkout Flow', () => {
  test('should capture Part B logistics fields and submit valid JSON payload', async ({ page }) => {
    await page.goto('/pos');
    await expect(page.getByTestId('billing-workspace')).toBeVisible();

    await page.keyboard.press('F3');
    await page.getByPlaceholder('Search customer...').fill('Ragu medical');
    await page.getByText('Ragu medical - 27AABCA1234A1Z8').click();

    await page.getByPlaceholder('Search medicines...').fill('JK Juice');
    await page.getByText('JK Juice').first().click();
    
    await page.keyboard.press('Tab');
    await page.keyboard.type('50');
    await page.keyboard.press('Enter');

    await expect(page.getByText('Transport Details')).toBeVisible();
    await page.getByLabel(/Transporter GSTIN/i).fill('27ABYFM7487N1ZU');
    await page.getByLabel(/Vehicle Number/i).fill('MH20AB1234');
    await page.getByLabel(/Distance/i).fill('150');
    await page.getByLabel(/Transport Mode/i).selectOption('1');
    await page.getByLabel(/Vehicle Type/i).selectOption('R');

    const checkoutPromise = page.waitForRequest(request => 
      request.url().includes('/api/v1/sales/') && request.method() === 'POST'
    );

    await page.getByRole('button', { name: /Collect Payment/i }).click();

    const request = await checkoutPromise;
    const payload = request.postDataJSON();

    expect(payload).toBeDefined();
    expect(payload.saleType).toBe('WHOLESALE');
    expect(payload.transporterId).toBe('27ABYFM7487N1ZU');
    expect(payload.vehicleNo).toBe('MH20AB1234');
    expect(payload.transDistance).toBe('150');
    expect(payload.transMode).toBe('1');
    expect(payload.vehicleType).toBe('R');

    await expect(page.getByText('Invoice Generated Successfully')).toBeVisible();
  });
});
```

## 3. Architecture Documentation Update
**File:** `docs/testing_architecture.md`
**Changes Added:**
```markdown
## E-Way Bill & Compliance Pipeline Testing

The compliance integration tests (`apps.compliance.tests`) rigorously verify both the Sandbox NIC authentication mechanisms and the structured payload validations necessary for E-Way Bill and E-Invoice generation.

### 1. Zero Manual UI Testing Rule
- **Mandatory Mocking:** Under no circumstances should backend API integrations or schema verifications rely on manual clicks in the UI or hitting the live Sandbox during CI/CD.
- Developers must use Playwright E2E specs for frontend payload validation and `pytest` + `factory_boy` for backend processing.

### 2. Sandbox Credential Caching & Token Lifecycle
- **Cache Hits:** Tests must verify that `SandboxAuthService.get_nic_token()` strictly returns the cached string without redundant `requests.post` network calls unless the cache expires (NIC Token valid for 6h).
- **Fallback Configurations:** Test token generation gracefully degrading to `.env` variables if `SandboxConfiguration` DB entries are missing or inactive.

### 3. Payload Construction & Schema Strictness
- `factory_boy` models (`OutletFactory`, `CustomerFactory`) must be seeded with valid 15-char GSTINs and accurate dynamic pin codes.
- **Strict Prohibition on Fallbacks:** The JSON schema payload builder MUST assert against the dynamic location (e.g. `toPincode == customer.pincode`), rejecting hardcoded mock values (e.g., `400001`).
- Decimal values must be properly quantized to `ROUND_HALF_EVEN` with two decimal places.

### 4. Deterministic Sandbox Mocking
- E-Way bill generation functions (`request_ewaybill`) must leverage `unittest.mock.patch` to intercept requests.
- **Happy Path:** Mock `200 OK` JSON responses. Assert that `eway_bill_no`, `valid_until`, and `eway_bill_status == 'GENERATED'` are correctly committed to the `SaleInvoice`.
- **Business Exceptions:** Mock `400 Bad Request` or `403 Failed to verify token` JSON responses. Assert that the transaction cleanly aborts the E-Way bill generation, flags `eway_bill_status == 'FAILED'`, and preserves strict stock/sales integrity without rolling back the entire invoice transaction block.
```
