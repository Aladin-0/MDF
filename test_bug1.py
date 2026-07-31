import requests

url = "http://localhost:8000/api/v1/sales/"
payload = {
  "invoiceDate": "2026-07-23",
  "customerLedgerId": None,
  "cashPaid": 0,
  "upiPaid": 0,
  "cardPaid": 0,
  "items": [
    {
      "productId": "00000000-0000-0000-0000-000000000000",
      "batchId": None,
      "qtyStrips": 1,
      "qtyLoose": 0,
      "mrp": 100,
      "rate": 100,
      "discountPct": 0,
      "gstRate": 12,
      "taxableAmount": 89.29,
      "gstAmount": 10.71,
      "totalAmount": 100,
      "saleMode": "strip"
    }
  ],
  "scheduleHData": None
}

# Need to login or use an outlet
# Actually I will just run pytest or a django management command to reproduce this instead of a raw request
