# GSTR-3B Offline Utility Template Manifest

## Discovery Report
- **Filename**: `GSTR3B_Excel_Utility_V5.6.xlsm`
- **SHA-256**: `dc99832e012bc7a9e1d89c34f68a086f4882ae325bb480fcf3e434c23e45c0d1`
- **Format**: Macro-Enabled Workbook (`.xlsm`)
- **Macros Present**: Yes (`xl/vbaProject.bin`)
- **Sheets Found**:
  - `Help Instructions ` (visible, rId1)
  - `GSTR-3B` (visible, rId2)
  - `Sheet1` (hidden, rId3)
  - `Master` (hidden, rId4)

## Planned Mapping (Sheet: GSTR-3B)
All data injections will target the `GSTR-3B` sheet (`sheet2.xml`). Only these specific coordinates will be injected, leaving all formulas, formatting, and macros intact.

### Header Data
- **GSTIN**: `C5`
- **Legal Name**: `C6` (Portal calculated, we can pre-fill or leave blank)
- **Year**: `F5`
- **Month**: `F6`

### Table 3.1: Outward Supplies
- **(a) Outward Taxable supplies**: Taxable Value (`C11`), IGST (`D11`), CGST (`E11`), Cess (`G11`). SGST (`F11`) is auto-calculated by formula.
- **(b) Outward Taxable (zero rated)**: Taxable Value (`C12`), IGST (`D12`), Cess (`G12`).
- **(c) Other Outward (Nil, Exempt)**: Taxable Value (`C13`).
- **(d) Inward supplies (reverse charge)**: Taxable Value (`C14`), IGST (`D14`), CGST (`E14`), Cess (`G14`). SGST (`F14`) is auto-calculated.
- **(e) Non-GST Outward**: Taxable Value (`C15`).

### Table 3.1.1: E-Commerce
- **(i) ECO pays tax u/s 9(5)**: Taxable Value (`C22`), IGST (`D22`), CGST (`E22`), Cess (`G22`).
- **(ii) Registered person through ECO**: Taxable Value (`C23`).

### Table 4: Eligible ITC
- **(A1) Import of Goods**: IGST (`C31`), Cess (`F31`).
- **(A2) Import of Services**: IGST (`C32`), Cess (`F32`).
- **(A3) Inward rev charge**: IGST (`C33`), CGST (`D33`), Cess (`F33`). SGST (`E33`) is auto-calculated.
- **(A4) ISD**: IGST (`C34`), CGST (`D34`), Cess (`F34`).
- **(A5) All other ITC**: IGST (`C35`), CGST (`D35`), Cess (`F35`).
- **(B1) ITC Reversed (Rules 38,42,43)**: IGST (`C37`), CGST (`D37`), Cess (`F37`).
- **(B2) ITC Reversed (Others)**: IGST (`C38`), CGST (`D38`), SGST (`E38`), Cess (`F38`).
- **(D1) Reclaimed ITC**: IGST (`C41`), CGST (`D41`), Cess (`F41`).
- **(D2) Ineligible ITC**: IGST (`C42`), CGST (`D42`), Cess (`F42`).

### Table 5: Exempt/Nil-Rated/Non-GST
- **Composition/Exempt/Nil**: Inter-state (`D48`), Intra-state (`E48`).
- **Non-GST**: Inter-state (`D49`), Intra-state (`E49`).

### Table 5.1: Interest & Late Fee
- **Interest**: IGST (`C65`), CGST (`D65`), SGST (`E65`), Cess (`F65`).
- **Late Fee**: IGST (`C66`), CGST (`D66`), SGST (`E66`), Cess (`F66`).

### Table 3.2: Unregistered/Composition/UIN Inter-State
- **Input Rows**: `88` to `124`.
- **Columns**: Place of Supply (`B`), Unregistered Value (`C`), Unregistered IGST (`D`), Composition Value (`E`), Composition IGST (`F`), UIN Value (`G`), UIN IGST (`H`).

## Test Plan
- **Deterministic Samples**: We will create `GSTR3B_ZeroActivity`, `GSTR3B_BasicTaxable`, and `GSTR3B_Advanced`.
- **Preflight Validation**: Validate input payloads for proper decimals, GSTIN format, and block generation if essential dependencies are missing.
- **Package Integrity Tests**: After generation, we will verify the `.xlsm` package retains `vbaProject.bin`, all unchanged XML members, relationships, and is identical except for the target sheet data.
- **Manual Gate**: The artifacts must open cleanly in Excel without a repair prompt and be validated successfully by the official GST Offline Tool.
