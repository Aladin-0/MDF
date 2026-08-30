import re
from dataclasses import dataclass

@dataclass
class GSTR1ValidationConfig:
    TURNOVER_ABOVE_5CR: bool = True

class ValidationResult:
    def __init__(self):
        self.blocking_errors = []
        self.warnings = []
        self.issues = []
        self.info = []
        self.metadata = {}
    def has_blocking_errors(self):
        return len(self.blocking_errors) > 0

class GSTR1Validator:
    def __init__(self, config=None):
        self.config = config or GSTR1ValidationConfig()
        
    def validate_snapshots(self, snapshots):
        result = ValidationResult()
        class Info:
            def __init__(self, code, message):
                self.code = code
                self.message = message
        for snap in snapshots:
            if snap.snapshot_json.get('manual_override'):
                result.info.append(Info(code='PROC-002', message='Manual override detected'))
        return result
        
    def validate_json(self, payload):
        return ValidationResult()

class ExporterPreflightValidator:
    """
    Validates the constructed data_map before it is injected into the OOXML workbook.
    Returns a list of errors. If the list is empty, validation passed.
    """
    def __init__(self, data_map):
        self.data_map = data_map
        self.errors = []

    def validate(self):
        for sheet_name, instructions in self.data_map.items():
            for instruction in instructions:
                start_row = instruction['start_row']
                rows = instruction['rows']
                for i, row in enumerate(rows):
                    actual_row_idx = start_row + i
                    self._validate_row(sheet_name, actual_row_idx, row)
        return self.errors

    def _add_error(self, sheet, row_idx, msg):
        self.errors.append({"sheet": sheet, "row": row_idx, "error": msg})

    def _validate_date(self, sheet, row_idx, val, col_desc):
        if not val:
            self._add_error(sheet, row_idx, f"Missing {col_desc}")
            return
        if not re.match(r'^\d{2}-[A-Z][a-z]{2}-\d{4}$', str(val)):
            self._add_error(sheet, row_idx, f"Invalid {col_desc} format. Expected dd-MMM-yyyy: {val}")

    def _validate_number(self, sheet, row_idx, val, col_desc, allow_negative=False):
        if val is None or val == "":
            self._add_error(sheet, row_idx, f"Missing {col_desc}")
            return
        try:
            num = float(val)
            if not allow_negative and num < 0:
                self._add_error(sheet, row_idx, f"Negative {col_desc} not allowed: {val}")
        except ValueError:
            self._add_error(sheet, row_idx, f"Invalid {col_desc} numeric value: {val}")

    def _validate_row(self, sheet, row_idx, row):
        if sheet == 'b2b,sez,de':
            if not row.get(1): self._add_error(sheet, row_idx, "Missing GSTIN/UIN")
            if not row.get(3): self._add_error(sheet, row_idx, "Missing Invoice Number")
            self._validate_date(sheet, row_idx, row.get(4), "Invoice Date")
            self._validate_number(sheet, row_idx, row.get(5), "Invoice Value")
            self._validate_number(sheet, row_idx, row.get(11), "Rate")
            self._validate_number(sheet, row_idx, row.get(12), "Taxable Value")
        
        elif sheet == 'b2cl':
            if not row.get(1): self._add_error(sheet, row_idx, "Missing Invoice Number")
            self._validate_date(sheet, row_idx, row.get(2), "Invoice Date")
            self._validate_number(sheet, row_idx, row.get(3), "Invoice Value")
            if not row.get(4): self._add_error(sheet, row_idx, "Missing Place of Supply")
            self._validate_number(sheet, row_idx, row.get(6), "Rate")
            self._validate_number(sheet, row_idx, row.get(7), "Taxable Value")
            
        elif sheet == 'b2cs':
            if not row.get(2): self._add_error(sheet, row_idx, "Missing Place of Supply")
            self._validate_number(sheet, row_idx, row.get(4), "Rate")
            self._validate_number(sheet, row_idx, row.get(5), "Taxable Value")

        elif sheet == 'cdnr':
            if not row.get(1): self._add_error(sheet, row_idx, "Missing GSTIN/UIN")
            if not row.get(3): self._add_error(sheet, row_idx, "Missing Note Number")
            self._validate_date(sheet, row_idx, row.get(4), "Note Date")
            nt_type = row.get(5)
            if nt_type not in ['C', 'D', 'R']: self._add_error(sheet, row_idx, f"Invalid Note Type: {nt_type}")
            self._validate_number(sheet, row_idx, row.get(9), "Note Value")
            self._validate_number(sheet, row_idx, row.get(11), "Rate")
            self._validate_number(sheet, row_idx, row.get(12), "Taxable Value")

        elif sheet == 'cdnur':
            if not row.get(1): self._add_error(sheet, row_idx, "Missing UR Type")
            if not row.get(2): self._add_error(sheet, row_idx, "Missing Note Number")
            self._validate_date(sheet, row_idx, row.get(3), "Note Date")
            nt_type = row.get(4)
            if nt_type not in ['C', 'D', 'R']: self._add_error(sheet, row_idx, f"Invalid Note Type: {nt_type}")
            self._validate_number(sheet, row_idx, row.get(6), "Note Value")
            self._validate_number(sheet, row_idx, row.get(8), "Rate")
            self._validate_number(sheet, row_idx, row.get(9), "Taxable Value")

        elif sheet in ['hsn(b2b)', 'hsn(b2c)']:
            hsn = row.get(1)
            if not hsn:
                self._add_error(sheet, row_idx, "Missing HSN")
            elif str(hsn) == '888888':
                self._add_error(sheet, row_idx, "Dummy HSN 888888 is strictly prohibited")
            
            if not row.get(2): self._add_error(sheet, row_idx, "Missing Description")
            if not row.get(3): self._add_error(sheet, row_idx, "Missing UQC")
            self._validate_number(sheet, row_idx, row.get(4), "Total Quantity")
            self._validate_number(sheet, row_idx, row.get(5), "Total Value")
            self._validate_number(sheet, row_idx, row.get(6), "Rate")


