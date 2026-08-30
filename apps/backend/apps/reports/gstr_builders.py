from collections import defaultdict
from typing import Dict, Any, List
from decimal import Decimal

BUSINESS_DIRECTION_SIGN = {
    'sale': 1,
    'purchase': 1,
    'sales_return': -1,
    'purchase_return': -1,
    'sales_credit_note': -1,
    'sales_debit_note': 1,
    'purchase_credit_note': -1,
    'purchase_debit_note': 1,
}

def format_gst_date(dt_input):
    if not dt_input: return None
    from datetime import date, datetime
    if isinstance(dt_input, str):
        if len(dt_input) == 10 and dt_input[4] == '-':
            dt_input = datetime.strptime(dt_input, "%Y-%m-%d").date()
        elif len(dt_input) == 10 and dt_input[2] == '-':
            dt_input = datetime.strptime(dt_input, "%d-%m-%Y").date()
        else:
            from dateutil.parser import parse
            dt_input = parse(dt_input).date()
    months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return f"{dt_input.day:02d}-{months[dt_input.month - 1]}-{dt_input.year}"

from apps.reports.models import GSTTransactionSnapshot

class GSTR1Builder:
    """Builds the GSTR-1 payload from GST Transaction Snapshots."""
    def __init__(self, gstin: str, period: str, db: str = 'default'):
        self.gstin = gstin
        self.period = period
        self.db = db
        self.snapshots = GSTTransactionSnapshot.objects.using(self.db).filter(
            outlet__gstin=gstin,
            period=period,
            transaction_type__in=['sale', 'sales_return', 'sales_credit_note', 'sales_debit_note']
        )
        
        from apps.core.models import Outlet
        import os
        outlet = Outlet.objects.using(self.db).filter(gstin=gstin).first()
        self.default_pos = outlet.state_code if outlet and outlet.state_code else os.environ.get('DEFAULT_POS', '27')

    def build_b2b(self) -> List[Dict]:
        """B2B Invoices (B2B)"""
        b2b_data = defaultdict(lambda: {"inv": []})
        
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            if not json_data.get('is_b2b'):
                continue
                
            cust_gstin = json_data.get('customer_gstin')
            if not cust_gstin:
                continue

            if snap.transaction_type in ['sales_return', 'sales_credit_note', 'sales_debit_note']:
                continue
                
            items = []
            for rate, values in json_data.get('items_by_rate', {}).items():
                if float(values['taxable_amount']) > 0:
                    items.append({
                        "num": len(items) + 1,
                        "itm_det": {
                            "rt": float(rate),
                            "txval": float(values['taxable_amount']),
                            "iamt": float(values['igst']),
                            "camt": float(values['cgst']),
                            "samt": float(values['sgst']),
                            "csamt": float(values['cess'])
                        }
                    })
                    
            if items:
                # Calculate total invoice value (simplified)
                val = sum(i["itm_det"]["txval"] + i["itm_det"]["iamt"] + i["itm_det"]["camt"] + i["itm_det"]["samt"] + i["itm_det"]["csamt"] for i in items)
                b2b_data[cust_gstin]["inv"].append({
                    "inum": snap.document_number,
                    "idt": format_gst_date(snap.document_date),
                    "val": val,
                    "pos": cust_gstin[:2],
                    "rchrg": "N",
                    "inv_typ": "R",
                    "itms": items
                })

        return [{"ctin": k, "inv": v["inv"]} for k, v in b2b_data.items() if v["inv"]]

    def build_b2cs(self) -> List[Dict]:
        """B2C Small (B2CS)"""
        b2cs_agg = defaultdict(lambda: {
            "txval": 0.0,
            "iamt": 0.0,
            "camt": 0.0,
            "samt": 0.0,
            "csamt": 0.0
        })
        
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            if json_data.get('is_b2b'):
                continue
            
            # Exclude non-B2CS (e.g. B2CL) for both sales and returns
            if json_data.get('original_supply_classification', 'B2CS') != 'B2CS':
                continue
            
            # For unregistered, pos is from the snapshot (Place of Supply)
            pos = json_data.get('pos') or self.default_pos
            supplier_state = json_data.get('supplier_state_code') or self.default_pos
            sply_ty = "INTRA" if pos == supplier_state else "INTER"
            
            multiplier = BUSINESS_DIRECTION_SIGN.get(snap.transaction_type, 1)
            
            for rate, values in json_data.get('items_by_rate', {}).items():
                if float(values['taxable_amount']) > 0:
                    key = (pos, sply_ty, float(rate), "OE")
                    b2cs_agg[key]["txval"] += (float(values['taxable_amount']) * float(multiplier))
                    b2cs_agg[key]["iamt"] += (float(values['igst']) * float(multiplier))
                    b2cs_agg[key]["camt"] += (float(values['cgst']) * float(multiplier))
                    b2cs_agg[key]["samt"] += (float(values['sgst']) * float(multiplier))
                    b2cs_agg[key]["csamt"] += (float(values['cess']) * float(multiplier))
                    
        result = []
        for (pos, sply_ty, rate, typ), vals in b2cs_agg.items():
            if vals["txval"] != 0:
                result.append({
                    "sply_ty": sply_ty,
                    "rt": rate,
                    "typ": typ,
                    "pos": pos,
                    "txval": vals["txval"],
                    "iamt": vals["iamt"],
                    "camt": vals["camt"],
                    "samt": vals["samt"],
                    "csamt": vals["csamt"]
                })
        return result

    def build_b2cl(self) -> List[Dict]:
        """B2C Large (B2CL)"""
        b2cl_data = defaultdict(lambda: {"inv": []})
        
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            if json_data.get('is_b2b'):
                continue
            
            # Only B2CL
            if json_data.get('original_supply_classification', 'B2CS') != 'B2CL':
                continue
                
            if snap.transaction_type in ['sales_return', 'sales_credit_note', 'sales_debit_note']:
                continue # Returns are in CDNUR
                
            pos = json_data.get('pos') or self.default_pos
            
            items = []
            for rate, values in json_data.get('items_by_rate', {}).items():
                if float(values['taxable_amount']) > 0:
                    items.append({
                        "num": len(items) + 1,
                        "itm_det": {
                            "rt": float(rate),
                            "txval": float(values['taxable_amount']),
                            "iamt": float(values['igst']),
                            "csamt": float(values['cess'])
                        }
                    })
                    
            if items:
                val = sum(i["itm_det"]["txval"] + i["itm_det"]["iamt"] + i["itm_det"]["csamt"] for i in items)
                b2cl_data[pos]["inv"].append({
                    "inum": snap.document_number,
                    "idt": format_gst_date(snap.document_date),
                    "val": val,
                    "itms": items
                })

        return [{"pos": k, "inv": v["inv"]} for k, v in b2cl_data.items() if v["inv"]]

    def build_hsn(self) -> Dict[str, Any]:
        """HSN Summary"""
        def new_agg():
            return {
                "qty": 0.0,
                "txval": 0.0,
                "iamt": 0.0,
                "camt": 0.0,
                "samt": 0.0,
                "csamt": 0.0
            }
        
        b2b_agg = defaultdict(new_agg)
        b2c_agg = defaultdict(new_agg)
        combined_agg = defaultdict(new_agg)
        
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            multiplier = BUSINESS_DIRECTION_SIGN.get(snap.transaction_type, 1)
            
            is_b2b = json_data.get('is_b2b')
            bucket = None
            
            # 1. Manual override takes precedence
            explicit_classification = json_data.get('hsn_recipient_classification')
            if explicit_classification in ['B2B', 'B2C']:
                bucket = explicit_classification
            else:
                if snap.transaction_type in ['sales_return', 'sales_credit_note', 'sales_debit_note']:
                    # Derive from original supply
                    orig_cls = json_data.get('original_supply_classification')
                    if orig_cls == 'B2B':
                        bucket = 'B2B'
                    elif orig_cls in ['B2CS', 'B2CL']:
                        bucket = 'B2C'
                else:
                    # Normal sale
                    if is_b2b is True:
                        bucket = 'B2B'
                    elif is_b2b is False:
                        bucket = 'B2C'
                        
            if not bucket:
                from django.core.exceptions import ValidationError
                raise ValidationError(f"Cannot derive HSN recipient bucket for snapshot {snap.id}")

            for hsn_code, values in json_data.get('hsn_summary', {}).items():
                if float(values['taxable_amount']) > 0 or values.get('qty', 0) > 0:
                    if hsn_code == '00000000':
                        continue # Filter out dummy HSNs
                    txval = values['taxable_amount']
                    gst = values['igst'] + values['cgst'] + values['sgst']
                    rate = round((gst / txval) * 100) if txval > 0 else 0
                    
                    uqc = values.get('uqc', 'PAC')
                    key = (hsn_code, uqc, float(rate))
                    
                    target_agg = b2b_agg if bucket == 'B2B' else b2c_agg
                    
                    for agg in [target_agg, combined_agg]:
                        agg[key]["qty"] += (values.get('qty', 0) * multiplier)
                        if "desc" in values: agg[key]["desc"] = values["desc"]
                        agg[key]["txval"] += (txval * multiplier)
                        agg[key]["iamt"] += (float(values['igst']) * float(multiplier))
                        agg[key]["camt"] += (float(values['cgst']) * float(multiplier))
                        agg[key]["samt"] += (float(values['sgst']) * float(multiplier))
                        agg[key]["csamt"] += (float(float(values.get('cess', 0))) * float(multiplier))
                    
        def format_result(agg_dict):
            res = []
            for num, ((hsn, uqc, rate), vals) in enumerate(agg_dict.items(), 1):
                if vals["txval"] != 0 or vals["qty"] != 0:
                    val = vals["txval"] + vals["iamt"] + vals["camt"] + vals["samt"] + vals["csamt"]
                    res.append({
                        "num": num,
                        "hsn_sc": hsn,
                        "desc": vals.get("desc", "Personal computers"),
                        "uqc": uqc,
                        "qty": vals["qty"],
                        "val": val,
                        "txval": vals["txval"],
                        "rt": rate,
                        "iamt": vals["iamt"],
                        "camt": vals["camt"],
                        "samt": vals["samt"],
                        "csamt": vals["csamt"]
                    })
            return res
            
        return {
            "data": format_result(combined_agg),
            "b2b": {"data": format_result(b2b_agg)},
            "b2c": {"data": format_result(b2c_agg)}
        }
        
    def build_cdnr(self) -> List[Dict]:
        """Credit/Debit Notes Registered (CDNR)"""
        cdnr_data = defaultdict(lambda: {"nt": []})
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            if snap.transaction_type not in ['sales_return', 'sales_credit_note', 'sales_debit_note'] or not json_data.get('is_b2b'):
                continue
            
            cust_gstin = json_data.get('customer_gstin')
            if not cust_gstin: continue

            items = []
            for rate, values in json_data.get('items_by_rate', {}).items():
                if float(values['taxable_amount']) > 0:
                    items.append({
                        "num": len(items) + 1,
                        "itm_det": {
                            "rt": float(rate),
                            "txval": float(values['taxable_amount']),
                            "iamt": float(values['igst']),
                            "camt": float(values['cgst']),
                            "samt": float(values['sgst']),
                            "csamt": float(values['cess'])
                        }
                    })
            if items:
                val = sum(i["itm_det"]["txval"] + i["itm_det"]["iamt"] + i["itm_det"]["camt"] + i["itm_det"]["samt"] + i["itm_det"]["csamt"] for i in items)
                cdnr_data[cust_gstin]["nt"].append({
                    "nt_num": json_data.get("note_number", snap.document_number),
                    "nt_dt": format_gst_date(json_data.get("note_date") or snap.document_date),
                    "ntty": "D" if snap.transaction_type == "sales_debit_note" else "C",
                    "p_gst": "N",
                    "rsn": json_data.get("reason", "Sales Return"),
                    "val": val,
                    "itms": items
                })
        return [{"ctin": k, "nt": v["nt"]} for k, v in cdnr_data.items() if v["nt"]]

    def build_cdnur(self) -> List[Dict]:
        """Credit/Debit Notes Unregistered (CDNUR)"""
        cdnur_list = []
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            if snap.transaction_type not in ['sales_return', 'sales_credit_note', 'sales_debit_note'] or json_data.get('is_b2b'):
                continue
                
            note_typ = json_data.get("original_supply_classification", "B2CS")
            if note_typ == "B2CS":
                continue # Exclude B2CS returns from CDNUR
                
            items = []
            for rate, values in json_data.get('items_by_rate', {}).items():
                if float(values['taxable_amount']) > 0:
                    items.append({
                        "num": len(items) + 1,
                        "itm_det": {
                            "rt": float(rate),
                            "txval": float(values['taxable_amount']),
                            "iamt": float(values['igst']),
                            "camt": float(values['cgst']),
                            "samt": float(values['sgst']),
                            "csamt": float(values['cess'])
                        }
                    })
            if items:
                val = sum(i["itm_det"]["txval"] + i["itm_det"]["iamt"] + i["itm_det"]["camt"] + i["itm_det"]["samt"] + i["itm_det"]["csamt"] for i in items)
                cdnur_list.append({
                    "typ": note_typ,
                    "nt_num": json_data.get("note_number", snap.document_number),
                    "nt_dt": format_gst_date(json_data.get("note_date") or snap.document_date),
                    "ntty": "C",
                    "p_gst": "N",
                    "rsn": json_data.get("reason", "Sales Return"),
                    "val": val,
                    "itms": items
                })
        return cdnur_list

    def generate_json(self) -> Dict[str, Any]:
        from apps.reports.validators import GSTR1Validator
        
        validator = GSTR1Validator()
        validation_result = validator.validate_snapshots(self.snapshots)
        
        payload = {
            "gstin": self.gstin,
            "fp": self.period,
            "gt": 0.0,
            "cur_gt": 0.0,
            "b2b": self.build_b2b(),
            "b2cl": self.build_b2cl(),
            "b2cs": self.build_b2cs(),
            "cdnr": self.build_cdnr(),
            "cdnur": self.build_cdnur(),
            "hsn": self.build_hsn()
        }
        
        json_validation = validator.validate_json(payload)
        validation_result.issues.extend(json_validation.issues)
        
        payload["_metadata"] = {
            "validation_warnings": [w.__dict__ for w in validation_result.warnings],
            "blocking_errors": [e.__dict__ for e in validation_result.blocking_errors],
            "info": [i.__dict__ for i in validation_result.info],
            "is_valid_for_export": not validation_result.has_blocking_errors()
        }
        return payload

