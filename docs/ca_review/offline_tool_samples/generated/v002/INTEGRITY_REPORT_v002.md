# Integrity Report v002

**Status:** EXCEL_OPEN_PENDING
**Generated:** 2026-08-19T11:03:09.208442

## Clean Workbook
- **File:** GSTR1_Clean_092026_v002.xlsx
- **SHA-256:** 5b9c2124463c80c1fa53db8b7cd042cef99a0b45e5991204b6d004a181aa22f1
- **Size:** 6181411 bytes
- **Modified Members:** xl/worksheets/sheet2.xml, xl/worksheets/sheet19.xml
- **All other members are byte-identical to template.**

## Advanced Workbook
- **File:** GSTR1_Advanced_102026_v002.xlsx
- **SHA-256:** f9382db6ab39a666b451598a23f1c11d2cfaa47e6ecf548dd9e8f67bd607e652
- **Size:** 6182907 bytes
- **Modified Members:** xl/worksheets/sheet2.xml, xl/worksheets/sheet4.xml, xl/worksheets/sheet6.xml, xl/worksheets/sheet8.xml, xl/worksheets/sheet19.xml, xl/worksheets/sheet20.xml
- **All other members are byte-identical to template.**

## Test Results
```
============================= test session starts ==============================
platform linux -- Python 3.12.3, pytest-9.1.0, pluggy-1.6.0 -- /home/asta/coding/MDF/apps/backend/venv/bin/python3
cachedir: .pytest_cache
django: version: 5.0.3, settings: mediflow.settings.dev (from env)
rootdir: /home/asta/coding/MDF/apps/backend
configfile: pytest.ini
plugins: Faker-40.36.0, django-4.12.0
collecting ... collected 2 items

apps/reports/tests/test_ooxml_integrity.py::OOXMLIntegrityTestCase::test_advanced_sample_integrity PASSED [ 50%]
apps/reports/tests/test_ooxml_integrity.py::OOXMLIntegrityTestCase::test_clean_sample_integrity PASSED [100%]

=============================== warnings summary ===============================
apps/reports/tests/test_ooxml_integrity.py::OOXMLIntegrityTestCase::test_advanced_sample_integrity
apps/reports/tests/test_ooxml_integrity.py::OOXMLIntegrityTestCase::test_advanced_sample_integrity
apps/reports/tests/test_ooxml_integrity.py::OOXMLIntegrityTestCase::test_clean_sample_integrity
apps/reports/tests/test_ooxml_integrity.py::OOXMLIntegrityTestCase::test_clean_sample_integrity
  /home/asta/coding/MDF/apps/backend/venv/lib/python3.12/site-packages/openpyxl/packaging/core.py:99: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    now = datetime.datetime.utcnow()

apps/reports/tests/test_ooxml_integrity.py::OOXMLIntegrityTestCase::test_advanced_sample_integrity
apps/reports/tests/test_ooxml_integrity.py::OOXMLIntegrityTestCase::test_clean_sample_integrity
  /home/asta/coding/MDF/apps/backend/venv/lib/python3.12/site-packages/openpyxl/worksheet/_reader.py:329: UserWarning: Data Validation extension is not supported and will be removed
    warn(msg)

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
=================== 2 passed, 6 warnings in 88.54s (0:01:28) ===================


```