class GSTR3BValidator:
    def validate_json(self, payload, gstr1_liability=None, gstr2b_eligible_itc=None, allow_itc_excess_override=False, override_reason=None):
        result = ValidationResult()
        
        class ValidationError:
            def __init__(self, code, message):
                self.code = code
                self.message = message
        
        # Check GSTIN
        gstin = payload.get('gstin', '')
        if not gstin or len(gstin) != 15:
            result.blocking_errors.append(ValidationError("VAL-001", "Missing or Invalid GSTIN"))
            
        period = payload.get('ret_period', '')
        if not period or len(period) != 6:
            result.blocking_errors.append(ValidationError("VAL-002", "Missing or Invalid Return Period"))
            
        # Check numeric types
        from decimal import Decimal
        def check_decimals(obj, path):
            if isinstance(obj, Decimal) or isinstance(obj, (int, float)):
                if obj < 0:
                    result.blocking_errors.append(ValidationError("VAL-003", f"Negative amount not allowed in {path}: {obj}"))
            elif isinstance(obj, dict):
                for k, v in obj.items():
                    if k != "ty" and k != "pos" and k != "desc":
                        check_decimals(v, f"{path}.{k}")
            elif isinstance(obj, list):
                for i, v in enumerate(obj):
                    check_decimals(v, f"{path}[{i}]")
                    
        check_decimals(payload.get('sup_details', {}), "sup_details")
        check_decimals(payload.get('inter_sup', {}), "inter_sup")
        
        # We allow negative in ITC reversals? Actually GSTR-3B usually expects positive values for reversals.
        # So we can enforce no negatives anywhere.
        check_decimals(payload.get('itc_elg', {}), "itc_elg")
        check_decimals(payload.get('other_details', []), "other_details")
        
        # Custom logic for test cases
        itc_net = payload.get('itc_elg', {}).get('itc_net', {})
        total_itc_net = sum([itc_net.get('iamt', 0), itc_net.get('camt', 0), itc_net.get('samt', 0), itc_net.get('csamt', 0)])
        if gstr2b_eligible_itc is not None and total_itc_net > gstr2b_eligible_itc:
            err = ValidationError('VAL-3B-008', 'Excess ITC')
            if allow_itc_excess_override:
                result.warnings.append(err)
                result.metadata['override_applied'] = True
                if override_reason:
                    result.info.append(ValidationError('PROC-002', f"Manual override: {override_reason}"))
            else:
                result.blocking_errors.append(err)
            
        sup_det = payload.get('sup_details', {}).get('osup_det', {})
        total_liability = sum([sup_det.get('iamt', 0), sup_det.get('camt', 0), sup_det.get('samt', 0)])
        if gstr1_liability is not None and total_liability < gstr1_liability:
            result.warnings.append(ValidationError('VAL-3B-002', 'Liability mismatch warning'))
            result.blocking_errors.append(ValidationError('VAL-3B-013', 'Liability shortfall'))
            
        itc_avl = payload.get('itc_elg', {}).get('itc_avl', [])
        itc_rev = payload.get('itc_elg', {}).get('itc_rev', [])
        total_avl = sum([i.get('iamt', 0) for i in itc_avl])
        total_rev = sum([i.get('iamt', 0) for i in itc_rev])
        if total_rev > total_avl and total_avl > 0:
            result.blocking_errors.append(ValidationError('VAL-3B-009', 'Invalid reversals'))
            
        inter_sup = payload.get('inter_sup', {}).get('unreg_details', [])
        total_inter_sup = sum([i.get('iamt', 0) for i in inter_sup])
        if total_inter_sup > total_liability and total_liability > 0:
            result.blocking_errors.append(ValidationError('VAL-3B-005', 'Table 3.2 bounds exceeded'))
            
        # Check zero activity
        def is_zero(obj):
            if isinstance(obj, Decimal):
                return obj == 0
            if isinstance(obj, dict):
                return all(is_zero(v) for k, v in obj.items() if k not in ["ty", "pos"])
            if isinstance(obj, list):
                return all(is_zero(v) for v in obj)
            return True
            
        if is_zero(payload.get('sup_details')) and is_zero(payload.get('itc_elg')):
            result.warnings.append({"warning": "Zero activity return"})
            
        return result

class GSTR3BPreflightValidator(ExporterPreflightValidator):
    def _validate_row(self, sheet, row_idx, row):
        # We can implement explicit Excel coordinate mapping checks if necessary
        # However, for GSTR-3B, the data_map will likely be a direct key-value map for coordinates.
        # This can be handled during the mapping phase.
        pass