class GSTR3BBuilder:
    """
    Builds the GSTR-3B payload structure strictly based on GST rules
    for ITC, Output tax, Reverse Charge, and Exemptions.
    """
    def __init__(self, gstin: str, period: str, db: str = 'default'):
        self.gstin = gstin
        self.period = period
        self.db = db
        self.snapshots = GSTTransactionSnapshot.objects.using(self.db).filter(
            outlet__gstin=gstin,
            period=period
        )

    def generate_json(self) -> Dict[str, Any]:
        from decimal import Decimal
        
        def new_tax_dict():
            return {"txval": Decimal('0.00'), "iamt": Decimal('0.00'), "camt": Decimal('0.00'), "samt": Decimal('0.00'), "csamt": Decimal('0.00')}

        # Table 3.1
        t31 = {
            "osup_det": new_tax_dict(),
            "osup_zero": {"txval": Decimal('0.00'), "iamt": Decimal('0.00'), "csamt": Decimal('0.00')},
            "osup_nil_exmp": {"txval": Decimal('0.00'), "iamt": Decimal('0.00'), "camt": Decimal('0.00'), "samt": Decimal('0.00')},
            "isup_rev": new_tax_dict(),
            "osup_nongst": new_tax_dict()
        }

        # Table 3.2
        t32_unreg = defaultdict(lambda: {"txval": Decimal('0.00'), "iamt": Decimal('0.00')})

        # Table 4 (ITC Available)
        itc_import_goods = {"iamt": Decimal('0.00'), "csamt": Decimal('0.00')}
        itc_import_services = {"iamt": Decimal('0.00'), "csamt": Decimal('0.00')}
        itc_rcm = {"iamt": Decimal('0.00'), "camt": Decimal('0.00'), "samt": Decimal('0.00'), "csamt": Decimal('0.00')}
        itc_isd = {"iamt": Decimal('0.00'), "camt": Decimal('0.00'), "samt": Decimal('0.00'), "csamt": Decimal('0.00')}
        itc_all_other = {"iamt": Decimal('0.00'), "camt": Decimal('0.00'), "samt": Decimal('0.00'), "csamt": Decimal('0.00')}

        # First, iterate over ALL snapshots for Outward Supplies (Table 3) and RCM Inward liability (3.1.d)
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            is_inward = snap.transaction_type in ['purchase', 'purchase_return', 'purchase_credit_note', 'purchase_debit_note']
            
            # Treat returns as negative amounts
            multiplier = Decimal(str(BUSINESS_DIRECTION_SIGN.get(snap.transaction_type, 1)))

            is_rcm = json_data.get('is_rcm', False)
            is_exempt = json_data.get('is_exempt', False)
            is_b2b = json_data.get('is_b2b', False)
            is_interstate = json_data.get('is_interstate', False)
            pos = json_data.get('pos', '')

            for rate, values in json_data.get('items_by_rate', {}).items():
                tx = Decimal(str(values['taxable_amount'])) * multiplier
                ig = Decimal(str(values['igst'])) * multiplier
                cg = Decimal(str(values['cgst'])) * multiplier
                sg = Decimal(str(values['sgst'])) * multiplier
                cs = Decimal(str(values['cess'])) * multiplier

                is_zero_rated = (rate == '0.0' or rate == '0') and tx > 0 and not is_exempt

                if is_inward:
                    # Inward supplies - ONLY liability side (3.1d) here
                    if is_rcm:
                        t31["isup_rev"]["txval"] += tx
                        t31["isup_rev"]["iamt"] += ig
                        t31["isup_rev"]["camt"] += cg
                        t31["isup_rev"]["samt"] += sg
                        t31["isup_rev"]["csamt"] += cs
                else:
                    # Outward supplies
                    if is_zero_rated:
                        t31["osup_zero"]["txval"] += tx
                        t31["osup_zero"]["iamt"] += ig
                        t31["osup_zero"]["csamt"] += cs
                    elif is_exempt:
                        t31["osup_nil_exmp"]["txval"] += tx
                        t31["osup_nil_exmp"]["iamt"] += ig
                        t31["osup_nil_exmp"]["camt"] += cg
                        t31["osup_nil_exmp"]["samt"] += sg
                    else:
                        t31["osup_det"]["txval"] += tx
                        t31["osup_det"]["iamt"] += ig
                        t31["osup_det"]["camt"] += cg
                        t31["osup_det"]["samt"] += sg
                        t31["osup_det"]["csamt"] += cs
                        if is_interstate and not is_b2b and pos:
                            t32_unreg[pos]["txval"] += tx
                            t32_unreg[pos]["iamt"] += ig

        # Second, iterate over PURCHASE records for Table 4(A) ITC Available
        # Since Sandbox GSTR-2B may not be synced/reconciled, we use seeded purchase snapshots.
        purchases = self.snapshots.filter(
            transaction_type__in=['purchase', 'purchase_return', 'purchase_credit_note', 'purchase_debit_note']
        )
        
        for snap in purchases:
            json_data = snap.snapshot_json
            multiplier = Decimal(str(BUSINESS_DIRECTION_SIGN.get(snap.transaction_type, 1)))
            is_import = json_data.get('is_import', False)
            is_rcm = json_data.get('is_rcm', False)

            for rate, values in json_data.get('items_by_rate', {}).items():
                ig = Decimal(str(values['igst'])) * multiplier
                cg = Decimal(str(values['cgst'])) * multiplier
                sg = Decimal(str(values['sgst'])) * multiplier
                cs = Decimal(str(values['cess'])) * multiplier

                if is_rcm:
                    itc_rcm["iamt"] += ig
                    itc_rcm["camt"] += cg
                    itc_rcm["samt"] += sg
                    itc_rcm["csamt"] += cs
                elif is_import:
                    itc_import_goods["iamt"] += ig
                    itc_import_goods["csamt"] += cs
                else:
                    itc_all_other["iamt"] += ig
                    itc_all_other["camt"] += cg
                    itc_all_other["samt"] += sg
                    itc_all_other["csamt"] += cs

        # Third, include claimed Deferred ITC from previous periods
        from apps.reports.models import DeferredITCEntry
        claimed_deferred = DeferredITCEntry.objects.using(self.db).filter(
            purchase_invoice__outlet__gstin=self.gstin,
            claimed_period=self.period, 
            status='CLAIMED'
        )
        for d in claimed_deferred:
            itc_all_other["iamt"] += Decimal(str(d.iamt))
            itc_all_other["camt"] += Decimal(str(d.camt))
            itc_all_other["samt"] += Decimal(str(d.samt))
            itc_all_other["csamt"] += Decimal(str(d.csamt))

        # ITC Reversals from StockAdjustments (4B)
        from apps.inventory.models import StockAdjustment
        from apps.purchases.models import Rule37Adjustment
        from django.db.models import Sum, DecimalField
        from django.db.models.functions import Coalesce

        rev_17_5 = {"iamt": Decimal('0.00'), "camt": Decimal('0.00'), "samt": Decimal('0.00'), "csamt": Decimal('0.00')}
        rev_others = {"iamt": Decimal('0.00'), "camt": Decimal('0.00'), "samt": Decimal('0.00'), "csamt": Decimal('0.00')}
        itc_reclaimed = {"iamt": Decimal('0.00'), "camt": Decimal('0.00'), "samt": Decimal('0.00'), "csamt": Decimal('0.00')}

        try:
            month = int(self.period[:2])
            year = int(self.period[2:])
            
            # Phase A1: Section 17(5)(h) Physical Inventory Loss -> 4B(1) Rule 42,43,17(5)
            adjustments = StockAdjustment.objects.using(self.db).filter(
                outlet__gstin=self.gstin,
                status='APPROVED',
                effective_date__month=month,
                effective_date__year=year,
                gstr_reason_code='SECTION_17_5_H'
            )
            for adj in adjustments:
                allocs = adj.allocations.aggregate(
                    sum_igst=Coalesce(Sum('reversed_igst_amount'), Decimal('0.00'), output_field=DecimalField()),
                    sum_cgst=Coalesce(Sum('reversed_cgst_amount'), Decimal('0.00'), output_field=DecimalField()),
                    sum_sgst=Coalesce(Sum('reversed_sgst_amount'), Decimal('0.00'), output_field=DecimalField()),
                    sum_cess=Coalesce(Sum('reversed_cess_amount'), Decimal('0.00'), output_field=DecimalField())
                )
                rev_17_5["iamt"] += allocs['sum_igst']
                rev_17_5["camt"] += allocs['sum_cgst']
                rev_17_5["samt"] += allocs['sum_sgst']
                rev_17_5["csamt"] += allocs['sum_cess']
                
            # Phase A2: Rule 37 Reversals -> 4B(2) Others
            # Phase A2: Rule 37 Reversals -> 4B(2) Others
            rule37_reversals = Rule37Adjustment.objects.using(self.db).filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                action_type='REVERSAL_DUE',
                calculation_date__month=month,
                calculation_date__year=year
            )
            for adj in rule37_reversals:
                rev_others["iamt"] += Decimal(str(adj.reversed_igst))
                rev_others["camt"] += Decimal(str(adj.reversed_cgst))
                rev_others["samt"] += Decimal(str(adj.reversed_sgst))
                rev_others["csamt"] += Decimal(str(adj.reversed_cess))

            # Reclaims
            # Reclaims
            rule37_reclaims = Rule37Adjustment.objects.using(self.db).filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                reclaim_period=self.period
            )
            for adj in rule37_reclaims:
                ig = Decimal(str(adj.reclaimed_igst or '0.00'))
                cg = Decimal(str(adj.reclaimed_cgst or '0.00'))
                sg = Decimal(str(adj.reclaimed_sgst or '0.00'))
                cs = Decimal(str(adj.reversed_cess or '0.00'))
                
                # Reavailment gets added back to 4A(5)
                itc_all_other["iamt"] += ig
                itc_all_other["camt"] += cg
                itc_all_other["samt"] += sg
                itc_all_other["csamt"] += cs

                # Track for Table 4(D)(1)
                itc_reclaimed["iamt"] += ig
                itc_reclaimed["camt"] += cg
                itc_reclaimed["samt"] += sg
                itc_reclaimed["csamt"] += cs
        except Exception:
            pass

        itc_avl_list = [
            {"ty": "Import of Goods", "iamt": itc_import_goods["iamt"], "camt": Decimal('0.00'), "samt": Decimal('0.00'), "csamt": itc_import_goods["csamt"]},
            {"ty": "Import of Services", "iamt": itc_import_services["iamt"], "camt": Decimal('0.00'), "samt": Decimal('0.00'), "csamt": itc_import_services["csamt"]},
            {"ty": "Inward supplies liable to reverse charge", **itc_rcm},
            {"ty": "Inward supplies from ISD", **itc_isd},
            {"ty": "All other ITC", **itc_all_other},
        ]
        
        itc_rev_list = [
            {"ty": "Rule 42,43,17(5)", **rev_17_5},
            {"ty": "Others", **rev_others},
        ]

        # Build 3.2
        unreg_details = [{"pos": pos, "txval": vals["txval"], "iamt": vals["iamt"]} for pos, vals in t32_unreg.items() if vals["txval"] != 0]

        other_details_list = [
            {"ty": "ITC reclaimed which was reversed under Table 4(B)(2) in earlier tax period", **itc_reclaimed}
        ]

        payload = {
            "gstin": self.gstin,
            "ret_period": self.period,
            "sup_details": t31,
            "inter_sup": {
                "unreg_details": unreg_details,
                "comp_details": [],
                "uin_details": []
            },
            "itc_elg": {
                "itc_avl": [a for a in itc_avl_list if any(v != Decimal('0.00') for k, v in a.items() if k != "ty")],
                "itc_rev": [r for r in itc_rev_list if any(v != Decimal('0.00') for k, v in r.items() if k != "ty")],
                "itc_inelg": []
            },
            "other_details": [o for o in other_details_list if any(v != Decimal('0.00') for k, v in o.items() if k != "ty")]
        }
        
        from apps.reports.validators import GSTR3BValidator
        validator = GSTR3BValidator()
        validation_result = validator.validate_json(payload)
        
        payload["_metadata"] = {
            "disclaimer": "Draft GSTR-3B generated based on snapshots.",
            "validation_warnings": [w if isinstance(w, dict) else w.__dict__ for w in validation_result.warnings],
            "blocking_errors": [e if isinstance(e, dict) else e.__dict__ for e in validation_result.blocking_errors],
            "info": [i if isinstance(i, dict) else i.__dict__ for i in validation_result.info],
            "is_valid_for_export": not validation_result.has_blocking_errors()
        }
        
        return payload
