# GST Template Inspection Report

## 1. File Inventory & Integrity

| Filename | Type | Size | SHA-256 | Valid OOXML | VBA Present | Creator |
|---|---|---|---|---|---|---|
| Copy of GSTR1_Excel_Workbook_Template_V2.2.xlsx | GSTR1 | 7055318 | 89cbc413... | Yes | No | GSTN |
| Copy of GSTR2_Excel_Workbook_TemplateNew_V1.1.xlsx | GSTR2/2B | 3127417 | 8118c1eb... | Yes | No | None |
| GSTR3B_Excel_Utility_V5.6.xlsm | GSTR3B | 102406 | dc99832e... | Yes | Yes | Gajanan U Khanande |

## 2. Classification & Findings

### GSTR1 - `Copy of GSTR1_Excel_Workbook_Template_V2.2.xlsx`
- **Official Template:** Yes
- **VBA/Macros:** None
- **Total Sheets:** 32
- **Key Sheets:** Help Instruction, b2b,sez,de, b2ba, b2cl, b2cla...
### GSTR2/2B - `Copy of GSTR2_Excel_Workbook_TemplateNew_V1.1.xlsx`
- **Official Template:** Likely Modified/Generated
- **VBA/Macros:** None
- **Total Sheets:** 13
- **Key Sheets:** Help Instructions, b2b, b2bur, imps, impg...
### GSTR3B - `GSTR3B_Excel_Utility_V5.6.xlsm`
- **Official Template:** Yes
- **VBA/Macros:** xl/vbaProject.bin detected
- **Total Sheets:** 4
- **Key Sheets:** Help Instructions , GSTR-3B, Sheet1, Master...

## 3. GSTR-1 Specific Analysis

### Sheet Verification
- `b2b,sez,de`: ✅ Found
- `b2cl`: ✅ Found
- `b2cs`: ✅ Found
- `cdnr`: ✅ Found
- `cdnur`: ✅ Found
- `hsn`: ❌ Missing (Instead found `hsn(b2b)` and `hsn(b2c)`)

### Field Mapping & Gaps
- **Original Invoice Number/Date in CDNR:** Confirmed. The `cdnr` sheet contains `Original Invoice Number` and `Original Invoice date`.
- **Supported Fields:** GSTIN, invoice/note number/date, invoice/note value, POS, rate, taxable value, IGST/CGST/SGST/cess, HSN, UQC, quantity, HSN rate are all supported in the respective sheets.
- **Differences:** GSTR1Builder emits internal IDs which do not exist in the workbook and should be ignored during mapping. The workbook expects `Applicable % of Tax Rate` and `E-Commerce GSTIN` which may be blank/defaulted if not applicable. A single `hsn` sheet was expected, but `V2.2` uses split `hsn(b2b)` and `hsn(b2c)` sheets. This means GSTR1Builder's internal HSN output will need to be segregated into B2B and B2C before writing to the template.

## 4. Required Export Constraints

- **GSTR-1 & GSTR-2:** Must use `openpyxl` with `keep_vba=False`. Output must remain `.xlsx`.
- **GSTR-3B:** Must use `openpyxl` with `keep_vba=True` to preserve `.xlsm` macros. Currently deferred.

## 5. Conclusion & Recommendations

- **GSTR-1:** The template `Copy of GSTR1_Excel_Workbook_Template_V2.2.xlsx` is valid structurally but its `Creator: GSTN` metadata suggests it was at least originally official. **Recommendation:** Export can proceed safely by writing data starting from row 5 for most sheets. Keep `keep_vba=False`.
- **Blocking Issues:** None. Exporter implementation for GSTR-1 can begin.