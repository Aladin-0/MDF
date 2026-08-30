# apps/gst/conf.py

# B2CL Threshold for inter-state unregistered supplies
# As per Notification No. 12/2024 (Central Tax), reduced from 250000 to 100000.
B2CL_THRESHOLD = 100000
B2CL_THRESHOLD_EFFECTIVE_FROM = "2024-08-01"

class GSTR3BValidationConfig:
    # Tolerances for GSTR-2B ITC reconciliation
    TOLERANCE_VALUE_TAX = 1.00  # ± ₹1.00 for values/taxes
    TOLERANCE_DATE_DAYS = 2     # ± 2 days for invoice date
    TOLERANCE_TAX_RATE = 0.01   # ± 1% for tax rate comparisons

    # Tolerances for GSTR-3B validation
    TOLERANCE_LIABILITY_SHORTFALL = 100.0  # ₹100 allowed shortfall vs GSTR-1
    TOLERANCE_EXCESS_ITC = 100.0           # ₹100 allowed excess vs GSTR-2B
    TOLERANCE_GSTR1_MISMATCH = 100.0       # ₹100 general mismatch tolerance vs GSTR-1
    TOLERANCE_ITC_REVERSAL_SPIKE_PCT = 50.0 # 50% spike in reversals triggers warning
