# Integrity Report v003\n\n**Status:** EXCEL_OPEN_PENDING\n**Generated:** 2026-08-19T12:35:20.522740\n\n## HSN Total Value Verification\nEvidence: Help Instruction sheet in GSTR1_Template_V2.2.xlsx.\nInstruction: '5. Total Value | Enter the invoice value of the goods or services-up to 2 decimal Digits. This field is mandatory and applicable only till April'21 . The values,if enetered, in this field shall be ignored upon import in tool for period May'21 and onwards.'\nReference Cells: Column E in hsn(b2b).\nResulting formula: `txval + iamt + camt + samt + csamt` (Taxable Value + all tax components). Although the offline tool ignores the value for periods after May '21, omitting the column cell entirely triggered 'Column Headers Missing/Mismatch or Data Invalid', thus we populate the true invoice total value to satisfy the strict parser.\n\n## Clean Workbook\n- **File:** GSTR1_Clean_092026_v003.xlsx\n- **SHA-256:** 47b1130befed0d593fd3dd63a82d79db64f878898c9d6d59b86f05dba0e06bb5\n- **Size:** 6181440 bytes\n- **Modified Members:** xl/worksheets/sheet2.xml, xl/worksheets/sheet19.xml\n- **All other members are byte-identical to template.**\n\n## Advanced Workbook\n- **File:** GSTR1_Advanced_102026_v003.xlsx\n- **SHA-256:** 03c885f83326e09e039ad7f052173477fc4b44b943d261b1f22773df50677384\n- **Size:** 6182979 bytes\n- **Modified Members:** xl/worksheets/sheet2.xml, xl/worksheets/sheet4.xml, xl/worksheets/sheet6.xml, xl/worksheets/sheet8.xml, xl/worksheets/sheet19.xml, xl/worksheets/sheet20.xml\n- **All other members are byte-identical to template.**\n\n## Test Results\n```
============================= test session starts ==============================
platform linux -- Python 3.12.3, pytest-9.1.0, pluggy-1.6.0 -- /home/asta/coding/MDF/apps/backend/venv/bin/python3
cachedir: .pytest_cache
django: version: 5.0.3, settings: mediflow.settings.dev (from env)
rootdir: /home/asta/coding/MDF/apps/backend
configfile: pytest.ini
plugins: Faker-40.36.0, django-4.12.0
collecting ... collected 61 items

apps/reports/tests/test_ca_working_paper.py::CAWorkingPaperTests::test_pdf_export_successful FAILED [  1%]
apps/reports/tests/test_export_consistency.py::ExportConsistencyTests::test_ca_working_paper_totals_consistency PASSED [  3%]
apps/reports/tests/test_export_consistency.py::ExportConsistencyTests::test_reconciliation_excel_consistency PASSED [  4%]
apps/reports/tests/test_gst_foundation.py::GSTFoundationTests::test_gst_transaction_snapshot_creation FAILED [  6%]
apps/reports/tests/test_gst_foundation.py::GSTFoundationTests::test_seed_mumbai_outlet_credentials FAILED [  8%]
apps/reports/tests/test_gst_template_integrity.py::GSTTemplateIntegrityTest::test_manifest_and_template_exist FAILED [  9%]
apps/reports/tests/test_gst_template_integrity.py::GSTTemplateIntegrityTest::test_template_checksum_matches_manifest FAILED [ 11%]
apps/reports/tests/test_gst_template_integrity.py::GSTTemplateIntegrityTest::test_template_structure_preservation FAILED [ 13%]
apps/reports/tests/test_gstr1_excel.py::GSTR1ExcelExportTests::test_excel_export_blocked_by_errors PASSED [ 14%]
apps/reports/tests/test_gstr1_excel.py::GSTR1ExcelExportTests::test_excel_export_successful PASSED [ 16%]
apps/reports/tests/test_gstr1_excel.py::GSTR1ExcelExportTests::test_unauthorized_returns_401 PASSED [ 18%]
apps/reports/tests/test_gstr1_excel.py::GSTR1ExcelExportTests::test_unauthorized_without_permission PASSED [ 19%]
apps/reports/tests/test_gstr2b.py::GSTR2BServiceTests::test_reconciliation_matched FAILED [ 21%]
apps/reports/tests/test_gstr2b.py::GSTR2BServiceTests::test_reconciliation_mismatch FAILED [ 22%]
apps/reports/tests/test_gstr2b.py::GSTR2BServiceTests::test_reconciliation_missing_in_2b FAILED [ 24%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_01_outward_supplies FAILED [ 26%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_02_itc_eligible FAILED [ 27%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_03_itc_reversal_section_17_5 FAILED [ 29%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_04_itc_reversal_rule_37 FAILED [ 31%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_05_reconciliation_exact_match PASSED [ 32%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_06_reconciliation_fuzzy_match PASSED [ 34%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_07_reconciliation_tax_mismatch PASSED [ 36%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_10_rcm_inward_supply FAILED [ 37%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_11_inter_state_unregistered FAILED [ 39%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_12_reconciliation_multi_scenarios PASSED [ 40%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_13_excess_itc FAILED [ 42%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_14_liability_shortfall FAILED [ 44%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_15_invalid_reversals FAILED [ 45%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_16_table_3_2_bounds FAILED [ 47%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_17_deferred_itc_lifecycle FAILED [ 49%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_18_rule37_reclaim FAILED [ 50%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_19_tax_rate_mismatch PASSED [ 52%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_20_period_mismatch PASSED [ 54%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_21_val_008_blocking_override FAILED [ 55%]
apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_99_generate_ca_json FAILED [ 57%]
apps/reports/tests/test_gstr_builders.py::GSTRBuildersTests::test_gstr1_builder FAILED [ 59%]
apps/reports/tests/test_gstr_builders.py::GSTRBuildersTests::test_gstr3b_builder FAILED [ 60%]
apps/reports/tests/test_gstr_returns.py::GSTR1BuilderNotesTestCase::test_b2cl_boundary_99999 PASSED [ 62%]
apps/reports/tests/test_gstr_returns.py::GSTR1BuilderNotesTestCase::test_dynamic_cdnur_classification PASSED [ 63%]
apps/reports/tests/test_gstr_returns.py::GSTR1BuilderNotesTestCase::test_original_document_traceability_and_manual_override FAILED [ 65%]
apps/reports/tests/test_gstr_returns.py::GSTR1BuilderNotesTestCase::test_semantic_separation PASSED [ 67%]
apps/reports/tests/test_ooxml_integrity.py::OOXMLIntegrityTestCase::test_advanced_sample_integrity FAILED [ 68%]
apps/reports/tests/test_ooxml_integrity.py::OOXMLIntegrityTestCase::test_clean_sample_integrity FAILED [ 70%]
apps/reports/tests/test_reconciliation_excel.py::ReconciliationExcelExportTests::test_reconciliation_excel_export_successful FAILED [ 72%]
apps/reports/tests/test_reconciliation_excel.py::ReconciliationExcelExportTests::test_reconciliation_excel_no_run_found FAILED [ 73%]
apps/reports/tests/test_snapshot_services.py::GSTSnapshotServiceTests::test_interstate_sale_taxes FAILED [ 75%]
apps/reports/tests/test_snapshot_services.py::GSTSnapshotServiceTests::test_purchase_snapshot_creation FAILED [ 77%]
apps/reports/tests/test_snapshot_services.py::GSTSnapshotServiceTests::test_sale_snapshot_creation FAILED [ 78%]
apps/reports/tests/test_template_integrity.py::TemplateIntegrityTests::test_gstr1_template_integrity FAILED [ 80%]
apps/reports/tests/test_gstr1_hsn_segregation.py::TestGSTR1HSNSegregation::test_invariants_totals PASSED [ 81%]
apps/reports/tests/test_gstr1_hsn_segregation.py::TestGSTR1HSNSegregation::test_manual_override_with_bucket PASSED [ 83%]
apps/reports/tests/test_gstr1_hsn_segregation.py::TestGSTR1HSNSegregation::test_missing_recipient_classification_raises_error PASSED [ 85%]
apps/reports/tests/test_gstr1_hsn_segregation.py::TestGSTR1HSNSegregation::test_mixed_b2b_b2c_same_hsn_rate PASSED [ 86%]
apps/reports/tests/test_gstr1_hsn_segregation.py::TestGSTR1HSNSegregation::test_return_reduces_correct_bucket PASSED [ 88%]
apps/reports/tests/test_gstr1_hsn_segregation.py::TestGSTR1HSNSegregation::test_same_hsn_different_rates PASSED [ 90%]
apps/reports/tests/test_gstr1_hsn_segregation.py::TestGSTR1HSNSegregation::test_same_hsn_different_uqc PASSED [ 91%]
apps/reports/tests/test_preflight_validation.py::TestExporterPreflightValidator::test_dummy_hsn PASSED [ 93%]
apps/reports/tests/test_preflight_validation.py::TestExporterPreflightValidator::test_invalid_date_format PASSED [ 95%]
apps/reports/tests/test_preflight_validation.py::TestExporterPreflightValidator::test_missing_hsn_code PASSED [ 96%]
apps/reports/tests/test_preflight_validation.py::TestExporterPreflightValidator::test_missing_hsn_total_value PASSED [ 98%]
apps/reports/tests/test_preflight_validation.py::TestExporterPreflightValidator::test_valid_payload PASSED [100%]

=================================== FAILURES ===================================
________________ CAWorkingPaperTests.test_pdf_export_successful ________________

self = <apps.reports.tests.test_ca_working_paper.CAWorkingPaperTests testMethod=test_pdf_export_successful>
mock_gstr3b_json = <MagicMock name='generate_json' id='124475830692768'>
mock_gstr1_json = <MagicMock name='generate_json' id='124475829508416'>
mock_get_outlet = <MagicMock name='get_current_outlet' id='124475829512688'>

    @patch('apps.reports.exports.ca_working_paper.CAWorkingPaperPDFExportView.get_current_outlet')
    @patch('apps.reports.gstr_builders.GSTR1Builder.generate_json')
    @patch('apps.reports.gstr_builders.GSTR3BBuilder.generate_json')
    def test_pdf_export_successful(self, mock_gstr3b_json, mock_gstr1_json, mock_get_outlet):
        mock_get_outlet.return_value = self.outlet
    
        mock_gstr1_json.return_value = {
            "_metadata": {
                "blocking_errors": [],
                "validation_warnings": ["Missing HSN for some items"]
            }
        }
    
        mock_gstr3b_json.return_value = {
            "sup_details": {
                "osup_det": {"txval": 1000, "iamt": 180, "camt": 0, "samt": 0, "csamt": 0}
            },
            "itc_elg": {
                "itc_avl": [
                    {"ty": "All other ITC", "iamt": 100, "camt": 50, "samt": 50, "csamt": 0}
                ]
            }
        }
    
        response = self.client.get(self.url)
>       self.assertEqual(response.status_code, 200)
E       AssertionError: 401 != 200

apps/reports/tests/test_ca_working_paper.py:41: AssertionError
---------------------------- Captured stdout setup -----------------------------
Operations to perform:
  Synchronize unmigrated apps: corsheaders, django_filters, drf_spectacular, gst, import_export, messages, postgres, rest_framework, rest_framework_simplejwt, staticfiles
  Apply all migrations: accounts, admin, attendance, audit, auth, billing, contenttypes, core, inventory, purchases, reports, sessions, token_blacklist
Synchronizing apps without migrations:
  Creating tables...
    Running deferred SQL...
Running migrations:
  No migrations to apply.
---------------------------- Captured stderr setup -----------------------------
Using existing test database for alias 'default' ('test_mediflow')...
------------------------------ Captured log call -------------------------------
WARNING  django.request:log.py:241 Unauthorized: /api/v1/gst/export/082026/ca_working_paper/
__________ GSTFoundationTests.test_gst_transaction_snapshot_creation ___________

self = <apps.reports.tests.test_gst_foundation.GSTFoundationTests testMethod=test_gst_transaction_snapshot_creation>

    def setUp(self):
>       call_command('seed_local_gst_test_data', reset=True, seed=42)

apps/reports/tests/test_gst_foundation.py:9: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
venv/lib/python3.12/site-packages/django/core/management/__init__.py:194: in call_command
    return command.execute(*args, **defaults)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/core/management/base.py:459: in execute
    output = self.handle(*args, **options)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seed_local_gst_test_data.py:23: in handle
    run_seeder(size=size, hard_reset=False, random_seed=seed)
apps/core/management/commands/seeder.py:341: in run_seeder
    batches = seed_purchases(outlets, distributors, products, num_purchases=n_pur)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seeder.py:179: in seed_purchases
    PurchaseItem.objects.create(
venv/lib/python3.12/site-packages/django/db/models/manager.py:87: in manager_method
    return getattr(self.get_queryset(), name)(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/db/models/query.py:677: in create
    obj = self.model(**kwargs)
          ^^^^^^^^^^^^^^^^^^^^
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <PurchaseItem: SEED-Azithromycin 250mg - SEED-B-6d6191-0-0>, args = ()
kwargs = {'sale_rate': Decimal('120.00')}

    def __init__(self, *args, **kwargs):
        # Alias some things as locals to avoid repeat global lookups
        cls = self.__class__
        opts = self._meta
        _setattr = setattr
        _DEFERRED = DEFERRED
        if opts.abstract:
            raise TypeError("Abstract models cannot be instantiated.")
    
        pre_init.send(sender=cls, args=args, kwargs=kwargs)
    
        # Set up the storage for instance state
        self._state = ModelState()
    
        # There is a rather weird disparity here; if kwargs, it's set, then args
        # overrides it. It should be one or the other; don't duplicate the work
        # The reason for the kwargs check is that standard iterator passes in by
        # args, and instantiation for iteration is 33% faster.
        if len(args) > len(opts.concrete_fields):
            # Daft, but matches old exception sans the err msg.
            raise IndexError("Number of args exceeds number of fields")
    
        if not kwargs:
            fields_iter = iter(opts.concrete_fields)
            # The ordering of the zip calls matter - zip throws StopIteration
            # when an iter throws it. So if the first iter throws it, the second
            # is *not* consumed. We rely on this, so don't change the order
            # without changing the logic.
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
        else:
            # Slower, kwargs-ready version.
            fields_iter = iter(opts.fields)
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
                if kwargs.pop(field.name, NOT_PROVIDED) is not NOT_PROVIDED:
                    raise TypeError(
                        f"{cls.__qualname__}() got both positional and "
                        f"keyword arguments for field '{field.name}'."
                    )
    
        # Now we're left with the unprocessed fields that *must* come from
        # keywords, or default.
    
        for field in fields_iter:
            is_related_object = False
            # Virtual field
            if field.attname not in kwargs and field.column is None or field.generated:
                continue
            if kwargs:
                if isinstance(field.remote_field, ForeignObjectRel):
                    try:
                        # Assume object instance was passed in.
                        rel_obj = kwargs.pop(field.name)
                        is_related_object = True
                    except KeyError:
                        try:
                            # Object instance wasn't passed in -- must be an ID.
                            val = kwargs.pop(field.attname)
                        except KeyError:
                            val = field.get_default()
                else:
                    try:
                        val = kwargs.pop(field.attname)
                    except KeyError:
                        # This is done with an exception rather than the
                        # default argument on pop because we don't want
                        # get_default() to be evaluated, and then not used.
                        # Refs #12057.
                        val = field.get_default()
            else:
                val = field.get_default()
    
            if is_related_object:
                # If we are passed a related instance, set it using the
                # field.name instead of field.attname (e.g. "user" instead of
                # "user_id") so that the object gets properly cached (and type
                # checked) by the RelatedObjectDescriptor.
                if rel_obj is not _DEFERRED:
                    _setattr(self, field.name, rel_obj)
            else:
                if val is not _DEFERRED:
                    _setattr(self, field.attname, val)
    
        if kwargs:
            property_names = opts._property_names
            unexpected = ()
            for prop, value in kwargs.items():
                # Any remaining kwargs must correspond to properties or virtual
                # fields.
                if prop in property_names:
                    if value is not _DEFERRED:
                        _setattr(self, prop, value)
                else:
                    try:
                        opts.get_field(prop)
                    except FieldDoesNotExist:
                        unexpected += (prop,)
                    else:
                        if value is not _DEFERRED:
                            _setattr(self, prop, value)
            if unexpected:
                unexpected_names = ", ".join(repr(n) for n in unexpected)
>               raise TypeError(
                    f"{cls.__name__}() got unexpected keyword arguments: "
                    f"{unexpected_names}"
                )
E               TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'

venv/lib/python3.12/site-packages/django/db/models/base.py:567: TypeError
----------------------------- Captured stdout call -----------------------------
Performing safe reset of SEEDED local data...
Performing targeted reset of seeded data (PREFIX: SEED-)...
Seeding master data...
Seeding purchases and inventory...
____________ GSTFoundationTests.test_seed_mumbai_outlet_credentials ____________

self = <apps.reports.tests.test_gst_foundation.GSTFoundationTests testMethod=test_seed_mumbai_outlet_credentials>

    def setUp(self):
>       call_command('seed_local_gst_test_data', reset=True, seed=42)

apps/reports/tests/test_gst_foundation.py:9: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
venv/lib/python3.12/site-packages/django/core/management/__init__.py:194: in call_command
    return command.execute(*args, **defaults)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/core/management/base.py:459: in execute
    output = self.handle(*args, **options)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seed_local_gst_test_data.py:23: in handle
    run_seeder(size=size, hard_reset=False, random_seed=seed)
apps/core/management/commands/seeder.py:341: in run_seeder
    batches = seed_purchases(outlets, distributors, products, num_purchases=n_pur)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seeder.py:179: in seed_purchases
    PurchaseItem.objects.create(
venv/lib/python3.12/site-packages/django/db/models/manager.py:87: in manager_method
    return getattr(self.get_queryset(), name)(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/db/models/query.py:677: in create
    obj = self.model(**kwargs)
          ^^^^^^^^^^^^^^^^^^^^
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <PurchaseItem: SEED-Azithromycin 250mg - SEED-B-962731-0-0>, args = ()
kwargs = {'sale_rate': Decimal('120.00')}

    def __init__(self, *args, **kwargs):
        # Alias some things as locals to avoid repeat global lookups
        cls = self.__class__
        opts = self._meta
        _setattr = setattr
        _DEFERRED = DEFERRED
        if opts.abstract:
            raise TypeError("Abstract models cannot be instantiated.")
    
        pre_init.send(sender=cls, args=args, kwargs=kwargs)
    
        # Set up the storage for instance state
        self._state = ModelState()
    
        # There is a rather weird disparity here; if kwargs, it's set, then args
        # overrides it. It should be one or the other; don't duplicate the work
        # The reason for the kwargs check is that standard iterator passes in by
        # args, and instantiation for iteration is 33% faster.
        if len(args) > len(opts.concrete_fields):
            # Daft, but matches old exception sans the err msg.
            raise IndexError("Number of args exceeds number of fields")
    
        if not kwargs:
            fields_iter = iter(opts.concrete_fields)
            # The ordering of the zip calls matter - zip throws StopIteration
            # when an iter throws it. So if the first iter throws it, the second
            # is *not* consumed. We rely on this, so don't change the order
            # without changing the logic.
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
        else:
            # Slower, kwargs-ready version.
            fields_iter = iter(opts.fields)
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
                if kwargs.pop(field.name, NOT_PROVIDED) is not NOT_PROVIDED:
                    raise TypeError(
                        f"{cls.__qualname__}() got both positional and "
                        f"keyword arguments for field '{field.name}'."
                    )
    
        # Now we're left with the unprocessed fields that *must* come from
        # keywords, or default.
    
        for field in fields_iter:
            is_related_object = False
            # Virtual field
            if field.attname not in kwargs and field.column is None or field.generated:
                continue
            if kwargs:
                if isinstance(field.remote_field, ForeignObjectRel):
                    try:
                        # Assume object instance was passed in.
                        rel_obj = kwargs.pop(field.name)
                        is_related_object = True
                    except KeyError:
                        try:
                            # Object instance wasn't passed in -- must be an ID.
                            val = kwargs.pop(field.attname)
                        except KeyError:
                            val = field.get_default()
                else:
                    try:
                        val = kwargs.pop(field.attname)
                    except KeyError:
                        # This is done with an exception rather than the
                        # default argument on pop because we don't want
                        # get_default() to be evaluated, and then not used.
                        # Refs #12057.
                        val = field.get_default()
            else:
                val = field.get_default()
    
            if is_related_object:
                # If we are passed a related instance, set it using the
                # field.name instead of field.attname (e.g. "user" instead of
                # "user_id") so that the object gets properly cached (and type
                # checked) by the RelatedObjectDescriptor.
                if rel_obj is not _DEFERRED:
                    _setattr(self, field.name, rel_obj)
            else:
                if val is not _DEFERRED:
                    _setattr(self, field.attname, val)
    
        if kwargs:
            property_names = opts._property_names
            unexpected = ()
            for prop, value in kwargs.items():
                # Any remaining kwargs must correspond to properties or virtual
                # fields.
                if prop in property_names:
                    if value is not _DEFERRED:
                        _setattr(self, prop, value)
                else:
                    try:
                        opts.get_field(prop)
                    except FieldDoesNotExist:
                        unexpected += (prop,)
                    else:
                        if value is not _DEFERRED:
                            _setattr(self, prop, value)
            if unexpected:
                unexpected_names = ", ".join(repr(n) for n in unexpected)
>               raise TypeError(
                    f"{cls.__name__}() got unexpected keyword arguments: "
                    f"{unexpected_names}"
                )
E               TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'

venv/lib/python3.12/site-packages/django/db/models/base.py:567: TypeError
----------------------------- Captured stdout call -----------------------------
Performing safe reset of SEEDED local data...
Performing targeted reset of seeded data (PREFIX: SEED-)...
Seeding master data...
Seeding purchases and inventory...
__________ GSTTemplateIntegrityTest.test_manifest_and_template_exist ___________

self = <apps.reports.tests.test_gst_template_integrity.GSTTemplateIntegrityTest testMethod=test_manifest_and_template_exist>

    def test_manifest_and_template_exist(self):
        """Verify the template and manifest files are present in the resources directory."""
        self.assertTrue(os.path.exists(self.manifest_path), "Manifest file not found.")
>       self.assertTrue(os.path.exists(self.template_path), "Template file not found.")
E       AssertionError: False is not true : Template file not found.

apps/reports/tests/test_gst_template_integrity.py:17: AssertionError
_______ GSTTemplateIntegrityTest.test_template_checksum_matches_manifest _______

self = <apps.reports.tests.test_gst_template_integrity.GSTTemplateIntegrityTest testMethod=test_template_checksum_matches_manifest>

    def test_template_checksum_matches_manifest(self):
        """Ensure the template's SHA-256 matches the manifest precisely."""
        with open(self.manifest_path, 'r') as f:
            manifest = json.load(f)
    
        sha256 = hashlib.sha256()
>       with open(self.template_path, 'rb') as f:
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
E       FileNotFoundError: [Errno 2] No such file or directory: '/home/asta/coding/MDF/apps/backend/apps/reports/resources/gst_templates/GSTR1_Excel_Workbook_Template_V2.2.xlsx'

apps/reports/tests/test_gst_template_integrity.py:25: FileNotFoundError
________ GSTTemplateIntegrityTest.test_template_structure_preservation _________

self = <apps.reports.tests.test_gst_template_integrity.GSTTemplateIntegrityTest testMethod=test_template_structure_preservation>

    def test_template_structure_preservation(self):
        """Verify that sheet names and expected start rows haven't been tampered with."""
        with open(self.manifest_path, 'r') as f:
            manifest = json.load(f)
    
>       wb = openpyxl.load_workbook(self.template_path, data_only=True)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

apps/reports/tests/test_gst_template_integrity.py:40: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
venv/lib/python3.12/site-packages/openpyxl/reader/excel.py:344: in load_workbook
    reader = ExcelReader(filename, read_only, keep_vba,
venv/lib/python3.12/site-packages/openpyxl/reader/excel.py:123: in __init__
    self.archive = _validate_archive(fn)
                   ^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/openpyxl/reader/excel.py:95: in _validate_archive
    archive = ZipFile(filename, 'r')
              ^^^^^^^^^^^^^^^^^^^^^^
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <zipfile.ZipFile [closed]>
file = '/home/asta/coding/MDF/apps/backend/apps/reports/resources/gst_templates/GSTR1_Excel_Workbook_Template_V2.2.xlsx'
mode = 'r', compression = 0, allowZip64 = True, compresslevel = None
strict_timestamps = True, metadata_encoding = None

    def __init__(self, file, mode="r", compression=ZIP_STORED, allowZip64=True,
                 compresslevel=None, *, strict_timestamps=True, metadata_encoding=None):
        """Open the ZIP file with mode read 'r', write 'w', exclusive create 'x',
        or append 'a'."""
        if mode not in ('r', 'w', 'x', 'a'):
            raise ValueError("ZipFile requires mode 'r', 'w', 'x', or 'a'")
    
        _check_compression(compression)
    
        self._allowZip64 = allowZip64
        self._didModify = False
        self.debug = 0  # Level of printing: 0 through 3
        self.NameToInfo = {}    # Find file info given name
        self.filelist = []      # List of ZipInfo instances for archive
        self.compression = compression  # Method of compression
        self.compresslevel = compresslevel
        self.mode = mode
        self.pwd = None
        self._comment = b''
        self._strict_timestamps = strict_timestamps
        self.metadata_encoding = metadata_encoding
    
        # Check that we don't try to write with nonconforming codecs
        if self.metadata_encoding and mode != 'r':
            raise ValueError(
                "metadata_encoding is only supported for reading files")
    
        # Check if we were passed a file-like object
        if isinstance(file, os.PathLike):
            file = os.fspath(file)
        if isinstance(file, str):
            # No, it's a filename
            self._filePassed = 0
            self.filename = file
            modeDict = {'r' : 'rb', 'w': 'w+b', 'x': 'x+b', 'a' : 'r+b',
                        'r+b': 'w+b', 'w+b': 'wb', 'x+b': 'xb'}
            filemode = modeDict[mode]
            while True:
                try:
>                   self.fp = io.open(file, filemode)
                              ^^^^^^^^^^^^^^^^^^^^^^^
E                   FileNotFoundError: [Errno 2] No such file or directory: '/home/asta/coding/MDF/apps/backend/apps/reports/resources/gst_templates/GSTR1_Excel_Workbook_Template_V2.2.xlsx'

/usr/lib/python3.12/zipfile/__init__.py:1347: FileNotFoundError
________________ GSTR2BServiceTests.test_reconciliation_matched ________________

self = <apps.reports.tests.test_gstr2b.GSTR2BServiceTests testMethod=test_reconciliation_matched>

    def setUp(self):
        import apps.gst.provider
        apps.gst.provider._ACTIVE_PROVIDER = None
>       call_command('seed_local_gst_test_data', reset=True, seed=42)

apps/reports/tests/test_gstr2b.py:13: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
venv/lib/python3.12/site-packages/django/core/management/__init__.py:194: in call_command
    return command.execute(*args, **defaults)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/core/management/base.py:459: in execute
    output = self.handle(*args, **options)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seed_local_gst_test_data.py:23: in handle
    run_seeder(size=size, hard_reset=False, random_seed=seed)
apps/core/management/commands/seeder.py:341: in run_seeder
    batches = seed_purchases(outlets, distributors, products, num_purchases=n_pur)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seeder.py:179: in seed_purchases
    PurchaseItem.objects.create(
venv/lib/python3.12/site-packages/django/db/models/manager.py:87: in manager_method
    return getattr(self.get_queryset(), name)(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/db/models/query.py:677: in create
    obj = self.model(**kwargs)
          ^^^^^^^^^^^^^^^^^^^^
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <PurchaseItem: SEED-Azithromycin 250mg - SEED-B-e649fb-0-0>, args = ()
kwargs = {'sale_rate': Decimal('120.00')}

    def __init__(self, *args, **kwargs):
        # Alias some things as locals to avoid repeat global lookups
        cls = self.__class__
        opts = self._meta
        _setattr = setattr
        _DEFERRED = DEFERRED
        if opts.abstract:
            raise TypeError("Abstract models cannot be instantiated.")
    
        pre_init.send(sender=cls, args=args, kwargs=kwargs)
    
        # Set up the storage for instance state
        self._state = ModelState()
    
        # There is a rather weird disparity here; if kwargs, it's set, then args
        # overrides it. It should be one or the other; don't duplicate the work
        # The reason for the kwargs check is that standard iterator passes in by
        # args, and instantiation for iteration is 33% faster.
        if len(args) > len(opts.concrete_fields):
            # Daft, but matches old exception sans the err msg.
            raise IndexError("Number of args exceeds number of fields")
    
        if not kwargs:
            fields_iter = iter(opts.concrete_fields)
            # The ordering of the zip calls matter - zip throws StopIteration
            # when an iter throws it. So if the first iter throws it, the second
            # is *not* consumed. We rely on this, so don't change the order
            # without changing the logic.
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
        else:
            # Slower, kwargs-ready version.
            fields_iter = iter(opts.fields)
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
                if kwargs.pop(field.name, NOT_PROVIDED) is not NOT_PROVIDED:
                    raise TypeError(
                        f"{cls.__qualname__}() got both positional and "
                        f"keyword arguments for field '{field.name}'."
                    )
    
        # Now we're left with the unprocessed fields that *must* come from
        # keywords, or default.
    
        for field in fields_iter:
            is_related_object = False
            # Virtual field
            if field.attname not in kwargs and field.column is None or field.generated:
                continue
            if kwargs:
                if isinstance(field.remote_field, ForeignObjectRel):
                    try:
                        # Assume object instance was passed in.
                        rel_obj = kwargs.pop(field.name)
                        is_related_object = True
                    except KeyError:
                        try:
                            # Object instance wasn't passed in -- must be an ID.
                            val = kwargs.pop(field.attname)
                        except KeyError:
                            val = field.get_default()
                else:
                    try:
                        val = kwargs.pop(field.attname)
                    except KeyError:
                        # This is done with an exception rather than the
                        # default argument on pop because we don't want
                        # get_default() to be evaluated, and then not used.
                        # Refs #12057.
                        val = field.get_default()
            else:
                val = field.get_default()
    
            if is_related_object:
                # If we are passed a related instance, set it using the
                # field.name instead of field.attname (e.g. "user" instead of
                # "user_id") so that the object gets properly cached (and type
                # checked) by the RelatedObjectDescriptor.
                if rel_obj is not _DEFERRED:
                    _setattr(self, field.name, rel_obj)
            else:
                if val is not _DEFERRED:
                    _setattr(self, field.attname, val)
    
        if kwargs:
            property_names = opts._property_names
            unexpected = ()
            for prop, value in kwargs.items():
                # Any remaining kwargs must correspond to properties or virtual
                # fields.
                if prop in property_names:
                    if value is not _DEFERRED:
                        _setattr(self, prop, value)
                else:
                    try:
                        opts.get_field(prop)
                    except FieldDoesNotExist:
                        unexpected += (prop,)
                    else:
                        if value is not _DEFERRED:
                            _setattr(self, prop, value)
            if unexpected:
                unexpected_names = ", ".join(repr(n) for n in unexpected)
>               raise TypeError(
                    f"{cls.__name__}() got unexpected keyword arguments: "
                    f"{unexpected_names}"
                )
E               TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'

venv/lib/python3.12/site-packages/django/db/models/base.py:567: TypeError
----------------------------- Captured stdout call -----------------------------
Performing safe reset of SEEDED local data...
Performing targeted reset of seeded data (PREFIX: SEED-)...
Seeding master data...
Seeding purchases and inventory...
_______________ GSTR2BServiceTests.test_reconciliation_mismatch ________________

self = <apps.reports.tests.test_gstr2b.GSTR2BServiceTests testMethod=test_reconciliation_mismatch>

    def setUp(self):
        import apps.gst.provider
        apps.gst.provider._ACTIVE_PROVIDER = None
>       call_command('seed_local_gst_test_data', reset=True, seed=42)

apps/reports/tests/test_gstr2b.py:13: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
venv/lib/python3.12/site-packages/django/core/management/__init__.py:194: in call_command
    return command.execute(*args, **defaults)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/core/management/base.py:459: in execute
    output = self.handle(*args, **options)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seed_local_gst_test_data.py:23: in handle
    run_seeder(size=size, hard_reset=False, random_seed=seed)
apps/core/management/commands/seeder.py:341: in run_seeder
    batches = seed_purchases(outlets, distributors, products, num_purchases=n_pur)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seeder.py:179: in seed_purchases
    PurchaseItem.objects.create(
venv/lib/python3.12/site-packages/django/db/models/manager.py:87: in manager_method
    return getattr(self.get_queryset(), name)(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/db/models/query.py:677: in create
    obj = self.model(**kwargs)
          ^^^^^^^^^^^^^^^^^^^^
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <PurchaseItem: SEED-Azithromycin 250mg - SEED-B-40db2e-0-0>, args = ()
kwargs = {'sale_rate': Decimal('120.00')}

    def __init__(self, *args, **kwargs):
        # Alias some things as locals to avoid repeat global lookups
        cls = self.__class__
        opts = self._meta
        _setattr = setattr
        _DEFERRED = DEFERRED
        if opts.abstract:
            raise TypeError("Abstract models cannot be instantiated.")
    
        pre_init.send(sender=cls, args=args, kwargs=kwargs)
    
        # Set up the storage for instance state
        self._state = ModelState()
    
        # There is a rather weird disparity here; if kwargs, it's set, then args
        # overrides it. It should be one or the other; don't duplicate the work
        # The reason for the kwargs check is that standard iterator passes in by
        # args, and instantiation for iteration is 33% faster.
        if len(args) > len(opts.concrete_fields):
            # Daft, but matches old exception sans the err msg.
            raise IndexError("Number of args exceeds number of fields")
    
        if not kwargs:
            fields_iter = iter(opts.concrete_fields)
            # The ordering of the zip calls matter - zip throws StopIteration
            # when an iter throws it. So if the first iter throws it, the second
            # is *not* consumed. We rely on this, so don't change the order
            # without changing the logic.
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
        else:
            # Slower, kwargs-ready version.
            fields_iter = iter(opts.fields)
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
                if kwargs.pop(field.name, NOT_PROVIDED) is not NOT_PROVIDED:
                    raise TypeError(
                        f"{cls.__qualname__}() got both positional and "
                        f"keyword arguments for field '{field.name}'."
                    )
    
        # Now we're left with the unprocessed fields that *must* come from
        # keywords, or default.
    
        for field in fields_iter:
            is_related_object = False
            # Virtual field
            if field.attname not in kwargs and field.column is None or field.generated:
                continue
            if kwargs:
                if isinstance(field.remote_field, ForeignObjectRel):
                    try:
                        # Assume object instance was passed in.
                        rel_obj = kwargs.pop(field.name)
                        is_related_object = True
                    except KeyError:
                        try:
                            # Object instance wasn't passed in -- must be an ID.
                            val = kwargs.pop(field.attname)
                        except KeyError:
                            val = field.get_default()
                else:
                    try:
                        val = kwargs.pop(field.attname)
                    except KeyError:
                        # This is done with an exception rather than the
                        # default argument on pop because we don't want
                        # get_default() to be evaluated, and then not used.
                        # Refs #12057.
                        val = field.get_default()
            else:
                val = field.get_default()
    
            if is_related_object:
                # If we are passed a related instance, set it using the
                # field.name instead of field.attname (e.g. "user" instead of
                # "user_id") so that the object gets properly cached (and type
                # checked) by the RelatedObjectDescriptor.
                if rel_obj is not _DEFERRED:
                    _setattr(self, field.name, rel_obj)
            else:
                if val is not _DEFERRED:
                    _setattr(self, field.attname, val)
    
        if kwargs:
            property_names = opts._property_names
            unexpected = ()
            for prop, value in kwargs.items():
                # Any remaining kwargs must correspond to properties or virtual
                # fields.
                if prop in property_names:
                    if value is not _DEFERRED:
                        _setattr(self, prop, value)
                else:
                    try:
                        opts.get_field(prop)
                    except FieldDoesNotExist:
                        unexpected += (prop,)
                    else:
                        if value is not _DEFERRED:
                            _setattr(self, prop, value)
            if unexpected:
                unexpected_names = ", ".join(repr(n) for n in unexpected)
>               raise TypeError(
                    f"{cls.__name__}() got unexpected keyword arguments: "
                    f"{unexpected_names}"
                )
E               TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'

venv/lib/python3.12/site-packages/django/db/models/base.py:567: TypeError
----------------------------- Captured stdout call -----------------------------
Performing safe reset of SEEDED local data...
Performing targeted reset of seeded data (PREFIX: SEED-)...
Seeding master data...
Seeding purchases and inventory...
_____________ GSTR2BServiceTests.test_reconciliation_missing_in_2b _____________

self = <apps.reports.tests.test_gstr2b.GSTR2BServiceTests testMethod=test_reconciliation_missing_in_2b>

    def setUp(self):
        import apps.gst.provider
        apps.gst.provider._ACTIVE_PROVIDER = None
>       call_command('seed_local_gst_test_data', reset=True, seed=42)

apps/reports/tests/test_gstr2b.py:13: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
venv/lib/python3.12/site-packages/django/core/management/__init__.py:194: in call_command
    return command.execute(*args, **defaults)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/core/management/base.py:459: in execute
    output = self.handle(*args, **options)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seed_local_gst_test_data.py:23: in handle
    run_seeder(size=size, hard_reset=False, random_seed=seed)
apps/core/management/commands/seeder.py:341: in run_seeder
    batches = seed_purchases(outlets, distributors, products, num_purchases=n_pur)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seeder.py:179: in seed_purchases
    PurchaseItem.objects.create(
venv/lib/python3.12/site-packages/django/db/models/manager.py:87: in manager_method
    return getattr(self.get_queryset(), name)(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/db/models/query.py:677: in create
    obj = self.model(**kwargs)
          ^^^^^^^^^^^^^^^^^^^^
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <PurchaseItem: SEED-Azithromycin 250mg - SEED-B-8929e9-0-0>, args = ()
kwargs = {'sale_rate': Decimal('120.00')}

    def __init__(self, *args, **kwargs):
        # Alias some things as locals to avoid repeat global lookups
        cls = self.__class__
        opts = self._meta
        _setattr = setattr
        _DEFERRED = DEFERRED
        if opts.abstract:
            raise TypeError("Abstract models cannot be instantiated.")
    
        pre_init.send(sender=cls, args=args, kwargs=kwargs)
    
        # Set up the storage for instance state
        self._state = ModelState()
    
        # There is a rather weird disparity here; if kwargs, it's set, then args
        # overrides it. It should be one or the other; don't duplicate the work
        # The reason for the kwargs check is that standard iterator passes in by
        # args, and instantiation for iteration is 33% faster.
        if len(args) > len(opts.concrete_fields):
            # Daft, but matches old exception sans the err msg.
            raise IndexError("Number of args exceeds number of fields")
    
        if not kwargs:
            fields_iter = iter(opts.concrete_fields)
            # The ordering of the zip calls matter - zip throws StopIteration
            # when an iter throws it. So if the first iter throws it, the second
            # is *not* consumed. We rely on this, so don't change the order
            # without changing the logic.
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
        else:
            # Slower, kwargs-ready version.
            fields_iter = iter(opts.fields)
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
                if kwargs.pop(field.name, NOT_PROVIDED) is not NOT_PROVIDED:
                    raise TypeError(
                        f"{cls.__qualname__}() got both positional and "
                        f"keyword arguments for field '{field.name}'."
                    )
    
        # Now we're left with the unprocessed fields that *must* come from
        # keywords, or default.
    
        for field in fields_iter:
            is_related_object = False
            # Virtual field
            if field.attname not in kwargs and field.column is None or field.generated:
                continue
            if kwargs:
                if isinstance(field.remote_field, ForeignObjectRel):
                    try:
                        # Assume object instance was passed in.
                        rel_obj = kwargs.pop(field.name)
                        is_related_object = True
                    except KeyError:
                        try:
                            # Object instance wasn't passed in -- must be an ID.
                            val = kwargs.pop(field.attname)
                        except KeyError:
                            val = field.get_default()
                else:
                    try:
                        val = kwargs.pop(field.attname)
                    except KeyError:
                        # This is done with an exception rather than the
                        # default argument on pop because we don't want
                        # get_default() to be evaluated, and then not used.
                        # Refs #12057.
                        val = field.get_default()
            else:
                val = field.get_default()
    
            if is_related_object:
                # If we are passed a related instance, set it using the
                # field.name instead of field.attname (e.g. "user" instead of
                # "user_id") so that the object gets properly cached (and type
                # checked) by the RelatedObjectDescriptor.
                if rel_obj is not _DEFERRED:
                    _setattr(self, field.name, rel_obj)
            else:
                if val is not _DEFERRED:
                    _setattr(self, field.attname, val)
    
        if kwargs:
            property_names = opts._property_names
            unexpected = ()
            for prop, value in kwargs.items():
                # Any remaining kwargs must correspond to properties or virtual
                # fields.
                if prop in property_names:
                    if value is not _DEFERRED:
                        _setattr(self, prop, value)
                else:
                    try:
                        opts.get_field(prop)
                    except FieldDoesNotExist:
                        unexpected += (prop,)
                    else:
                        if value is not _DEFERRED:
                            _setattr(self, prop, value)
            if unexpected:
                unexpected_names = ", ".join(repr(n) for n in unexpected)
>               raise TypeError(
                    f"{cls.__name__}() got unexpected keyword arguments: "
                    f"{unexpected_names}"
                )
E               TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'

venv/lib/python3.12/site-packages/django/db/models/base.py:567: TypeError
----------------------------- Captured stdout call -----------------------------
Performing safe reset of SEEDED local data...
Performing targeted reset of seeded data (PREFIX: SEED-)...
Seeding master data...
Seeding purchases and inventory...
__________ GSTR3BAndReconciliationTest.test_tc_3b_01_outward_supplies __________

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_01_outward_supplies>

    def test_tc_3b_01_outward_supplies(self):
        # Setup sales snapshot (Outward taxable)
        GSTTransactionSnapshot.objects.create(
            outlet=self.outlet,
            gstin='27AAAAA1234A1Z5',
            period=self.period,
            transaction_type='sale',
            document_id=uuid.uuid4(),
            document_number='INV-001',
            document_date=date(2026, 8, 1),
            snapshot_json={
                'is_b2b': False,
                'is_interstate': False,
                'is_import': False,
                'is_rcm': False,
                'is_exempt': False,
                'items_by_rate': {
                    '18.0': {
                        'taxable_amount': 1000.0,
                        'igst': 0.0,
                        'cgst': 90.0,
                        'sgst': 90.0,
                        'cess': 0.0
                    }
                }
            }
        )
        builder = GSTR3BBuilder(gstin='27AAAAA1234A1Z5', period=self.period)
>       payload = builder.generate_json()
                  ^^^^^^^^^^^^^^^^^^^^^^^

apps/reports/tests/test_gstr3b_returns.py:49: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <apps.reports.gstr_builders.GSTR3BBuilder object at 0x7135c98d6ba0>

    def generate_json(self) -> Dict[str, Any]:
        # Table 3.1
        t31 = {
            "osup_det": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_zero": {"txval": 0.0, "iamt": 0.0, "csamt": 0.0},
            "osup_nil_exmp": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0},
            "isup_rev": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_nongst": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        }
    
        # Table 3.2
        t32_unreg = {}
        t32_comp = {}
        t32_uin = {}
    
        # Table 4 (ITC Available)
        itc_import_goods = {"iamt": 0.0, "csamt": 0.0}
        itc_import_services = {"iamt": 0.0, "csamt": 0.0}
        itc_rcm = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_isd = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_all_other = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        # First, iterate over ALL snapshots for Outward Supplies (Table 3) and RCM Inward liability (3.1.d)
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            is_purchase = snap.transaction_type == 'purchase'
            is_purchase_return = snap.transaction_type == 'purchase_return'
    
            # Treat purchase returns as negative ITC if it's related to purchase
            multiplier = -1 if ('return' in snap.transaction_type) else 1
    
            is_rcm = json_data.get('is_rcm', False)
            is_exempt = json_data.get('is_exempt', False)
            is_b2b = json_data.get('is_b2b', False)
            is_interstate = json_data.get('is_interstate', False)
            pos = json_data.get('pos', '')
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                tx = values['taxable_amount'] * multiplier
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
                is_zero_rated = (rate == '0.0' or rate == '0') and tx > 0 and not is_exempt
    
                if is_purchase or is_purchase_return:
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
                            if pos not in t32_unreg:
                                t32_unreg[pos] = {"txval": 0.0, "iamt": 0.0}
                            t32_unreg[pos]["txval"] += tx
                            t32_unreg[pos]["iamt"] += ig
    
        # Second, iterate over MATCHED 2B records for Table 4(A) ITC Available
        from apps.reports.models import ITCReconciliationResult, DeferredITCEntry
        matched_results = ITCReconciliationResult.objects.filter(
            run__period=self.period,
            match_status='MATCHED',
            purchase_snapshot__in=self.snapshots
        )
    
        for res in matched_results:
            snap = res.purchase_snapshot
            if not snap: continue
            json_data = snap.snapshot_json
            multiplier = -1 if ('return' in snap.transaction_type) else 1
            is_import = json_data.get('is_import', False)
            is_rcm = json_data.get('is_rcm', False)
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
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
        claimed_deferred = DeferredITCEntry.objects.filter(claimed_period=self.period, status='CLAIMED')
        for d in claimed_deferred:
            itc_all_other["iamt"] += float(d.iamt)
            itc_all_other["camt"] += float(d.camt)
            itc_all_other["samt"] += float(d.samt)
            itc_all_other["csamt"] += float(d.csamt)
    
        # ITC Reversals from StockAdjustments (4B)
        from apps.inventory.models import StockAdjustment
        from apps.purchases.models import Rule37Adjustment
        from django.db.models import Sum
    
        rev_17_5 = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(1)
        rev_others = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(2)
        itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        try:
            month = int(self.period[:2])
            year = int(self.period[2:])
    
            # Phase A1: Section 17(5)(h) Physical Inventory Loss -> 4B(1) Rule 42,43,17(5)
            adjustments = StockAdjustment.objects.filter(
                outlet__gstin=self.gstin,
                status='APPROVED',
                effective_date__month=month,
                effective_date__year=year,
                gstr_reason_code='SECTION_17_5_H'
            )
            for adj in adjustments:
                allocs = adj.allocations.aggregate(
                    sum_igst=Sum('reversed_igst_amount'),
                    sum_cgst=Sum('reversed_cgst_amount'),
                    sum_sgst=Sum('reversed_sgst_amount'),
                    sum_cess=Sum('reversed_cess_amount')
                )
                rev_17_5["iamt"] += float(allocs['sum_igst'] or 0)
                rev_17_5["camt"] += float(allocs['sum_cgst'] or 0)
                rev_17_5["samt"] += float(allocs['sum_sgst'] or 0)
                rev_17_5["csamt"] += float(allocs['sum_cess'] or 0)
    
            # Phase A2: Rule 37 Reversals -> 4B(2) Others
            # Reversals due
            rule37_reversals = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                action_type='REVERSAL_DUE',
                calculation_date__month=month,
                calculation_date__year=year
            )
            for adj in rule37_reversals:
                rev_others["iamt"] += float(adj.reversed_igst)
                rev_others["camt"] += float(adj.reversed_cgst)
                rev_others["samt"] += float(adj.reversed_sgst)
                rev_others["csamt"] += float(adj.reversed_cess)
    
            # Reclaims
            rule37_reclaims = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                reclaim_period=self.period
            )
            itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
            for adj in rule37_reclaims:
                ig = float(adj.reclaimed_igst or 0)
                cg = float(adj.reclaimed_cgst or 0)
                sg = float(adj.reclaimed_sgst or 0)
                cs = float(adj.reversed_cess or 0) # cess might not be reclaimed explicitly, keep 0 or reversed
    
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
    
        # Build final structures
        itc_avl_list = [
            {"ty": "Import of Goods", "iamt": itc_import_goods["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_goods["csamt"]},
            {"ty": "Import of Services", "iamt": itc_import_services["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_services["csamt"]},
            {"ty": "Inward supplies liable to reverse charge", **itc_rcm},
            {"ty": "Inward supplies from ISD", **itc_isd},
            {"ty": "All other ITC", **itc_all_other},
        ]
    
        itc_rev_list = [
            {"ty": "Rule 42,43,17(5)", **rev_17_5},
            {"ty": "Others", **rev_others},
        ]
    
        net_iamt = sum(a["iamt"] for a in itc_avl_list) - sum(r["iamt"] for r in itc_rev_list)
        net_camt = sum(a["camt"] for a in itc_avl_list) - sum(r["camt"] for r in itc_rev_list)
        net_samt = sum(a["samt"] for a in itc_avl_list) - sum(r["samt"] for r in itc_rev_list)
        net_csamt = sum(a["csamt"] for a in itc_avl_list) - sum(r["csamt"] for r in itc_rev_list)
    
        itc_net = {
            "iamt": net_iamt,
            "camt": net_camt,
            "samt": net_samt,
            "csamt": net_csamt
        }
    
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
                "itc_avl": [a for a in itc_avl_list if any(v != 0 for k, v in a.items() if k != "ty")],
                "itc_rev": [r for r in itc_rev_list if any(v != 0 for k, v in r.items() if k != "ty")],
                "itc_net": itc_net,
                "itc_inelg": []
            },
            "other_details": [o for o in other_details_list if any(v != 0 for k, v in o.items() if k != "ty")]
        }
    
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/gstr_builders.py:630: ImportError
____________ GSTR3BAndReconciliationTest.test_tc_3b_02_itc_eligible ____________

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_02_itc_eligible>

    def test_tc_3b_02_itc_eligible(self):
        # Setup purchase snapshot
        GSTTransactionSnapshot.objects.create(
            outlet=self.outlet,
            gstin='27AAAAA1234A1Z5',
            period=self.period,
            transaction_type='purchase',
            document_id=uuid.uuid4(),
            document_number='PINV-001',
            document_date=date(2026, 8, 2),
            snapshot_json={
                'is_b2b': True,
                'distributor_gstin': '27BBBBB1234B1Z5',
                'is_interstate': False,
                'is_import': False,
                'is_rcm': False,
                'is_exempt': False,
                'items_by_rate': {
                    '12.0': {
                        'taxable_amount': 500.0,
                        'igst': 0.0,
                        'cgst': 30.0,
                        'sgst': 30.0,
                        'cess': 0.0
                    }
                }
            }
        )
        run = ITCReconciliationRun.objects.create(outlet=self.outlet, period=self.period, status='COMPLETED')
        snap = GSTTransactionSnapshot.objects.get(document_number='PINV-001')
        ITCReconciliationResult.objects.create(run=run, purchase_snapshot=snap, match_status='MATCHED', mismatch_reasons=[])
        builder = GSTR3BBuilder(gstin='27AAAAA1234A1Z5', period=self.period)
>       payload = builder.generate_json()
                  ^^^^^^^^^^^^^^^^^^^^^^^

apps/reports/tests/test_gstr3b_returns.py:89: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <apps.reports.gstr_builders.GSTR3BBuilder object at 0x7135c9f5fec0>

    def generate_json(self) -> Dict[str, Any]:
        # Table 3.1
        t31 = {
            "osup_det": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_zero": {"txval": 0.0, "iamt": 0.0, "csamt": 0.0},
            "osup_nil_exmp": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0},
            "isup_rev": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_nongst": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        }
    
        # Table 3.2
        t32_unreg = {}
        t32_comp = {}
        t32_uin = {}
    
        # Table 4 (ITC Available)
        itc_import_goods = {"iamt": 0.0, "csamt": 0.0}
        itc_import_services = {"iamt": 0.0, "csamt": 0.0}
        itc_rcm = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_isd = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_all_other = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        # First, iterate over ALL snapshots for Outward Supplies (Table 3) and RCM Inward liability (3.1.d)
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            is_purchase = snap.transaction_type == 'purchase'
            is_purchase_return = snap.transaction_type == 'purchase_return'
    
            # Treat purchase returns as negative ITC if it's related to purchase
            multiplier = -1 if ('return' in snap.transaction_type) else 1
    
            is_rcm = json_data.get('is_rcm', False)
            is_exempt = json_data.get('is_exempt', False)
            is_b2b = json_data.get('is_b2b', False)
            is_interstate = json_data.get('is_interstate', False)
            pos = json_data.get('pos', '')
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                tx = values['taxable_amount'] * multiplier
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
                is_zero_rated = (rate == '0.0' or rate == '0') and tx > 0 and not is_exempt
    
                if is_purchase or is_purchase_return:
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
                            if pos not in t32_unreg:
                                t32_unreg[pos] = {"txval": 0.0, "iamt": 0.0}
                            t32_unreg[pos]["txval"] += tx
                            t32_unreg[pos]["iamt"] += ig
    
        # Second, iterate over MATCHED 2B records for Table 4(A) ITC Available
        from apps.reports.models import ITCReconciliationResult, DeferredITCEntry
        matched_results = ITCReconciliationResult.objects.filter(
            run__period=self.period,
            match_status='MATCHED',
            purchase_snapshot__in=self.snapshots
        )
    
        for res in matched_results:
            snap = res.purchase_snapshot
            if not snap: continue
            json_data = snap.snapshot_json
            multiplier = -1 if ('return' in snap.transaction_type) else 1
            is_import = json_data.get('is_import', False)
            is_rcm = json_data.get('is_rcm', False)
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
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
        claimed_deferred = DeferredITCEntry.objects.filter(claimed_period=self.period, status='CLAIMED')
        for d in claimed_deferred:
            itc_all_other["iamt"] += float(d.iamt)
            itc_all_other["camt"] += float(d.camt)
            itc_all_other["samt"] += float(d.samt)
            itc_all_other["csamt"] += float(d.csamt)
    
        # ITC Reversals from StockAdjustments (4B)
        from apps.inventory.models import StockAdjustment
        from apps.purchases.models import Rule37Adjustment
        from django.db.models import Sum
    
        rev_17_5 = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(1)
        rev_others = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(2)
        itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        try:
            month = int(self.period[:2])
            year = int(self.period[2:])
    
            # Phase A1: Section 17(5)(h) Physical Inventory Loss -> 4B(1) Rule 42,43,17(5)
            adjustments = StockAdjustment.objects.filter(
                outlet__gstin=self.gstin,
                status='APPROVED',
                effective_date__month=month,
                effective_date__year=year,
                gstr_reason_code='SECTION_17_5_H'
            )
            for adj in adjustments:
                allocs = adj.allocations.aggregate(
                    sum_igst=Sum('reversed_igst_amount'),
                    sum_cgst=Sum('reversed_cgst_amount'),
                    sum_sgst=Sum('reversed_sgst_amount'),
                    sum_cess=Sum('reversed_cess_amount')
                )
                rev_17_5["iamt"] += float(allocs['sum_igst'] or 0)
                rev_17_5["camt"] += float(allocs['sum_cgst'] or 0)
                rev_17_5["samt"] += float(allocs['sum_sgst'] or 0)
                rev_17_5["csamt"] += float(allocs['sum_cess'] or 0)
    
            # Phase A2: Rule 37 Reversals -> 4B(2) Others
            # Reversals due
            rule37_reversals = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                action_type='REVERSAL_DUE',
                calculation_date__month=month,
                calculation_date__year=year
            )
            for adj in rule37_reversals:
                rev_others["iamt"] += float(adj.reversed_igst)
                rev_others["camt"] += float(adj.reversed_cgst)
                rev_others["samt"] += float(adj.reversed_sgst)
                rev_others["csamt"] += float(adj.reversed_cess)
    
            # Reclaims
            rule37_reclaims = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                reclaim_period=self.period
            )
            itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
            for adj in rule37_reclaims:
                ig = float(adj.reclaimed_igst or 0)
                cg = float(adj.reclaimed_cgst or 0)
                sg = float(adj.reclaimed_sgst or 0)
                cs = float(adj.reversed_cess or 0) # cess might not be reclaimed explicitly, keep 0 or reversed
    
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
    
        # Build final structures
        itc_avl_list = [
            {"ty": "Import of Goods", "iamt": itc_import_goods["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_goods["csamt"]},
            {"ty": "Import of Services", "iamt": itc_import_services["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_services["csamt"]},
            {"ty": "Inward supplies liable to reverse charge", **itc_rcm},
            {"ty": "Inward supplies from ISD", **itc_isd},
            {"ty": "All other ITC", **itc_all_other},
        ]
    
        itc_rev_list = [
            {"ty": "Rule 42,43,17(5)", **rev_17_5},
            {"ty": "Others", **rev_others},
        ]
    
        net_iamt = sum(a["iamt"] for a in itc_avl_list) - sum(r["iamt"] for r in itc_rev_list)
        net_camt = sum(a["camt"] for a in itc_avl_list) - sum(r["camt"] for r in itc_rev_list)
        net_samt = sum(a["samt"] for a in itc_avl_list) - sum(r["samt"] for r in itc_rev_list)
        net_csamt = sum(a["csamt"] for a in itc_avl_list) - sum(r["csamt"] for r in itc_rev_list)
    
        itc_net = {
            "iamt": net_iamt,
            "camt": net_camt,
            "samt": net_samt,
            "csamt": net_csamt
        }
    
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
                "itc_avl": [a for a in itc_avl_list if any(v != 0 for k, v in a.items() if k != "ty")],
                "itc_rev": [r for r in itc_rev_list if any(v != 0 for k, v in r.items() if k != "ty")],
                "itc_net": itc_net,
                "itc_inelg": []
            },
            "other_details": [o for o in other_details_list if any(v != 0 for k, v in o.items() if k != "ty")]
        }
    
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/gstr_builders.py:630: ImportError
_____ GSTR3BAndReconciliationTest.test_tc_3b_03_itc_reversal_section_17_5 ______

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_03_itc_reversal_section_17_5>

    def test_tc_3b_03_itc_reversal_section_17_5(self):
        # Setup Stock Adjustment for 17(5)(h) — needs a real PurchaseItem for the allocation FK
        from apps.inventory.models import MasterProduct, Batch
        prod = MasterProduct.objects.create(name='Test Prod', manufacturer='M', schedule_type='H', pack_size=10)
        batch = Batch.objects.create(
            outlet=self.outlet, product=prod, batch_no='B1',
            expiry_date=date(2027,1,1), mrp=Decimal('120.0'),
            purchase_rate=Decimal('100.0'), pack_type='strip'
        )
    
        pi = PurchaseInvoice.objects.create(
            outlet=self.outlet,
            distributor=self.distributor,
            invoice_no='SA17-001',
            invoice_date=date(2026, 8, 1),
            subtotal=Decimal('1000.0'),
            taxable_amount=Decimal('1000.0'),
            gst_amount=Decimal('100.0'),
            grand_total=Decimal('1100.0'),
        )
        pi_item = PurchaseItem.objects.create(
            invoice=pi,
            batch=batch,
            master_product=prod,
            batch_no='B1',
            expiry_date=date(2027, 1, 1),
            pkg=10,
            qty=1,
            actual_qty=10,
            purchase_rate=Decimal('100.0'),
            gst_rate=Decimal('10.0'),
            mrp=Decimal('120.0'),
            ptr=Decimal('110.0'),
            pts=Decimal('105.0'),
            taxable_amount=Decimal('1000.0'),
            gst_amount=Decimal('100.0'),
            total_amount=Decimal('1100.0'),
        )
    
        adj = StockAdjustment.objects.create(
            outlet=self.outlet,
            batch=batch,
            status='APPROVED',
            adjustment_type='EXPIRED',
            reason='EXPIRED',
            gstr_reason_code='SECTION_17_5_H',
            effective_date=date(2026, 8, 10)
        )
        StockAdjustmentAllocation.objects.create(
            stock_adjustment=adj,
            source_purchase_item=pi_item,
            allocated_qty=Decimal('5'),
            reversed_igst_amount=Decimal('0.0'),
            reversed_cgst_amount=Decimal('50.0'),
            reversed_sgst_amount=Decimal('50.0'),
            reversed_cess_amount=Decimal('0.0')
        )
        builder = GSTR3BBuilder(gstin='27AAAAA1234A1Z5', period=self.period)
>       payload = builder.generate_json()
                  ^^^^^^^^^^^^^^^^^^^^^^^

apps/reports/tests/test_gstr3b_returns.py:156: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <apps.reports.gstr_builders.GSTR3BBuilder object at 0x7135c9d31130>

    def generate_json(self) -> Dict[str, Any]:
        # Table 3.1
        t31 = {
            "osup_det": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_zero": {"txval": 0.0, "iamt": 0.0, "csamt": 0.0},
            "osup_nil_exmp": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0},
            "isup_rev": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_nongst": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        }
    
        # Table 3.2
        t32_unreg = {}
        t32_comp = {}
        t32_uin = {}
    
        # Table 4 (ITC Available)
        itc_import_goods = {"iamt": 0.0, "csamt": 0.0}
        itc_import_services = {"iamt": 0.0, "csamt": 0.0}
        itc_rcm = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_isd = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_all_other = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        # First, iterate over ALL snapshots for Outward Supplies (Table 3) and RCM Inward liability (3.1.d)
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            is_purchase = snap.transaction_type == 'purchase'
            is_purchase_return = snap.transaction_type == 'purchase_return'
    
            # Treat purchase returns as negative ITC if it's related to purchase
            multiplier = -1 if ('return' in snap.transaction_type) else 1
    
            is_rcm = json_data.get('is_rcm', False)
            is_exempt = json_data.get('is_exempt', False)
            is_b2b = json_data.get('is_b2b', False)
            is_interstate = json_data.get('is_interstate', False)
            pos = json_data.get('pos', '')
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                tx = values['taxable_amount'] * multiplier
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
                is_zero_rated = (rate == '0.0' or rate == '0') and tx > 0 and not is_exempt
    
                if is_purchase or is_purchase_return:
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
                            if pos not in t32_unreg:
                                t32_unreg[pos] = {"txval": 0.0, "iamt": 0.0}
                            t32_unreg[pos]["txval"] += tx
                            t32_unreg[pos]["iamt"] += ig
    
        # Second, iterate over MATCHED 2B records for Table 4(A) ITC Available
        from apps.reports.models import ITCReconciliationResult, DeferredITCEntry
        matched_results = ITCReconciliationResult.objects.filter(
            run__period=self.period,
            match_status='MATCHED',
            purchase_snapshot__in=self.snapshots
        )
    
        for res in matched_results:
            snap = res.purchase_snapshot
            if not snap: continue
            json_data = snap.snapshot_json
            multiplier = -1 if ('return' in snap.transaction_type) else 1
            is_import = json_data.get('is_import', False)
            is_rcm = json_data.get('is_rcm', False)
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
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
        claimed_deferred = DeferredITCEntry.objects.filter(claimed_period=self.period, status='CLAIMED')
        for d in claimed_deferred:
            itc_all_other["iamt"] += float(d.iamt)
            itc_all_other["camt"] += float(d.camt)
            itc_all_other["samt"] += float(d.samt)
            itc_all_other["csamt"] += float(d.csamt)
    
        # ITC Reversals from StockAdjustments (4B)
        from apps.inventory.models import StockAdjustment
        from apps.purchases.models import Rule37Adjustment
        from django.db.models import Sum
    
        rev_17_5 = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(1)
        rev_others = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(2)
        itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        try:
            month = int(self.period[:2])
            year = int(self.period[2:])
    
            # Phase A1: Section 17(5)(h) Physical Inventory Loss -> 4B(1) Rule 42,43,17(5)
            adjustments = StockAdjustment.objects.filter(
                outlet__gstin=self.gstin,
                status='APPROVED',
                effective_date__month=month,
                effective_date__year=year,
                gstr_reason_code='SECTION_17_5_H'
            )
            for adj in adjustments:
                allocs = adj.allocations.aggregate(
                    sum_igst=Sum('reversed_igst_amount'),
                    sum_cgst=Sum('reversed_cgst_amount'),
                    sum_sgst=Sum('reversed_sgst_amount'),
                    sum_cess=Sum('reversed_cess_amount')
                )
                rev_17_5["iamt"] += float(allocs['sum_igst'] or 0)
                rev_17_5["camt"] += float(allocs['sum_cgst'] or 0)
                rev_17_5["samt"] += float(allocs['sum_sgst'] or 0)
                rev_17_5["csamt"] += float(allocs['sum_cess'] or 0)
    
            # Phase A2: Rule 37 Reversals -> 4B(2) Others
            # Reversals due
            rule37_reversals = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                action_type='REVERSAL_DUE',
                calculation_date__month=month,
                calculation_date__year=year
            )
            for adj in rule37_reversals:
                rev_others["iamt"] += float(adj.reversed_igst)
                rev_others["camt"] += float(adj.reversed_cgst)
                rev_others["samt"] += float(adj.reversed_sgst)
                rev_others["csamt"] += float(adj.reversed_cess)
    
            # Reclaims
            rule37_reclaims = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                reclaim_period=self.period
            )
            itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
            for adj in rule37_reclaims:
                ig = float(adj.reclaimed_igst or 0)
                cg = float(adj.reclaimed_cgst or 0)
                sg = float(adj.reclaimed_sgst or 0)
                cs = float(adj.reversed_cess or 0) # cess might not be reclaimed explicitly, keep 0 or reversed
    
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
    
        # Build final structures
        itc_avl_list = [
            {"ty": "Import of Goods", "iamt": itc_import_goods["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_goods["csamt"]},
            {"ty": "Import of Services", "iamt": itc_import_services["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_services["csamt"]},
            {"ty": "Inward supplies liable to reverse charge", **itc_rcm},
            {"ty": "Inward supplies from ISD", **itc_isd},
            {"ty": "All other ITC", **itc_all_other},
        ]
    
        itc_rev_list = [
            {"ty": "Rule 42,43,17(5)", **rev_17_5},
            {"ty": "Others", **rev_others},
        ]
    
        net_iamt = sum(a["iamt"] for a in itc_avl_list) - sum(r["iamt"] for r in itc_rev_list)
        net_camt = sum(a["camt"] for a in itc_avl_list) - sum(r["camt"] for r in itc_rev_list)
        net_samt = sum(a["samt"] for a in itc_avl_list) - sum(r["samt"] for r in itc_rev_list)
        net_csamt = sum(a["csamt"] for a in itc_avl_list) - sum(r["csamt"] for r in itc_rev_list)
    
        itc_net = {
            "iamt": net_iamt,
            "camt": net_camt,
            "samt": net_samt,
            "csamt": net_csamt
        }
    
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
                "itc_avl": [a for a in itc_avl_list if any(v != 0 for k, v in a.items() if k != "ty")],
                "itc_rev": [r for r in itc_rev_list if any(v != 0 for k, v in r.items() if k != "ty")],
                "itc_net": itc_net,
                "itc_inelg": []
            },
            "other_details": [o for o in other_details_list if any(v != 0 for k, v in o.items() if k != "ty")]
        }
    
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/gstr_builders.py:630: ImportError
________ GSTR3BAndReconciliationTest.test_tc_3b_04_itc_reversal_rule_37 ________

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_04_itc_reversal_rule_37>

    def test_tc_3b_04_itc_reversal_rule_37(self):
        # Setup Rule 37 Adjustment — provide all required PurchaseInvoice fields
        pi = PurchaseInvoice.objects.create(
            outlet=self.outlet,
            distributor=self.distributor,
            invoice_no='R37-001',
            invoice_date=date(2026, 1, 1),
            due_date=date(2026, 1, 15),
            subtotal=Decimal('1000.0'),
            taxable_amount=Decimal('1000.0'),
            gst_amount=Decimal('180.0'),
            grand_total=Decimal('1180.0'),
        )
        Rule37Adjustment.objects.create(
            invoice=pi,
            action_type='REVERSAL_DUE',
            status='APPROVED',
            rule37_due_date=date(2026, 7, 1),
            days_outstanding_at_evaluation=185,
            invoice_total_at_evaluation=Decimal('1180.0'),
            amount_paid_at_evaluation=Decimal('0.0'),
            unpaid_amount_at_evaluation=Decimal('1180.0'),
            unpaid_ratio=Decimal('1.0000'),
            reversed_igst=Decimal('0.0'),
            reversed_cgst=Decimal('90.0'),
            reversed_sgst=Decimal('90.0'),
            reversed_cess=Decimal('0.0'),
        )
        builder = GSTR3BBuilder(gstin='27AAAAA1234A1Z5', period=self.period)
>       payload = builder.generate_json()
                  ^^^^^^^^^^^^^^^^^^^^^^^

apps/reports/tests/test_gstr3b_returns.py:194: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <apps.reports.gstr_builders.GSTR3BBuilder object at 0x7135ca39f380>

    def generate_json(self) -> Dict[str, Any]:
        # Table 3.1
        t31 = {
            "osup_det": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_zero": {"txval": 0.0, "iamt": 0.0, "csamt": 0.0},
            "osup_nil_exmp": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0},
            "isup_rev": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_nongst": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        }
    
        # Table 3.2
        t32_unreg = {}
        t32_comp = {}
        t32_uin = {}
    
        # Table 4 (ITC Available)
        itc_import_goods = {"iamt": 0.0, "csamt": 0.0}
        itc_import_services = {"iamt": 0.0, "csamt": 0.0}
        itc_rcm = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_isd = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_all_other = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        # First, iterate over ALL snapshots for Outward Supplies (Table 3) and RCM Inward liability (3.1.d)
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            is_purchase = snap.transaction_type == 'purchase'
            is_purchase_return = snap.transaction_type == 'purchase_return'
    
            # Treat purchase returns as negative ITC if it's related to purchase
            multiplier = -1 if ('return' in snap.transaction_type) else 1
    
            is_rcm = json_data.get('is_rcm', False)
            is_exempt = json_data.get('is_exempt', False)
            is_b2b = json_data.get('is_b2b', False)
            is_interstate = json_data.get('is_interstate', False)
            pos = json_data.get('pos', '')
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                tx = values['taxable_amount'] * multiplier
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
                is_zero_rated = (rate == '0.0' or rate == '0') and tx > 0 and not is_exempt
    
                if is_purchase or is_purchase_return:
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
                            if pos not in t32_unreg:
                                t32_unreg[pos] = {"txval": 0.0, "iamt": 0.0}
                            t32_unreg[pos]["txval"] += tx
                            t32_unreg[pos]["iamt"] += ig
    
        # Second, iterate over MATCHED 2B records for Table 4(A) ITC Available
        from apps.reports.models import ITCReconciliationResult, DeferredITCEntry
        matched_results = ITCReconciliationResult.objects.filter(
            run__period=self.period,
            match_status='MATCHED',
            purchase_snapshot__in=self.snapshots
        )
    
        for res in matched_results:
            snap = res.purchase_snapshot
            if not snap: continue
            json_data = snap.snapshot_json
            multiplier = -1 if ('return' in snap.transaction_type) else 1
            is_import = json_data.get('is_import', False)
            is_rcm = json_data.get('is_rcm', False)
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
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
        claimed_deferred = DeferredITCEntry.objects.filter(claimed_period=self.period, status='CLAIMED')
        for d in claimed_deferred:
            itc_all_other["iamt"] += float(d.iamt)
            itc_all_other["camt"] += float(d.camt)
            itc_all_other["samt"] += float(d.samt)
            itc_all_other["csamt"] += float(d.csamt)
    
        # ITC Reversals from StockAdjustments (4B)
        from apps.inventory.models import StockAdjustment
        from apps.purchases.models import Rule37Adjustment
        from django.db.models import Sum
    
        rev_17_5 = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(1)
        rev_others = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(2)
        itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        try:
            month = int(self.period[:2])
            year = int(self.period[2:])
    
            # Phase A1: Section 17(5)(h) Physical Inventory Loss -> 4B(1) Rule 42,43,17(5)
            adjustments = StockAdjustment.objects.filter(
                outlet__gstin=self.gstin,
                status='APPROVED',
                effective_date__month=month,
                effective_date__year=year,
                gstr_reason_code='SECTION_17_5_H'
            )
            for adj in adjustments:
                allocs = adj.allocations.aggregate(
                    sum_igst=Sum('reversed_igst_amount'),
                    sum_cgst=Sum('reversed_cgst_amount'),
                    sum_sgst=Sum('reversed_sgst_amount'),
                    sum_cess=Sum('reversed_cess_amount')
                )
                rev_17_5["iamt"] += float(allocs['sum_igst'] or 0)
                rev_17_5["camt"] += float(allocs['sum_cgst'] or 0)
                rev_17_5["samt"] += float(allocs['sum_sgst'] or 0)
                rev_17_5["csamt"] += float(allocs['sum_cess'] or 0)
    
            # Phase A2: Rule 37 Reversals -> 4B(2) Others
            # Reversals due
            rule37_reversals = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                action_type='REVERSAL_DUE',
                calculation_date__month=month,
                calculation_date__year=year
            )
            for adj in rule37_reversals:
                rev_others["iamt"] += float(adj.reversed_igst)
                rev_others["camt"] += float(adj.reversed_cgst)
                rev_others["samt"] += float(adj.reversed_sgst)
                rev_others["csamt"] += float(adj.reversed_cess)
    
            # Reclaims
            rule37_reclaims = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                reclaim_period=self.period
            )
            itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
            for adj in rule37_reclaims:
                ig = float(adj.reclaimed_igst or 0)
                cg = float(adj.reclaimed_cgst or 0)
                sg = float(adj.reclaimed_sgst or 0)
                cs = float(adj.reversed_cess or 0) # cess might not be reclaimed explicitly, keep 0 or reversed
    
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
    
        # Build final structures
        itc_avl_list = [
            {"ty": "Import of Goods", "iamt": itc_import_goods["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_goods["csamt"]},
            {"ty": "Import of Services", "iamt": itc_import_services["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_services["csamt"]},
            {"ty": "Inward supplies liable to reverse charge", **itc_rcm},
            {"ty": "Inward supplies from ISD", **itc_isd},
            {"ty": "All other ITC", **itc_all_other},
        ]
    
        itc_rev_list = [
            {"ty": "Rule 42,43,17(5)", **rev_17_5},
            {"ty": "Others", **rev_others},
        ]
    
        net_iamt = sum(a["iamt"] for a in itc_avl_list) - sum(r["iamt"] for r in itc_rev_list)
        net_camt = sum(a["camt"] for a in itc_avl_list) - sum(r["camt"] for r in itc_rev_list)
        net_samt = sum(a["samt"] for a in itc_avl_list) - sum(r["samt"] for r in itc_rev_list)
        net_csamt = sum(a["csamt"] for a in itc_avl_list) - sum(r["csamt"] for r in itc_rev_list)
    
        itc_net = {
            "iamt": net_iamt,
            "camt": net_camt,
            "samt": net_samt,
            "csamt": net_csamt
        }
    
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
                "itc_avl": [a for a in itc_avl_list if any(v != 0 for k, v in a.items() if k != "ty")],
                "itc_rev": [r for r in itc_rev_list if any(v != 0 for k, v in r.items() if k != "ty")],
                "itc_net": itc_net,
                "itc_inelg": []
            },
            "other_details": [o for o in other_details_list if any(v != 0 for k, v in o.items() if k != "ty")]
        }
    
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/gstr_builders.py:630: ImportError
_________ GSTR3BAndReconciliationTest.test_tc_3b_10_rcm_inward_supply __________

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_10_rcm_inward_supply>

    def test_tc_3b_10_rcm_inward_supply(self):
        GSTTransactionSnapshot.objects.create(
            outlet=self.outlet, gstin='27AAAAA1234A1Z5', period=self.period,
            transaction_type='purchase', document_id=uuid.uuid4(), document_number='INV-RCM', document_date=date(2026, 8, 1),
            snapshot_json={
                'is_rcm': True, 'is_b2b': True, 'items_by_rate': {'18.0': {'taxable_amount': 1000.0, 'igst': 180.0, 'cgst': 0.0, 'sgst': 0.0, 'cess': 0.0}}
            }
        )
        builder = GSTR3BBuilder(gstin='27AAAAA1234A1Z5', period=self.period)
>       payload = builder.generate_json()
                  ^^^^^^^^^^^^^^^^^^^^^^^

apps/reports/tests/test_gstr3b_returns.py:355: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <apps.reports.gstr_builders.GSTR3BBuilder object at 0x7135c9e8d3d0>

    def generate_json(self) -> Dict[str, Any]:
        # Table 3.1
        t31 = {
            "osup_det": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_zero": {"txval": 0.0, "iamt": 0.0, "csamt": 0.0},
            "osup_nil_exmp": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0},
            "isup_rev": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_nongst": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        }
    
        # Table 3.2
        t32_unreg = {}
        t32_comp = {}
        t32_uin = {}
    
        # Table 4 (ITC Available)
        itc_import_goods = {"iamt": 0.0, "csamt": 0.0}
        itc_import_services = {"iamt": 0.0, "csamt": 0.0}
        itc_rcm = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_isd = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_all_other = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        # First, iterate over ALL snapshots for Outward Supplies (Table 3) and RCM Inward liability (3.1.d)
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            is_purchase = snap.transaction_type == 'purchase'
            is_purchase_return = snap.transaction_type == 'purchase_return'
    
            # Treat purchase returns as negative ITC if it's related to purchase
            multiplier = -1 if ('return' in snap.transaction_type) else 1
    
            is_rcm = json_data.get('is_rcm', False)
            is_exempt = json_data.get('is_exempt', False)
            is_b2b = json_data.get('is_b2b', False)
            is_interstate = json_data.get('is_interstate', False)
            pos = json_data.get('pos', '')
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                tx = values['taxable_amount'] * multiplier
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
                is_zero_rated = (rate == '0.0' or rate == '0') and tx > 0 and not is_exempt
    
                if is_purchase or is_purchase_return:
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
                            if pos not in t32_unreg:
                                t32_unreg[pos] = {"txval": 0.0, "iamt": 0.0}
                            t32_unreg[pos]["txval"] += tx
                            t32_unreg[pos]["iamt"] += ig
    
        # Second, iterate over MATCHED 2B records for Table 4(A) ITC Available
        from apps.reports.models import ITCReconciliationResult, DeferredITCEntry
        matched_results = ITCReconciliationResult.objects.filter(
            run__period=self.period,
            match_status='MATCHED',
            purchase_snapshot__in=self.snapshots
        )
    
        for res in matched_results:
            snap = res.purchase_snapshot
            if not snap: continue
            json_data = snap.snapshot_json
            multiplier = -1 if ('return' in snap.transaction_type) else 1
            is_import = json_data.get('is_import', False)
            is_rcm = json_data.get('is_rcm', False)
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
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
        claimed_deferred = DeferredITCEntry.objects.filter(claimed_period=self.period, status='CLAIMED')
        for d in claimed_deferred:
            itc_all_other["iamt"] += float(d.iamt)
            itc_all_other["camt"] += float(d.camt)
            itc_all_other["samt"] += float(d.samt)
            itc_all_other["csamt"] += float(d.csamt)
    
        # ITC Reversals from StockAdjustments (4B)
        from apps.inventory.models import StockAdjustment
        from apps.purchases.models import Rule37Adjustment
        from django.db.models import Sum
    
        rev_17_5 = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(1)
        rev_others = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(2)
        itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        try:
            month = int(self.period[:2])
            year = int(self.period[2:])
    
            # Phase A1: Section 17(5)(h) Physical Inventory Loss -> 4B(1) Rule 42,43,17(5)
            adjustments = StockAdjustment.objects.filter(
                outlet__gstin=self.gstin,
                status='APPROVED',
                effective_date__month=month,
                effective_date__year=year,
                gstr_reason_code='SECTION_17_5_H'
            )
            for adj in adjustments:
                allocs = adj.allocations.aggregate(
                    sum_igst=Sum('reversed_igst_amount'),
                    sum_cgst=Sum('reversed_cgst_amount'),
                    sum_sgst=Sum('reversed_sgst_amount'),
                    sum_cess=Sum('reversed_cess_amount')
                )
                rev_17_5["iamt"] += float(allocs['sum_igst'] or 0)
                rev_17_5["camt"] += float(allocs['sum_cgst'] or 0)
                rev_17_5["samt"] += float(allocs['sum_sgst'] or 0)
                rev_17_5["csamt"] += float(allocs['sum_cess'] or 0)
    
            # Phase A2: Rule 37 Reversals -> 4B(2) Others
            # Reversals due
            rule37_reversals = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                action_type='REVERSAL_DUE',
                calculation_date__month=month,
                calculation_date__year=year
            )
            for adj in rule37_reversals:
                rev_others["iamt"] += float(adj.reversed_igst)
                rev_others["camt"] += float(adj.reversed_cgst)
                rev_others["samt"] += float(adj.reversed_sgst)
                rev_others["csamt"] += float(adj.reversed_cess)
    
            # Reclaims
            rule37_reclaims = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                reclaim_period=self.period
            )
            itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
            for adj in rule37_reclaims:
                ig = float(adj.reclaimed_igst or 0)
                cg = float(adj.reclaimed_cgst or 0)
                sg = float(adj.reclaimed_sgst or 0)
                cs = float(adj.reversed_cess or 0) # cess might not be reclaimed explicitly, keep 0 or reversed
    
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
    
        # Build final structures
        itc_avl_list = [
            {"ty": "Import of Goods", "iamt": itc_import_goods["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_goods["csamt"]},
            {"ty": "Import of Services", "iamt": itc_import_services["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_services["csamt"]},
            {"ty": "Inward supplies liable to reverse charge", **itc_rcm},
            {"ty": "Inward supplies from ISD", **itc_isd},
            {"ty": "All other ITC", **itc_all_other},
        ]
    
        itc_rev_list = [
            {"ty": "Rule 42,43,17(5)", **rev_17_5},
            {"ty": "Others", **rev_others},
        ]
    
        net_iamt = sum(a["iamt"] for a in itc_avl_list) - sum(r["iamt"] for r in itc_rev_list)
        net_camt = sum(a["camt"] for a in itc_avl_list) - sum(r["camt"] for r in itc_rev_list)
        net_samt = sum(a["samt"] for a in itc_avl_list) - sum(r["samt"] for r in itc_rev_list)
        net_csamt = sum(a["csamt"] for a in itc_avl_list) - sum(r["csamt"] for r in itc_rev_list)
    
        itc_net = {
            "iamt": net_iamt,
            "camt": net_camt,
            "samt": net_samt,
            "csamt": net_csamt
        }
    
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
                "itc_avl": [a for a in itc_avl_list if any(v != 0 for k, v in a.items() if k != "ty")],
                "itc_rev": [r for r in itc_rev_list if any(v != 0 for k, v in r.items() if k != "ty")],
                "itc_net": itc_net,
                "itc_inelg": []
            },
            "other_details": [o for o in other_details_list if any(v != 0 for k, v in o.items() if k != "ty")]
        }
    
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/gstr_builders.py:630: ImportError
______ GSTR3BAndReconciliationTest.test_tc_3b_11_inter_state_unregistered ______

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_11_inter_state_unregistered>

    def test_tc_3b_11_inter_state_unregistered(self):
        GSTTransactionSnapshot.objects.create(
            outlet=self.outlet, gstin='27AAAAA1234A1Z5', period=self.period,
            transaction_type='sale', document_id=uuid.uuid4(), document_number='INV-B2C', document_date=date(2026, 8, 1),
            snapshot_json={
                'is_interstate': True, 'is_b2b': False, 'pos': '32', 'items_by_rate': {'18.0': {'taxable_amount': 1000.0, 'igst': 180.0, 'cgst': 0.0, 'sgst': 0.0, 'cess': 0.0}}
            }
        )
        builder = GSTR3BBuilder(gstin='27AAAAA1234A1Z5', period=self.period)
>       payload = builder.generate_json()
                  ^^^^^^^^^^^^^^^^^^^^^^^

apps/reports/tests/test_gstr3b_returns.py:368: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <apps.reports.gstr_builders.GSTR3BBuilder object at 0x7135c97d2c90>

    def generate_json(self) -> Dict[str, Any]:
        # Table 3.1
        t31 = {
            "osup_det": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_zero": {"txval": 0.0, "iamt": 0.0, "csamt": 0.0},
            "osup_nil_exmp": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0},
            "isup_rev": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_nongst": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        }
    
        # Table 3.2
        t32_unreg = {}
        t32_comp = {}
        t32_uin = {}
    
        # Table 4 (ITC Available)
        itc_import_goods = {"iamt": 0.0, "csamt": 0.0}
        itc_import_services = {"iamt": 0.0, "csamt": 0.0}
        itc_rcm = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_isd = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_all_other = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        # First, iterate over ALL snapshots for Outward Supplies (Table 3) and RCM Inward liability (3.1.d)
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            is_purchase = snap.transaction_type == 'purchase'
            is_purchase_return = snap.transaction_type == 'purchase_return'
    
            # Treat purchase returns as negative ITC if it's related to purchase
            multiplier = -1 if ('return' in snap.transaction_type) else 1
    
            is_rcm = json_data.get('is_rcm', False)
            is_exempt = json_data.get('is_exempt', False)
            is_b2b = json_data.get('is_b2b', False)
            is_interstate = json_data.get('is_interstate', False)
            pos = json_data.get('pos', '')
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                tx = values['taxable_amount'] * multiplier
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
                is_zero_rated = (rate == '0.0' or rate == '0') and tx > 0 and not is_exempt
    
                if is_purchase or is_purchase_return:
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
                            if pos not in t32_unreg:
                                t32_unreg[pos] = {"txval": 0.0, "iamt": 0.0}
                            t32_unreg[pos]["txval"] += tx
                            t32_unreg[pos]["iamt"] += ig
    
        # Second, iterate over MATCHED 2B records for Table 4(A) ITC Available
        from apps.reports.models import ITCReconciliationResult, DeferredITCEntry
        matched_results = ITCReconciliationResult.objects.filter(
            run__period=self.period,
            match_status='MATCHED',
            purchase_snapshot__in=self.snapshots
        )
    
        for res in matched_results:
            snap = res.purchase_snapshot
            if not snap: continue
            json_data = snap.snapshot_json
            multiplier = -1 if ('return' in snap.transaction_type) else 1
            is_import = json_data.get('is_import', False)
            is_rcm = json_data.get('is_rcm', False)
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
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
        claimed_deferred = DeferredITCEntry.objects.filter(claimed_period=self.period, status='CLAIMED')
        for d in claimed_deferred:
            itc_all_other["iamt"] += float(d.iamt)
            itc_all_other["camt"] += float(d.camt)
            itc_all_other["samt"] += float(d.samt)
            itc_all_other["csamt"] += float(d.csamt)
    
        # ITC Reversals from StockAdjustments (4B)
        from apps.inventory.models import StockAdjustment
        from apps.purchases.models import Rule37Adjustment
        from django.db.models import Sum
    
        rev_17_5 = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(1)
        rev_others = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(2)
        itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        try:
            month = int(self.period[:2])
            year = int(self.period[2:])
    
            # Phase A1: Section 17(5)(h) Physical Inventory Loss -> 4B(1) Rule 42,43,17(5)
            adjustments = StockAdjustment.objects.filter(
                outlet__gstin=self.gstin,
                status='APPROVED',
                effective_date__month=month,
                effective_date__year=year,
                gstr_reason_code='SECTION_17_5_H'
            )
            for adj in adjustments:
                allocs = adj.allocations.aggregate(
                    sum_igst=Sum('reversed_igst_amount'),
                    sum_cgst=Sum('reversed_cgst_amount'),
                    sum_sgst=Sum('reversed_sgst_amount'),
                    sum_cess=Sum('reversed_cess_amount')
                )
                rev_17_5["iamt"] += float(allocs['sum_igst'] or 0)
                rev_17_5["camt"] += float(allocs['sum_cgst'] or 0)
                rev_17_5["samt"] += float(allocs['sum_sgst'] or 0)
                rev_17_5["csamt"] += float(allocs['sum_cess'] or 0)
    
            # Phase A2: Rule 37 Reversals -> 4B(2) Others
            # Reversals due
            rule37_reversals = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                action_type='REVERSAL_DUE',
                calculation_date__month=month,
                calculation_date__year=year
            )
            for adj in rule37_reversals:
                rev_others["iamt"] += float(adj.reversed_igst)
                rev_others["camt"] += float(adj.reversed_cgst)
                rev_others["samt"] += float(adj.reversed_sgst)
                rev_others["csamt"] += float(adj.reversed_cess)
    
            # Reclaims
            rule37_reclaims = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                reclaim_period=self.period
            )
            itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
            for adj in rule37_reclaims:
                ig = float(adj.reclaimed_igst or 0)
                cg = float(adj.reclaimed_cgst or 0)
                sg = float(adj.reclaimed_sgst or 0)
                cs = float(adj.reversed_cess or 0) # cess might not be reclaimed explicitly, keep 0 or reversed
    
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
    
        # Build final structures
        itc_avl_list = [
            {"ty": "Import of Goods", "iamt": itc_import_goods["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_goods["csamt"]},
            {"ty": "Import of Services", "iamt": itc_import_services["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_services["csamt"]},
            {"ty": "Inward supplies liable to reverse charge", **itc_rcm},
            {"ty": "Inward supplies from ISD", **itc_isd},
            {"ty": "All other ITC", **itc_all_other},
        ]
    
        itc_rev_list = [
            {"ty": "Rule 42,43,17(5)", **rev_17_5},
            {"ty": "Others", **rev_others},
        ]
    
        net_iamt = sum(a["iamt"] for a in itc_avl_list) - sum(r["iamt"] for r in itc_rev_list)
        net_camt = sum(a["camt"] for a in itc_avl_list) - sum(r["camt"] for r in itc_rev_list)
        net_samt = sum(a["samt"] for a in itc_avl_list) - sum(r["samt"] for r in itc_rev_list)
        net_csamt = sum(a["csamt"] for a in itc_avl_list) - sum(r["csamt"] for r in itc_rev_list)
    
        itc_net = {
            "iamt": net_iamt,
            "camt": net_camt,
            "samt": net_samt,
            "csamt": net_csamt
        }
    
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
                "itc_avl": [a for a in itc_avl_list if any(v != 0 for k, v in a.items() if k != "ty")],
                "itc_rev": [r for r in itc_rev_list if any(v != 0 for k, v in r.items() if k != "ty")],
                "itc_net": itc_net,
                "itc_inelg": []
            },
            "other_details": [o for o in other_details_list if any(v != 0 for k, v in o.items() if k != "ty")]
        }
    
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/gstr_builders.py:630: ImportError
_____________ GSTR3BAndReconciliationTest.test_tc_3b_13_excess_itc _____________

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_13_excess_itc>

    def test_tc_3b_13_excess_itc(self):
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/tests/test_gstr3b_returns.py:417: ImportError
________ GSTR3BAndReconciliationTest.test_tc_3b_14_liability_shortfall _________

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_14_liability_shortfall>

    def test_tc_3b_14_liability_shortfall(self):
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/tests/test_gstr3b_returns.py:424: ImportError
_________ GSTR3BAndReconciliationTest.test_tc_3b_15_invalid_reversals __________

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_15_invalid_reversals>

    def test_tc_3b_15_invalid_reversals(self):
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/tests/test_gstr3b_returns.py:432: ImportError
__________ GSTR3BAndReconciliationTest.test_tc_3b_16_table_3_2_bounds __________

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_16_table_3_2_bounds>

    def test_tc_3b_16_table_3_2_bounds(self):
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/tests/test_gstr3b_returns.py:439: ImportError
_______ GSTR3BAndReconciliationTest.test_tc_3b_17_deferred_itc_lifecycle _______

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_17_deferred_itc_lifecycle>
mock_fetch = <MagicMock name='fetch_gstr2b_data' id='124475833145088'>

    @patch('apps.reports.gstr2b_service.GSTR2BService.fetch_gstr2b_data')
    def test_tc_3b_17_deferred_itc_lifecycle(self, mock_fetch):
        mock_fetch.return_value = {}
        from apps.reports.models import DeferredITCEntry
        pi = PurchaseInvoice.objects.create(outlet=self.outlet, distributor=self.distributor, invoice_no='MISSING-2B-01', invoice_date=date(2026, 8, 10), subtotal=1000, taxable_amount=1000, gst_amount=180, grand_total=1180)
        pr = GSTTransactionSnapshot.objects.create(
            outlet=self.outlet, gstin=self.outlet.gstin, period=self.period,
            transaction_type='purchase', document_id=pi.id, document_number='MISSING-2B-01',
            document_date=date(2026, 8, 10), snapshot_json={'items_by_rate': {'18.0': {'taxable_amount': 1000, 'igst': 180, 'cgst': 0, 'sgst': 0, 'cess': 0}}}
        )
        service = GSTR2BService(self.outlet, self.period)
        service.reconcile()
    
        deferred = DeferredITCEntry.objects.get(purchase_invoice_id=pr.document_id)
        self.assertEqual(deferred.status, 'DEFERRED')
    
        b = GSTR3BBuilder(gstin=self.outlet.gstin, period=self.period)
>       payload = b.generate_json()
                  ^^^^^^^^^^^^^^^^^

apps/reports/tests/test_gstr3b_returns.py:462: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <apps.reports.gstr_builders.GSTR3BBuilder object at 0x7135ca21cfe0>

    def generate_json(self) -> Dict[str, Any]:
        # Table 3.1
        t31 = {
            "osup_det": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_zero": {"txval": 0.0, "iamt": 0.0, "csamt": 0.0},
            "osup_nil_exmp": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0},
            "isup_rev": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_nongst": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        }
    
        # Table 3.2
        t32_unreg = {}
        t32_comp = {}
        t32_uin = {}
    
        # Table 4 (ITC Available)
        itc_import_goods = {"iamt": 0.0, "csamt": 0.0}
        itc_import_services = {"iamt": 0.0, "csamt": 0.0}
        itc_rcm = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_isd = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_all_other = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        # First, iterate over ALL snapshots for Outward Supplies (Table 3) and RCM Inward liability (3.1.d)
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            is_purchase = snap.transaction_type == 'purchase'
            is_purchase_return = snap.transaction_type == 'purchase_return'
    
            # Treat purchase returns as negative ITC if it's related to purchase
            multiplier = -1 if ('return' in snap.transaction_type) else 1
    
            is_rcm = json_data.get('is_rcm', False)
            is_exempt = json_data.get('is_exempt', False)
            is_b2b = json_data.get('is_b2b', False)
            is_interstate = json_data.get('is_interstate', False)
            pos = json_data.get('pos', '')
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                tx = values['taxable_amount'] * multiplier
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
                is_zero_rated = (rate == '0.0' or rate == '0') and tx > 0 and not is_exempt
    
                if is_purchase or is_purchase_return:
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
                            if pos not in t32_unreg:
                                t32_unreg[pos] = {"txval": 0.0, "iamt": 0.0}
                            t32_unreg[pos]["txval"] += tx
                            t32_unreg[pos]["iamt"] += ig
    
        # Second, iterate over MATCHED 2B records for Table 4(A) ITC Available
        from apps.reports.models import ITCReconciliationResult, DeferredITCEntry
        matched_results = ITCReconciliationResult.objects.filter(
            run__period=self.period,
            match_status='MATCHED',
            purchase_snapshot__in=self.snapshots
        )
    
        for res in matched_results:
            snap = res.purchase_snapshot
            if not snap: continue
            json_data = snap.snapshot_json
            multiplier = -1 if ('return' in snap.transaction_type) else 1
            is_import = json_data.get('is_import', False)
            is_rcm = json_data.get('is_rcm', False)
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
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
        claimed_deferred = DeferredITCEntry.objects.filter(claimed_period=self.period, status='CLAIMED')
        for d in claimed_deferred:
            itc_all_other["iamt"] += float(d.iamt)
            itc_all_other["camt"] += float(d.camt)
            itc_all_other["samt"] += float(d.samt)
            itc_all_other["csamt"] += float(d.csamt)
    
        # ITC Reversals from StockAdjustments (4B)
        from apps.inventory.models import StockAdjustment
        from apps.purchases.models import Rule37Adjustment
        from django.db.models import Sum
    
        rev_17_5 = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(1)
        rev_others = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(2)
        itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        try:
            month = int(self.period[:2])
            year = int(self.period[2:])
    
            # Phase A1: Section 17(5)(h) Physical Inventory Loss -> 4B(1) Rule 42,43,17(5)
            adjustments = StockAdjustment.objects.filter(
                outlet__gstin=self.gstin,
                status='APPROVED',
                effective_date__month=month,
                effective_date__year=year,
                gstr_reason_code='SECTION_17_5_H'
            )
            for adj in adjustments:
                allocs = adj.allocations.aggregate(
                    sum_igst=Sum('reversed_igst_amount'),
                    sum_cgst=Sum('reversed_cgst_amount'),
                    sum_sgst=Sum('reversed_sgst_amount'),
                    sum_cess=Sum('reversed_cess_amount')
                )
                rev_17_5["iamt"] += float(allocs['sum_igst'] or 0)
                rev_17_5["camt"] += float(allocs['sum_cgst'] or 0)
                rev_17_5["samt"] += float(allocs['sum_sgst'] or 0)
                rev_17_5["csamt"] += float(allocs['sum_cess'] or 0)
    
            # Phase A2: Rule 37 Reversals -> 4B(2) Others
            # Reversals due
            rule37_reversals = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                action_type='REVERSAL_DUE',
                calculation_date__month=month,
                calculation_date__year=year
            )
            for adj in rule37_reversals:
                rev_others["iamt"] += float(adj.reversed_igst)
                rev_others["camt"] += float(adj.reversed_cgst)
                rev_others["samt"] += float(adj.reversed_sgst)
                rev_others["csamt"] += float(adj.reversed_cess)
    
            # Reclaims
            rule37_reclaims = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                reclaim_period=self.period
            )
            itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
            for adj in rule37_reclaims:
                ig = float(adj.reclaimed_igst or 0)
                cg = float(adj.reclaimed_cgst or 0)
                sg = float(adj.reclaimed_sgst or 0)
                cs = float(adj.reversed_cess or 0) # cess might not be reclaimed explicitly, keep 0 or reversed
    
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
    
        # Build final structures
        itc_avl_list = [
            {"ty": "Import of Goods", "iamt": itc_import_goods["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_goods["csamt"]},
            {"ty": "Import of Services", "iamt": itc_import_services["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_services["csamt"]},
            {"ty": "Inward supplies liable to reverse charge", **itc_rcm},
            {"ty": "Inward supplies from ISD", **itc_isd},
            {"ty": "All other ITC", **itc_all_other},
        ]
    
        itc_rev_list = [
            {"ty": "Rule 42,43,17(5)", **rev_17_5},
            {"ty": "Others", **rev_others},
        ]
    
        net_iamt = sum(a["iamt"] for a in itc_avl_list) - sum(r["iamt"] for r in itc_rev_list)
        net_camt = sum(a["camt"] for a in itc_avl_list) - sum(r["camt"] for r in itc_rev_list)
        net_samt = sum(a["samt"] for a in itc_avl_list) - sum(r["samt"] for r in itc_rev_list)
        net_csamt = sum(a["csamt"] for a in itc_avl_list) - sum(r["csamt"] for r in itc_rev_list)
    
        itc_net = {
            "iamt": net_iamt,
            "camt": net_camt,
            "samt": net_samt,
            "csamt": net_csamt
        }
    
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
                "itc_avl": [a for a in itc_avl_list if any(v != 0 for k, v in a.items() if k != "ty")],
                "itc_rev": [r for r in itc_rev_list if any(v != 0 for k, v in r.items() if k != "ty")],
                "itc_net": itc_net,
                "itc_inelg": []
            },
            "other_details": [o for o in other_details_list if any(v != 0 for k, v in o.items() if k != "ty")]
        }
    
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/gstr_builders.py:630: ImportError
___________ GSTR3BAndReconciliationTest.test_tc_3b_18_rule37_reclaim ___________

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_18_rule37_reclaim>

    def test_tc_3b_18_rule37_reclaim(self):
        invoice = PurchaseInvoice.objects.create(outlet=self.outlet, distributor=self.distributor, invoice_no='R37-REC-01', invoice_date=date(2026, 2, 1), subtotal=1000, taxable_amount=1000, gst_amount=180, grand_total=1180)
        adj = Rule37Adjustment.objects.create(
            invoice=invoice, action_type='REAVAILMENT_ELIGIBLE', status='APPROVED',
            rule37_due_date=date(2026, 8, 1), days_outstanding_at_evaluation=200,
            invoice_total_at_evaluation=1180, amount_paid_at_evaluation=1180,
            unpaid_amount_at_evaluation=0, unpaid_ratio=0.0,
            reversed_igst=180, reversed_cgst=0, reversed_sgst=0, reversed_cess=0,
            reclaim_period='082026', reclaimed_igst=180
        )
        b = GSTR3BBuilder(gstin=self.outlet.gstin, period='082026')
>       payload = b.generate_json()
                  ^^^^^^^^^^^^^^^^^

apps/reports/tests/test_gstr3b_returns.py:486: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <apps.reports.gstr_builders.GSTR3BBuilder object at 0x7135c9d32450>

    def generate_json(self) -> Dict[str, Any]:
        # Table 3.1
        t31 = {
            "osup_det": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_zero": {"txval": 0.0, "iamt": 0.0, "csamt": 0.0},
            "osup_nil_exmp": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0},
            "isup_rev": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_nongst": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        }
    
        # Table 3.2
        t32_unreg = {}
        t32_comp = {}
        t32_uin = {}
    
        # Table 4 (ITC Available)
        itc_import_goods = {"iamt": 0.0, "csamt": 0.0}
        itc_import_services = {"iamt": 0.0, "csamt": 0.0}
        itc_rcm = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_isd = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_all_other = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        # First, iterate over ALL snapshots for Outward Supplies (Table 3) and RCM Inward liability (3.1.d)
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            is_purchase = snap.transaction_type == 'purchase'
            is_purchase_return = snap.transaction_type == 'purchase_return'
    
            # Treat purchase returns as negative ITC if it's related to purchase
            multiplier = -1 if ('return' in snap.transaction_type) else 1
    
            is_rcm = json_data.get('is_rcm', False)
            is_exempt = json_data.get('is_exempt', False)
            is_b2b = json_data.get('is_b2b', False)
            is_interstate = json_data.get('is_interstate', False)
            pos = json_data.get('pos', '')
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                tx = values['taxable_amount'] * multiplier
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
                is_zero_rated = (rate == '0.0' or rate == '0') and tx > 0 and not is_exempt
    
                if is_purchase or is_purchase_return:
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
                            if pos not in t32_unreg:
                                t32_unreg[pos] = {"txval": 0.0, "iamt": 0.0}
                            t32_unreg[pos]["txval"] += tx
                            t32_unreg[pos]["iamt"] += ig
    
        # Second, iterate over MATCHED 2B records for Table 4(A) ITC Available
        from apps.reports.models import ITCReconciliationResult, DeferredITCEntry
        matched_results = ITCReconciliationResult.objects.filter(
            run__period=self.period,
            match_status='MATCHED',
            purchase_snapshot__in=self.snapshots
        )
    
        for res in matched_results:
            snap = res.purchase_snapshot
            if not snap: continue
            json_data = snap.snapshot_json
            multiplier = -1 if ('return' in snap.transaction_type) else 1
            is_import = json_data.get('is_import', False)
            is_rcm = json_data.get('is_rcm', False)
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
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
        claimed_deferred = DeferredITCEntry.objects.filter(claimed_period=self.period, status='CLAIMED')
        for d in claimed_deferred:
            itc_all_other["iamt"] += float(d.iamt)
            itc_all_other["camt"] += float(d.camt)
            itc_all_other["samt"] += float(d.samt)
            itc_all_other["csamt"] += float(d.csamt)
    
        # ITC Reversals from StockAdjustments (4B)
        from apps.inventory.models import StockAdjustment
        from apps.purchases.models import Rule37Adjustment
        from django.db.models import Sum
    
        rev_17_5 = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(1)
        rev_others = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(2)
        itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        try:
            month = int(self.period[:2])
            year = int(self.period[2:])
    
            # Phase A1: Section 17(5)(h) Physical Inventory Loss -> 4B(1) Rule 42,43,17(5)
            adjustments = StockAdjustment.objects.filter(
                outlet__gstin=self.gstin,
                status='APPROVED',
                effective_date__month=month,
                effective_date__year=year,
                gstr_reason_code='SECTION_17_5_H'
            )
            for adj in adjustments:
                allocs = adj.allocations.aggregate(
                    sum_igst=Sum('reversed_igst_amount'),
                    sum_cgst=Sum('reversed_cgst_amount'),
                    sum_sgst=Sum('reversed_sgst_amount'),
                    sum_cess=Sum('reversed_cess_amount')
                )
                rev_17_5["iamt"] += float(allocs['sum_igst'] or 0)
                rev_17_5["camt"] += float(allocs['sum_cgst'] or 0)
                rev_17_5["samt"] += float(allocs['sum_sgst'] or 0)
                rev_17_5["csamt"] += float(allocs['sum_cess'] or 0)
    
            # Phase A2: Rule 37 Reversals -> 4B(2) Others
            # Reversals due
            rule37_reversals = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                action_type='REVERSAL_DUE',
                calculation_date__month=month,
                calculation_date__year=year
            )
            for adj in rule37_reversals:
                rev_others["iamt"] += float(adj.reversed_igst)
                rev_others["camt"] += float(adj.reversed_cgst)
                rev_others["samt"] += float(adj.reversed_sgst)
                rev_others["csamt"] += float(adj.reversed_cess)
    
            # Reclaims
            rule37_reclaims = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                reclaim_period=self.period
            )
            itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
            for adj in rule37_reclaims:
                ig = float(adj.reclaimed_igst or 0)
                cg = float(adj.reclaimed_cgst or 0)
                sg = float(adj.reclaimed_sgst or 0)
                cs = float(adj.reversed_cess or 0) # cess might not be reclaimed explicitly, keep 0 or reversed
    
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
    
        # Build final structures
        itc_avl_list = [
            {"ty": "Import of Goods", "iamt": itc_import_goods["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_goods["csamt"]},
            {"ty": "Import of Services", "iamt": itc_import_services["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_services["csamt"]},
            {"ty": "Inward supplies liable to reverse charge", **itc_rcm},
            {"ty": "Inward supplies from ISD", **itc_isd},
            {"ty": "All other ITC", **itc_all_other},
        ]
    
        itc_rev_list = [
            {"ty": "Rule 42,43,17(5)", **rev_17_5},
            {"ty": "Others", **rev_others},
        ]
    
        net_iamt = sum(a["iamt"] for a in itc_avl_list) - sum(r["iamt"] for r in itc_rev_list)
        net_camt = sum(a["camt"] for a in itc_avl_list) - sum(r["camt"] for r in itc_rev_list)
        net_samt = sum(a["samt"] for a in itc_avl_list) - sum(r["samt"] for r in itc_rev_list)
        net_csamt = sum(a["csamt"] for a in itc_avl_list) - sum(r["csamt"] for r in itc_rev_list)
    
        itc_net = {
            "iamt": net_iamt,
            "camt": net_camt,
            "samt": net_samt,
            "csamt": net_csamt
        }
    
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
                "itc_avl": [a for a in itc_avl_list if any(v != 0 for k, v in a.items() if k != "ty")],
                "itc_rev": [r for r in itc_rev_list if any(v != 0 for k, v in r.items() if k != "ty")],
                "itc_net": itc_net,
                "itc_inelg": []
            },
            "other_details": [o for o in other_details_list if any(v != 0 for k, v in o.items() if k != "ty")]
        }
    
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/gstr_builders.py:630: ImportError
_____ GSTR3BAndReconciliationTest.test_tc_3b_21_val_008_blocking_override ______

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_3b_21_val_008_blocking_override>

    def test_tc_3b_21_val_008_blocking_override(self):
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/tests/test_gstr3b_returns.py:539: ImportError
___________ GSTR3BAndReconciliationTest.test_tc_99_generate_ca_json ____________

self = <apps.reports.tests.test_gstr3b_returns.GSTR3BAndReconciliationTest testMethod=test_tc_99_generate_ca_json>
mock_fetch = <MagicMock name='fetch_gstr2b_data' id='124475823827968'>

    @patch('apps.reports.gstr2b_service.GSTR2BService.fetch_gstr2b_data')
    def test_tc_99_generate_ca_json(self, mock_fetch):
        mock_fetch.return_value = {
            'b2b': [{'ctin': '27BBBBB1234B1Z5', 'supf': 'Active', 'inv': [{'inum': 'PINV-01', 'dt': '01-08-2026', 'itms': [{'itm_det': {'txval': 10000.0, 'iamt': 0, 'camt': 900.0, 'samt': 900.0}}]}]}]
        }
        pi1 = PurchaseInvoice.objects.create(outlet=self.outlet, distributor=self.distributor, invoice_no='PINV-01', invoice_date=date(2026, 8, 1), subtotal=10000, taxable_amount=10000, gst_amount=1800, grand_total=11800)
        pr1 = GSTTransactionSnapshot.objects.create(outlet=self.outlet, gstin=self.outlet.gstin, period=self.period, transaction_type='purchase', document_id=pi1.id, document_number='PINV-01', document_date=date(2026, 8, 1), snapshot_json={'is_b2b': True, 'distributor_gstin': '27BBBBB1234B1Z5', 'items_by_rate': {'18.0': {'taxable_amount': 10000.0, 'igst': 0, 'cgst': 900.0, 'sgst': 900.0, 'cess': 0}}})
    
        pi2 = PurchaseInvoice.objects.create(outlet=self.outlet, distributor=self.distributor, invoice_no='PINV-02', invoice_date=date(2026, 8, 10), subtotal=5000, taxable_amount=5000, gst_amount=900, grand_total=5900)
        pr2 = GSTTransactionSnapshot.objects.create(outlet=self.outlet, gstin=self.outlet.gstin, period=self.period, transaction_type='purchase', document_id=pi2.id, document_number='PINV-02', document_date=date(2026, 8, 10), snapshot_json={'is_b2b': True, 'distributor_gstin': '27BBBBB1234B1Z5', 'items_by_rate': {'18.0': {'taxable_amount': 5000.0, 'igst': 0, 'cgst': 450.0, 'sgst': 450.0, 'cess': 0}}})
    
        pi3 = PurchaseInvoice.objects.create(outlet=self.outlet, distributor=self.distributor, invoice_no='R37-01', invoice_date=date(2026, 2, 1), subtotal=2000, taxable_amount=2000, gst_amount=360, grand_total=2360)
        Rule37Adjustment.objects.create(invoice=pi3, action_type='REAVAILMENT_ELIGIBLE', status='APPROVED', rule37_due_date=date(2026, 8, 1), days_outstanding_at_evaluation=200, invoice_total_at_evaluation=2360, amount_paid_at_evaluation=2360, unpaid_amount_at_evaluation=0, unpaid_ratio=0.0, reversed_igst=0, reversed_cgst=180, reversed_sgst=180, reversed_cess=0, reclaim_period='082026', reclaimed_cgst=180, reclaimed_sgst=180)
    
        pr_out = GSTTransactionSnapshot.objects.create(outlet=self.outlet, gstin=self.outlet.gstin, period=self.period, transaction_type='sale', document_id=uuid.uuid4(), document_number='SINV-01', document_date=date(2026, 8, 5), snapshot_json={'is_b2b': True, 'is_interstate': True, 'items_by_rate': {'18.0': {'taxable_amount': 20000.0, 'igst': 3600.0, 'cgst': 0, 'sgst': 0, 'cess': 0}}})
    
        service = GSTR2BService(self.outlet, self.period)
        service.reconcile()
    
        b = GSTR3BBuilder(gstin=self.outlet.gstin, period=self.period)
>       payload = b.generate_json()
                  ^^^^^^^^^^^^^^^^^

apps/reports/tests/test_gstr3b_returns.py:570: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <apps.reports.gstr_builders.GSTR3BBuilder object at 0x7135c9d327b0>

    def generate_json(self) -> Dict[str, Any]:
        # Table 3.1
        t31 = {
            "osup_det": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_zero": {"txval": 0.0, "iamt": 0.0, "csamt": 0.0},
            "osup_nil_exmp": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0},
            "isup_rev": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0},
            "osup_nongst": {"txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        }
    
        # Table 3.2
        t32_unreg = {}
        t32_comp = {}
        t32_uin = {}
    
        # Table 4 (ITC Available)
        itc_import_goods = {"iamt": 0.0, "csamt": 0.0}
        itc_import_services = {"iamt": 0.0, "csamt": 0.0}
        itc_rcm = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_isd = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
        itc_all_other = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        # First, iterate over ALL snapshots for Outward Supplies (Table 3) and RCM Inward liability (3.1.d)
        for snap in self.snapshots:
            json_data = snap.snapshot_json
            is_purchase = snap.transaction_type == 'purchase'
            is_purchase_return = snap.transaction_type == 'purchase_return'
    
            # Treat purchase returns as negative ITC if it's related to purchase
            multiplier = -1 if ('return' in snap.transaction_type) else 1
    
            is_rcm = json_data.get('is_rcm', False)
            is_exempt = json_data.get('is_exempt', False)
            is_b2b = json_data.get('is_b2b', False)
            is_interstate = json_data.get('is_interstate', False)
            pos = json_data.get('pos', '')
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                tx = values['taxable_amount'] * multiplier
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
                is_zero_rated = (rate == '0.0' or rate == '0') and tx > 0 and not is_exempt
    
                if is_purchase or is_purchase_return:
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
                            if pos not in t32_unreg:
                                t32_unreg[pos] = {"txval": 0.0, "iamt": 0.0}
                            t32_unreg[pos]["txval"] += tx
                            t32_unreg[pos]["iamt"] += ig
    
        # Second, iterate over MATCHED 2B records for Table 4(A) ITC Available
        from apps.reports.models import ITCReconciliationResult, DeferredITCEntry
        matched_results = ITCReconciliationResult.objects.filter(
            run__period=self.period,
            match_status='MATCHED',
            purchase_snapshot__in=self.snapshots
        )
    
        for res in matched_results:
            snap = res.purchase_snapshot
            if not snap: continue
            json_data = snap.snapshot_json
            multiplier = -1 if ('return' in snap.transaction_type) else 1
            is_import = json_data.get('is_import', False)
            is_rcm = json_data.get('is_rcm', False)
    
            for rate, values in json_data.get('items_by_rate', {}).items():
                ig = values['igst'] * multiplier
                cg = values['cgst'] * multiplier
                sg = values['sgst'] * multiplier
                cs = values['cess'] * multiplier
    
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
        claimed_deferred = DeferredITCEntry.objects.filter(claimed_period=self.period, status='CLAIMED')
        for d in claimed_deferred:
            itc_all_other["iamt"] += float(d.iamt)
            itc_all_other["camt"] += float(d.camt)
            itc_all_other["samt"] += float(d.samt)
            itc_all_other["csamt"] += float(d.csamt)
    
        # ITC Reversals from StockAdjustments (4B)
        from apps.inventory.models import StockAdjustment
        from apps.purchases.models import Rule37Adjustment
        from django.db.models import Sum
    
        rev_17_5 = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(1)
        rev_others = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0} # 4B(2)
        itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
    
        try:
            month = int(self.period[:2])
            year = int(self.period[2:])
    
            # Phase A1: Section 17(5)(h) Physical Inventory Loss -> 4B(1) Rule 42,43,17(5)
            adjustments = StockAdjustment.objects.filter(
                outlet__gstin=self.gstin,
                status='APPROVED',
                effective_date__month=month,
                effective_date__year=year,
                gstr_reason_code='SECTION_17_5_H'
            )
            for adj in adjustments:
                allocs = adj.allocations.aggregate(
                    sum_igst=Sum('reversed_igst_amount'),
                    sum_cgst=Sum('reversed_cgst_amount'),
                    sum_sgst=Sum('reversed_sgst_amount'),
                    sum_cess=Sum('reversed_cess_amount')
                )
                rev_17_5["iamt"] += float(allocs['sum_igst'] or 0)
                rev_17_5["camt"] += float(allocs['sum_cgst'] or 0)
                rev_17_5["samt"] += float(allocs['sum_sgst'] or 0)
                rev_17_5["csamt"] += float(allocs['sum_cess'] or 0)
    
            # Phase A2: Rule 37 Reversals -> 4B(2) Others
            # Reversals due
            rule37_reversals = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                action_type='REVERSAL_DUE',
                calculation_date__month=month,
                calculation_date__year=year
            )
            for adj in rule37_reversals:
                rev_others["iamt"] += float(adj.reversed_igst)
                rev_others["camt"] += float(adj.reversed_cgst)
                rev_others["samt"] += float(adj.reversed_sgst)
                rev_others["csamt"] += float(adj.reversed_cess)
    
            # Reclaims
            rule37_reclaims = Rule37Adjustment.objects.filter(
                invoice__outlet__gstin=self.gstin,
                status='APPROVED',
                reclaim_period=self.period
            )
            itc_reclaimed = {"iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0}
            for adj in rule37_reclaims:
                ig = float(adj.reclaimed_igst or 0)
                cg = float(adj.reclaimed_cgst or 0)
                sg = float(adj.reclaimed_sgst or 0)
                cs = float(adj.reversed_cess or 0) # cess might not be reclaimed explicitly, keep 0 or reversed
    
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
    
        # Build final structures
        itc_avl_list = [
            {"ty": "Import of Goods", "iamt": itc_import_goods["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_goods["csamt"]},
            {"ty": "Import of Services", "iamt": itc_import_services["iamt"], "camt": 0, "samt": 0, "csamt": itc_import_services["csamt"]},
            {"ty": "Inward supplies liable to reverse charge", **itc_rcm},
            {"ty": "Inward supplies from ISD", **itc_isd},
            {"ty": "All other ITC", **itc_all_other},
        ]
    
        itc_rev_list = [
            {"ty": "Rule 42,43,17(5)", **rev_17_5},
            {"ty": "Others", **rev_others},
        ]
    
        net_iamt = sum(a["iamt"] for a in itc_avl_list) - sum(r["iamt"] for r in itc_rev_list)
        net_camt = sum(a["camt"] for a in itc_avl_list) - sum(r["camt"] for r in itc_rev_list)
        net_samt = sum(a["samt"] for a in itc_avl_list) - sum(r["samt"] for r in itc_rev_list)
        net_csamt = sum(a["csamt"] for a in itc_avl_list) - sum(r["csamt"] for r in itc_rev_list)
    
        itc_net = {
            "iamt": net_iamt,
            "camt": net_camt,
            "samt": net_samt,
            "csamt": net_csamt
        }
    
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
                "itc_avl": [a for a in itc_avl_list if any(v != 0 for k, v in a.items() if k != "ty")],
                "itc_rev": [r for r in itc_rev_list if any(v != 0 for k, v in r.items() if k != "ty")],
                "itc_net": itc_net,
                "itc_inelg": []
            },
            "other_details": [o for o in other_details_list if any(v != 0 for k, v in o.items() if k != "ty")]
        }
    
>       from apps.reports.validators import GSTR3BValidator
E       ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)

apps/reports/gstr_builders.py:630: ImportError
_____________________ GSTRBuildersTests.test_gstr1_builder _____________________

self = <apps.reports.tests.test_gstr_builders.GSTRBuildersTests testMethod=test_gstr1_builder>

    def setUp(self):
>       call_command('seed_local_gst_test_data', reset=True, seed=42)

apps/reports/tests/test_gstr_builders.py:11: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
venv/lib/python3.12/site-packages/django/core/management/__init__.py:194: in call_command
    return command.execute(*args, **defaults)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/core/management/base.py:459: in execute
    output = self.handle(*args, **options)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seed_local_gst_test_data.py:23: in handle
    run_seeder(size=size, hard_reset=False, random_seed=seed)
apps/core/management/commands/seeder.py:341: in run_seeder
    batches = seed_purchases(outlets, distributors, products, num_purchases=n_pur)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seeder.py:179: in seed_purchases
    PurchaseItem.objects.create(
venv/lib/python3.12/site-packages/django/db/models/manager.py:87: in manager_method
    return getattr(self.get_queryset(), name)(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/db/models/query.py:677: in create
    obj = self.model(**kwargs)
          ^^^^^^^^^^^^^^^^^^^^
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <PurchaseItem: SEED-Azithromycin 250mg - SEED-B-762e34-0-0>, args = ()
kwargs = {'sale_rate': Decimal('120.00')}

    def __init__(self, *args, **kwargs):
        # Alias some things as locals to avoid repeat global lookups
        cls = self.__class__
        opts = self._meta
        _setattr = setattr
        _DEFERRED = DEFERRED
        if opts.abstract:
            raise TypeError("Abstract models cannot be instantiated.")
    
        pre_init.send(sender=cls, args=args, kwargs=kwargs)
    
        # Set up the storage for instance state
        self._state = ModelState()
    
        # There is a rather weird disparity here; if kwargs, it's set, then args
        # overrides it. It should be one or the other; don't duplicate the work
        # The reason for the kwargs check is that standard iterator passes in by
        # args, and instantiation for iteration is 33% faster.
        if len(args) > len(opts.concrete_fields):
            # Daft, but matches old exception sans the err msg.
            raise IndexError("Number of args exceeds number of fields")
    
        if not kwargs:
            fields_iter = iter(opts.concrete_fields)
            # The ordering of the zip calls matter - zip throws StopIteration
            # when an iter throws it. So if the first iter throws it, the second
            # is *not* consumed. We rely on this, so don't change the order
            # without changing the logic.
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
        else:
            # Slower, kwargs-ready version.
            fields_iter = iter(opts.fields)
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
                if kwargs.pop(field.name, NOT_PROVIDED) is not NOT_PROVIDED:
                    raise TypeError(
                        f"{cls.__qualname__}() got both positional and "
                        f"keyword arguments for field '{field.name}'."
                    )
    
        # Now we're left with the unprocessed fields that *must* come from
        # keywords, or default.
    
        for field in fields_iter:
            is_related_object = False
            # Virtual field
            if field.attname not in kwargs and field.column is None or field.generated:
                continue
            if kwargs:
                if isinstance(field.remote_field, ForeignObjectRel):
                    try:
                        # Assume object instance was passed in.
                        rel_obj = kwargs.pop(field.name)
                        is_related_object = True
                    except KeyError:
                        try:
                            # Object instance wasn't passed in -- must be an ID.
                            val = kwargs.pop(field.attname)
                        except KeyError:
                            val = field.get_default()
                else:
                    try:
                        val = kwargs.pop(field.attname)
                    except KeyError:
                        # This is done with an exception rather than the
                        # default argument on pop because we don't want
                        # get_default() to be evaluated, and then not used.
                        # Refs #12057.
                        val = field.get_default()
            else:
                val = field.get_default()
    
            if is_related_object:
                # If we are passed a related instance, set it using the
                # field.name instead of field.attname (e.g. "user" instead of
                # "user_id") so that the object gets properly cached (and type
                # checked) by the RelatedObjectDescriptor.
                if rel_obj is not _DEFERRED:
                    _setattr(self, field.name, rel_obj)
            else:
                if val is not _DEFERRED:
                    _setattr(self, field.attname, val)
    
        if kwargs:
            property_names = opts._property_names
            unexpected = ()
            for prop, value in kwargs.items():
                # Any remaining kwargs must correspond to properties or virtual
                # fields.
                if prop in property_names:
                    if value is not _DEFERRED:
                        _setattr(self, prop, value)
                else:
                    try:
                        opts.get_field(prop)
                    except FieldDoesNotExist:
                        unexpected += (prop,)
                    else:
                        if value is not _DEFERRED:
                            _setattr(self, prop, value)
            if unexpected:
                unexpected_names = ", ".join(repr(n) for n in unexpected)
>               raise TypeError(
                    f"{cls.__name__}() got unexpected keyword arguments: "
                    f"{unexpected_names}"
                )
E               TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'

venv/lib/python3.12/site-packages/django/db/models/base.py:567: TypeError
----------------------------- Captured stdout call -----------------------------
Performing safe reset of SEEDED local data...
Performing targeted reset of seeded data (PREFIX: SEED-)...
Seeding master data...
Seeding purchases and inventory...
____________________ GSTRBuildersTests.test_gstr3b_builder _____________________

self = <apps.reports.tests.test_gstr_builders.GSTRBuildersTests testMethod=test_gstr3b_builder>

    def setUp(self):
>       call_command('seed_local_gst_test_data', reset=True, seed=42)

apps/reports/tests/test_gstr_builders.py:11: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
venv/lib/python3.12/site-packages/django/core/management/__init__.py:194: in call_command
    return command.execute(*args, **defaults)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/core/management/base.py:459: in execute
    output = self.handle(*args, **options)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seed_local_gst_test_data.py:23: in handle
    run_seeder(size=size, hard_reset=False, random_seed=seed)
apps/core/management/commands/seeder.py:341: in run_seeder
    batches = seed_purchases(outlets, distributors, products, num_purchases=n_pur)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seeder.py:179: in seed_purchases
    PurchaseItem.objects.create(
venv/lib/python3.12/site-packages/django/db/models/manager.py:87: in manager_method
    return getattr(self.get_queryset(), name)(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/db/models/query.py:677: in create
    obj = self.model(**kwargs)
          ^^^^^^^^^^^^^^^^^^^^
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <PurchaseItem: SEED-Azithromycin 250mg - SEED-B-60e828-0-0>, args = ()
kwargs = {'sale_rate': Decimal('120.00')}

    def __init__(self, *args, **kwargs):
        # Alias some things as locals to avoid repeat global lookups
        cls = self.__class__
        opts = self._meta
        _setattr = setattr
        _DEFERRED = DEFERRED
        if opts.abstract:
            raise TypeError("Abstract models cannot be instantiated.")
    
        pre_init.send(sender=cls, args=args, kwargs=kwargs)
    
        # Set up the storage for instance state
        self._state = ModelState()
    
        # There is a rather weird disparity here; if kwargs, it's set, then args
        # overrides it. It should be one or the other; don't duplicate the work
        # The reason for the kwargs check is that standard iterator passes in by
        # args, and instantiation for iteration is 33% faster.
        if len(args) > len(opts.concrete_fields):
            # Daft, but matches old exception sans the err msg.
            raise IndexError("Number of args exceeds number of fields")
    
        if not kwargs:
            fields_iter = iter(opts.concrete_fields)
            # The ordering of the zip calls matter - zip throws StopIteration
            # when an iter throws it. So if the first iter throws it, the second
            # is *not* consumed. We rely on this, so don't change the order
            # without changing the logic.
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
        else:
            # Slower, kwargs-ready version.
            fields_iter = iter(opts.fields)
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
                if kwargs.pop(field.name, NOT_PROVIDED) is not NOT_PROVIDED:
                    raise TypeError(
                        f"{cls.__qualname__}() got both positional and "
                        f"keyword arguments for field '{field.name}'."
                    )
    
        # Now we're left with the unprocessed fields that *must* come from
        # keywords, or default.
    
        for field in fields_iter:
            is_related_object = False
            # Virtual field
            if field.attname not in kwargs and field.column is None or field.generated:
                continue
            if kwargs:
                if isinstance(field.remote_field, ForeignObjectRel):
                    try:
                        # Assume object instance was passed in.
                        rel_obj = kwargs.pop(field.name)
                        is_related_object = True
                    except KeyError:
                        try:
                            # Object instance wasn't passed in -- must be an ID.
                            val = kwargs.pop(field.attname)
                        except KeyError:
                            val = field.get_default()
                else:
                    try:
                        val = kwargs.pop(field.attname)
                    except KeyError:
                        # This is done with an exception rather than the
                        # default argument on pop because we don't want
                        # get_default() to be evaluated, and then not used.
                        # Refs #12057.
                        val = field.get_default()
            else:
                val = field.get_default()
    
            if is_related_object:
                # If we are passed a related instance, set it using the
                # field.name instead of field.attname (e.g. "user" instead of
                # "user_id") so that the object gets properly cached (and type
                # checked) by the RelatedObjectDescriptor.
                if rel_obj is not _DEFERRED:
                    _setattr(self, field.name, rel_obj)
            else:
                if val is not _DEFERRED:
                    _setattr(self, field.attname, val)
    
        if kwargs:
            property_names = opts._property_names
            unexpected = ()
            for prop, value in kwargs.items():
                # Any remaining kwargs must correspond to properties or virtual
                # fields.
                if prop in property_names:
                    if value is not _DEFERRED:
                        _setattr(self, prop, value)
                else:
                    try:
                        opts.get_field(prop)
                    except FieldDoesNotExist:
                        unexpected += (prop,)
                    else:
                        if value is not _DEFERRED:
                            _setattr(self, prop, value)
            if unexpected:
                unexpected_names = ", ".join(repr(n) for n in unexpected)
>               raise TypeError(
                    f"{cls.__name__}() got unexpected keyword arguments: "
                    f"{unexpected_names}"
                )
E               TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'

venv/lib/python3.12/site-packages/django/db/models/base.py:567: TypeError
----------------------------- Captured stdout call -----------------------------
Performing safe reset of SEEDED local data...
Performing targeted reset of seeded data (PREFIX: SEED-)...
Seeding master data...
Seeding purchases and inventory...
_ GSTR1BuilderNotesTestCase.test_original_document_traceability_and_manual_override _

self = <apps.reports.tests.test_gstr_returns.GSTR1BuilderNotesTestCase testMethod=test_original_document_traceability_and_manual_override>

    def test_original_document_traceability_and_manual_override(self):
        # Create standalone return (manual override)
        payload_override = {
            'returnDate': date.today().isoformat() + "T00:00:00Z",
            'overrideReason': 'Manual adjustment for old invoice',
            'items': [{
                'batchId': str(self.batch.id),
                'qtyReturned': 1,
                'returnRate': 100
            }]
        }
        ret_override = create_sales_return(payload_override, str(self.outlet.id), str(self.staff.id))
        snap = create_sales_return_snapshots(ret_override)
    
        json_data = snap.snapshot_json
        self.assertTrue(json_data['manual_override'])
        self.assertFalse(json_data['verified_link'])
        self.assertEqual(json_data['reason'], 'Manual adjustment for old invoice')
    
        # Verify GSTR1Builder outputs warning
        builder = GSTR1Builder(self.outlet.gstin, date.today().strftime('%m%Y'))
        res = builder.generate_json()
        info_list = res.get('_metadata', {}).get('info', [])
>       self.assertTrue(any('PROC-002' == i.get('code') for i in info_list))
E       AssertionError: False is not true

apps/reports/tests/test_gstr_returns.py:172: AssertionError
____________ OOXMLIntegrityTestCase.test_advanced_sample_integrity _____________

self = <apps.reports.tests.test_ooxml_integrity.OOXMLIntegrityTestCase testMethod=test_advanced_sample_integrity>
mock_generate_json = <MagicMock name='generate_json' id='124475829552384'>
mock_outlet_first = <MagicMock name='first' id='124475822111776'>
mock_audit_create = <MagicMock name='create' id='124475822109424'>

    @patch('apps.reports.exports.gstr1_excel.GSTExportAudit.objects.create')
    @patch('apps.reports.exports.gstr1_excel.Outlet.objects.first')
    @patch('apps.reports.exports.gstr1_excel.GSTR1Builder.generate_json')
    def test_advanced_sample_integrity(self, mock_generate_json, mock_outlet_first, mock_audit_create):
        mock_outlet_first.return_value = Outlet(name="Test", gstin="27AADCB2230M1Z2")
        mock_generate_json.return_value = {
            'b2b': [{'ctin': '27BBBBBBBBBBBBB', 'inv': [{'inum': 'INV-ADV-01', 'idt': '10-10-2026', 'val': 5000.0, 'pos': '27', 'inv_typ': 'R', 'itms': [{'itm_det': {'rt': 18.0, 'txval': 5000.0}}]}]}],
            'b2cs': [{'typ': 'OE', 'pos': '27', 'rt': 18.0, 'txval': 1500.0}],
            'b2cl': [{'pos': '27', 'inv': [{'inum': 'INV-ADV-02', 'idt': '10-10-2026', 'val': 354000.0, 'itms': [{'itm_det': {'rt': 18.0, 'txval': 300000.0}}]}]}],
            'cdnr': [{'ctin': '27BBBBBBBBBBBBB', 'nt': [{'nt_num': 'CRN-ADV-01', 'nt_dt': '11-10-2026', 'nt_ty': 'C', 'p_gst': 'N', 'val': 1180.0, 'itms': [{'itm_det': {'rt': 18.0, 'txval': 1000.0}}]}]}],
            'cdnur': [],
            'hsn': {
                'b2b': {'data': [{'hsn_sc': '84713010', 'desc': 'Personal computers', 'uqc': 'NOS', 'qty': 10.0, 'val': 5900.0, 'rt': 18.0, 'txval': 5000.0, 'iamt': 0, 'camt': 450.0, 'samt': 450.0, 'csamt': 0}]},
                'b2c': {'data': [{'hsn_sc': '84713010', 'desc': 'Personal computers', 'uqc': 'NOS', 'qty': 10.0, 'val': 355770.0, 'rt': 18.0, 'txval': 301500.0, 'iamt': 54270.0, 'camt': 0, 'samt': 0, 'csamt': 0}]}
            }
        }
        period = '102026'
        request = self.factory.get(f'/api/v1/gst/export/{period}/gstr1_excel/')
        request.user = self.user
    
        with patch('rest_framework.request.Request.user', new_callable=lambda: self.user):
            response = self.view(request, fp=period)
    
>       self.assertEqual(response.status_code, 200)
E       AssertionError: 422 != 200

apps/reports/tests/test_ooxml_integrity.py:71: AssertionError
----------------------------- Captured stdout call -----------------------------
DEBUG PAYLOAD: {'b2b': [{'ctin': '27BBBBBBBBBBBBB', 'inv': [{'inum': 'INV-ADV-01', 'idt': '10-10-2026', 'val': 5000.0, 'pos': '27', 'inv_typ': 'R', 'itms': [{'itm_det': {'rt': 18.0, 'txval': 5000.0}}]}]}], 'b2cs': [{'typ': 'OE', 'pos': '27', 'rt': 18.0, 'txval': 1500.0}], 'b2cl': [{'pos': '27', 'inv': [{'inum': 'INV-ADV-02', 'idt': '10-10-2026', 'val': 354000.0, 'itms': [{'itm_det': {'rt': 18.0, 'txval': 300000.0}}]}]}], 'cdnr': [{'ctin': '27BBBBBBBBBBBBB', 'nt': [{'nt_num': 'CRN-ADV-01', 'nt_dt': '11-10-2026', 'nt_ty': 'C', 'p_gst': 'N', 'val': 1180.0, 'itms': [{'itm_det': {'rt': 18.0, 'txval': 1000.0}}]}]}], 'cdnur': [], 'hsn': {'b2b': {'data': [{'hsn_sc': '84713010', 'desc': 'Personal computers', 'uqc': 'NOS', 'qty': 10.0, 'val': 5900.0, 'rt': 18.0, 'txval': 5000.0, 'iamt': 0, 'camt': 450.0, 'samt': 450.0, 'csamt': 0}]}, 'b2c': {'data': [{'hsn_sc': '84713010', 'desc': 'Personal computers', 'uqc': 'NOS', 'qty': 10.0, 'val': 355770.0, 'rt': 18.0, 'txval': 301500.0, 'iamt': 54270.0, 'camt': 0, 'samt': 0, 'csamt': 0}]}}}
DATA MAP: {'b2b,sez,de': [{'start_row': 5, 'rows': [{1: '27BBBBBBBBBBBBB', 2: '', 3: 'INV-ADV-01', 4: '10-10-2026', 5: Decimal('5000.0'), 6: '27', 7: 'N', 8: 'R', 9: '', 10: Decimal('18.0'), 11: Decimal('5000.0'), 12: ''}]}], 'b2cs': [{'start_row': 5, 'rows': [{1: 'OE', 2: '27', 3: Decimal('18.0'), 4: Decimal('1500.0'), 5: '', 6: ''}]}], 'b2cl': [{'start_row': 5, 'rows': [{1: 'INV-ADV-02', 2: '10-10-2026', 3: Decimal('354000.0'), 4: '27', 5: Decimal('18.0'), 6: Decimal('300000.0'), 7: '', 8: ''}]}], 'cdnr': [{'start_row': 5, 'rows': [{1: '27BBBBBBBBBBBBB', 2: '', 3: 'CRN-ADV-01', 4: '11-10-2026', 5: 'C', 6: '27', 7: 'N', 8: 'Regular', 9: Decimal('1180.0'), 10: Decimal('18.0'), 11: Decimal('1000.0'), 12: ''}]}], 'hsn(b2b)': [{'start_row': 5, 'rows': [{1: '84713010', 2: 'Personal computers', 3: 'NOS', 4: Decimal('10.0'), 5: Decimal('5900.0'), 6: Decimal('18.0'), 7: Decimal('5000.0'), 8: None, 9: Decimal('450.0'), 10: Decimal('450.0'), 11: None}]}], 'hsn(b2c)': [{'start_row': 5, 'rows': [{1: '84713010', 2: 'Personal computers', 3: 'NOS', 4: Decimal('10.0'), 5: Decimal('355770.0'), 6: Decimal('18.0'), 7: Decimal('301500.0'), 8: Decimal('54270.0'), 9: None, 10: None, 11: None}]}]}
______________ OOXMLIntegrityTestCase.test_clean_sample_integrity ______________

self = <apps.reports.tests.test_ooxml_integrity.OOXMLIntegrityTestCase testMethod=test_clean_sample_integrity>
mock_generate_json = <MagicMock name='generate_json' id='124475822177264'>
mock_outlet_first = <MagicMock name='first' id='124475822175920'>
mock_audit_create = <MagicMock name='create' id='124475822172320'>

    @patch('apps.reports.exports.gstr1_excel.GSTExportAudit.objects.create')
    @patch('apps.reports.exports.gstr1_excel.Outlet.objects.first')
    @patch('apps.reports.exports.gstr1_excel.GSTR1Builder.generate_json')
    def test_clean_sample_integrity(self, mock_generate_json, mock_outlet_first, mock_audit_create):
        mock_outlet_first.return_value = Outlet(name="Test", gstin="27AADCB2230M1Z2")
        mock_generate_json.return_value = {
            'b2b': [{'ctin': '27BBBBBBBBBBBBB', 'inv': [{'inum': 'INV-CLEAN-01', 'idt': '10-09-2026', 'val': 1000.0, 'pos': '27', 'inv_typ': 'R', 'itms': [{'itm_det': {'rt': 18.0, 'txval': 1000.0}}]}]}],
            'hsn': {'b2b': {'data': [{'hsn_sc': '84713010', 'desc': 'Personal computers', 'uqc': 'NOS', 'qty': 10.0, 'val': 1180.0, 'rt': 18.0, 'txval': 1000.0, 'iamt': 0, 'camt': 90.0, 'samt': 90.0, 'csamt': 0}]}}
        }
        period = '092026'
        request = self.factory.get(f'/api/v1/gst/export/{period}/gstr1_excel/')
        request.user = self.user
    
        with patch('rest_framework.request.Request.user', new_callable=lambda: self.user):
            response = self.view(request, fp=period)
    
>       self.assertEqual(response.status_code, 200)
E       AssertionError: 422 != 200

apps/reports/tests/test_ooxml_integrity.py:39: AssertionError
----------------------------- Captured stdout call -----------------------------
DEBUG PAYLOAD: {'b2b': [{'ctin': '27BBBBBBBBBBBBB', 'inv': [{'inum': 'INV-CLEAN-01', 'idt': '10-09-2026', 'val': 1000.0, 'pos': '27', 'inv_typ': 'R', 'itms': [{'itm_det': {'rt': 18.0, 'txval': 1000.0}}]}]}], 'hsn': {'b2b': {'data': [{'hsn_sc': '84713010', 'desc': 'Personal computers', 'uqc': 'NOS', 'qty': 10.0, 'val': 1180.0, 'rt': 18.0, 'txval': 1000.0, 'iamt': 0, 'camt': 90.0, 'samt': 90.0, 'csamt': 0}]}}}
DATA MAP: {'b2b,sez,de': [{'start_row': 5, 'rows': [{1: '27BBBBBBBBBBBBB', 2: '', 3: 'INV-CLEAN-01', 4: '10-09-2026', 5: Decimal('1000.0'), 6: '27', 7: 'N', 8: 'R', 9: '', 10: Decimal('18.0'), 11: Decimal('1000.0'), 12: ''}]}], 'hsn(b2b)': [{'start_row': 5, 'rows': [{1: '84713010', 2: 'Personal computers', 3: 'NOS', 4: Decimal('10.0'), 5: Decimal('1180.0'), 6: Decimal('18.0'), 7: Decimal('1000.0'), 8: None, 9: Decimal('90.0'), 10: Decimal('90.0'), 11: None}]}]}
__ ReconciliationExcelExportTests.test_reconciliation_excel_export_successful __

self = <apps.reports.tests.test_reconciliation_excel.ReconciliationExcelExportTests testMethod=test_reconciliation_excel_export_successful>
mock_get_outlet = <MagicMock name='get_current_outlet' id='124475829553632'>

    @patch('apps.reports.exports.reconciliation_excel.ReconciliationExcelExportView.get_current_outlet')
    def test_reconciliation_excel_export_successful(self, mock_get_outlet):
        mock_get_outlet.return_value = self.outlet
    
        response = self.client.get(self.url)
>       self.assertEqual(response.status_code, 200)
E       AssertionError: 401 != 200

apps/reports/tests/test_reconciliation_excel.py:54: AssertionError
------------------------------ Captured log call -------------------------------
WARNING  django.request:log.py:241 Unauthorized: /api/v1/gst/export/082026/reconciliation_excel/
____ ReconciliationExcelExportTests.test_reconciliation_excel_no_run_found _____

self = <apps.reports.tests.test_reconciliation_excel.ReconciliationExcelExportTests testMethod=test_reconciliation_excel_no_run_found>
mock_get_outlet = <MagicMock name='get_current_outlet' id='124475827765712'>

    @patch('apps.reports.exports.reconciliation_excel.ReconciliationExcelExportView.get_current_outlet')
    def test_reconciliation_excel_no_run_found(self, mock_get_outlet):
        mock_get_outlet.return_value = self.outlet
    
        # Test for a period with no run
        url = reverse('gst-export-reconciliation-excel', kwargs={'fp': '092026'})
        response = self.client.get(url)
    
>       self.assertEqual(response.status_code, 404)
E       AssertionError: 401 != 404

apps/reports/tests/test_reconciliation_excel.py:70: AssertionError
------------------------------ Captured log call -------------------------------
WARNING  django.request:log.py:241 Unauthorized: /api/v1/gst/export/092026/reconciliation_excel/
______________ GSTSnapshotServiceTests.test_interstate_sale_taxes ______________

self = <apps.reports.tests.test_snapshot_services.GSTSnapshotServiceTests testMethod=test_interstate_sale_taxes>

    def setUp(self):
>       call_command('seed_local_gst_test_data', reset=True, seed=42)

apps/reports/tests/test_snapshot_services.py:16: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
venv/lib/python3.12/site-packages/django/core/management/__init__.py:194: in call_command
    return command.execute(*args, **defaults)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/core/management/base.py:459: in execute
    output = self.handle(*args, **options)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seed_local_gst_test_data.py:23: in handle
    run_seeder(size=size, hard_reset=False, random_seed=seed)
apps/core/management/commands/seeder.py:341: in run_seeder
    batches = seed_purchases(outlets, distributors, products, num_purchases=n_pur)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seeder.py:179: in seed_purchases
    PurchaseItem.objects.create(
venv/lib/python3.12/site-packages/django/db/models/manager.py:87: in manager_method
    return getattr(self.get_queryset(), name)(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/db/models/query.py:677: in create
    obj = self.model(**kwargs)
          ^^^^^^^^^^^^^^^^^^^^
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <PurchaseItem: SEED-Azithromycin 250mg - SEED-B-12c317-0-0>, args = ()
kwargs = {'sale_rate': Decimal('120.00')}

    def __init__(self, *args, **kwargs):
        # Alias some things as locals to avoid repeat global lookups
        cls = self.__class__
        opts = self._meta
        _setattr = setattr
        _DEFERRED = DEFERRED
        if opts.abstract:
            raise TypeError("Abstract models cannot be instantiated.")
    
        pre_init.send(sender=cls, args=args, kwargs=kwargs)
    
        # Set up the storage for instance state
        self._state = ModelState()
    
        # There is a rather weird disparity here; if kwargs, it's set, then args
        # overrides it. It should be one or the other; don't duplicate the work
        # The reason for the kwargs check is that standard iterator passes in by
        # args, and instantiation for iteration is 33% faster.
        if len(args) > len(opts.concrete_fields):
            # Daft, but matches old exception sans the err msg.
            raise IndexError("Number of args exceeds number of fields")
    
        if not kwargs:
            fields_iter = iter(opts.concrete_fields)
            # The ordering of the zip calls matter - zip throws StopIteration
            # when an iter throws it. So if the first iter throws it, the second
            # is *not* consumed. We rely on this, so don't change the order
            # without changing the logic.
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
        else:
            # Slower, kwargs-ready version.
            fields_iter = iter(opts.fields)
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
                if kwargs.pop(field.name, NOT_PROVIDED) is not NOT_PROVIDED:
                    raise TypeError(
                        f"{cls.__qualname__}() got both positional and "
                        f"keyword arguments for field '{field.name}'."
                    )
    
        # Now we're left with the unprocessed fields that *must* come from
        # keywords, or default.
    
        for field in fields_iter:
            is_related_object = False
            # Virtual field
            if field.attname not in kwargs and field.column is None or field.generated:
                continue
            if kwargs:
                if isinstance(field.remote_field, ForeignObjectRel):
                    try:
                        # Assume object instance was passed in.
                        rel_obj = kwargs.pop(field.name)
                        is_related_object = True
                    except KeyError:
                        try:
                            # Object instance wasn't passed in -- must be an ID.
                            val = kwargs.pop(field.attname)
                        except KeyError:
                            val = field.get_default()
                else:
                    try:
                        val = kwargs.pop(field.attname)
                    except KeyError:
                        # This is done with an exception rather than the
                        # default argument on pop because we don't want
                        # get_default() to be evaluated, and then not used.
                        # Refs #12057.
                        val = field.get_default()
            else:
                val = field.get_default()
    
            if is_related_object:
                # If we are passed a related instance, set it using the
                # field.name instead of field.attname (e.g. "user" instead of
                # "user_id") so that the object gets properly cached (and type
                # checked) by the RelatedObjectDescriptor.
                if rel_obj is not _DEFERRED:
                    _setattr(self, field.name, rel_obj)
            else:
                if val is not _DEFERRED:
                    _setattr(self, field.attname, val)
    
        if kwargs:
            property_names = opts._property_names
            unexpected = ()
            for prop, value in kwargs.items():
                # Any remaining kwargs must correspond to properties or virtual
                # fields.
                if prop in property_names:
                    if value is not _DEFERRED:
                        _setattr(self, prop, value)
                else:
                    try:
                        opts.get_field(prop)
                    except FieldDoesNotExist:
                        unexpected += (prop,)
                    else:
                        if value is not _DEFERRED:
                            _setattr(self, prop, value)
            if unexpected:
                unexpected_names = ", ".join(repr(n) for n in unexpected)
>               raise TypeError(
                    f"{cls.__name__}() got unexpected keyword arguments: "
                    f"{unexpected_names}"
                )
E               TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'

venv/lib/python3.12/site-packages/django/db/models/base.py:567: TypeError
----------------------------- Captured stdout call -----------------------------
Performing safe reset of SEEDED local data...
Performing targeted reset of seeded data (PREFIX: SEED-)...
Seeding master data...
Seeding purchases and inventory...
___________ GSTSnapshotServiceTests.test_purchase_snapshot_creation ____________

self = <apps.reports.tests.test_snapshot_services.GSTSnapshotServiceTests testMethod=test_purchase_snapshot_creation>

    def setUp(self):
>       call_command('seed_local_gst_test_data', reset=True, seed=42)

apps/reports/tests/test_snapshot_services.py:16: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
venv/lib/python3.12/site-packages/django/core/management/__init__.py:194: in call_command
    return command.execute(*args, **defaults)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/core/management/base.py:459: in execute
    output = self.handle(*args, **options)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seed_local_gst_test_data.py:23: in handle
    run_seeder(size=size, hard_reset=False, random_seed=seed)
apps/core/management/commands/seeder.py:341: in run_seeder
    batches = seed_purchases(outlets, distributors, products, num_purchases=n_pur)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seeder.py:179: in seed_purchases
    PurchaseItem.objects.create(
venv/lib/python3.12/site-packages/django/db/models/manager.py:87: in manager_method
    return getattr(self.get_queryset(), name)(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/db/models/query.py:677: in create
    obj = self.model(**kwargs)
          ^^^^^^^^^^^^^^^^^^^^
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <PurchaseItem: SEED-Azithromycin 250mg - SEED-B-4ae63d-0-0>, args = ()
kwargs = {'sale_rate': Decimal('120.00')}

    def __init__(self, *args, **kwargs):
        # Alias some things as locals to avoid repeat global lookups
        cls = self.__class__
        opts = self._meta
        _setattr = setattr
        _DEFERRED = DEFERRED
        if opts.abstract:
            raise TypeError("Abstract models cannot be instantiated.")
    
        pre_init.send(sender=cls, args=args, kwargs=kwargs)
    
        # Set up the storage for instance state
        self._state = ModelState()
    
        # There is a rather weird disparity here; if kwargs, it's set, then args
        # overrides it. It should be one or the other; don't duplicate the work
        # The reason for the kwargs check is that standard iterator passes in by
        # args, and instantiation for iteration is 33% faster.
        if len(args) > len(opts.concrete_fields):
            # Daft, but matches old exception sans the err msg.
            raise IndexError("Number of args exceeds number of fields")
    
        if not kwargs:
            fields_iter = iter(opts.concrete_fields)
            # The ordering of the zip calls matter - zip throws StopIteration
            # when an iter throws it. So if the first iter throws it, the second
            # is *not* consumed. We rely on this, so don't change the order
            # without changing the logic.
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
        else:
            # Slower, kwargs-ready version.
            fields_iter = iter(opts.fields)
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
                if kwargs.pop(field.name, NOT_PROVIDED) is not NOT_PROVIDED:
                    raise TypeError(
                        f"{cls.__qualname__}() got both positional and "
                        f"keyword arguments for field '{field.name}'."
                    )
    
        # Now we're left with the unprocessed fields that *must* come from
        # keywords, or default.
    
        for field in fields_iter:
            is_related_object = False
            # Virtual field
            if field.attname not in kwargs and field.column is None or field.generated:
                continue
            if kwargs:
                if isinstance(field.remote_field, ForeignObjectRel):
                    try:
                        # Assume object instance was passed in.
                        rel_obj = kwargs.pop(field.name)
                        is_related_object = True
                    except KeyError:
                        try:
                            # Object instance wasn't passed in -- must be an ID.
                            val = kwargs.pop(field.attname)
                        except KeyError:
                            val = field.get_default()
                else:
                    try:
                        val = kwargs.pop(field.attname)
                    except KeyError:
                        # This is done with an exception rather than the
                        # default argument on pop because we don't want
                        # get_default() to be evaluated, and then not used.
                        # Refs #12057.
                        val = field.get_default()
            else:
                val = field.get_default()
    
            if is_related_object:
                # If we are passed a related instance, set it using the
                # field.name instead of field.attname (e.g. "user" instead of
                # "user_id") so that the object gets properly cached (and type
                # checked) by the RelatedObjectDescriptor.
                if rel_obj is not _DEFERRED:
                    _setattr(self, field.name, rel_obj)
            else:
                if val is not _DEFERRED:
                    _setattr(self, field.attname, val)
    
        if kwargs:
            property_names = opts._property_names
            unexpected = ()
            for prop, value in kwargs.items():
                # Any remaining kwargs must correspond to properties or virtual
                # fields.
                if prop in property_names:
                    if value is not _DEFERRED:
                        _setattr(self, prop, value)
                else:
                    try:
                        opts.get_field(prop)
                    except FieldDoesNotExist:
                        unexpected += (prop,)
                    else:
                        if value is not _DEFERRED:
                            _setattr(self, prop, value)
            if unexpected:
                unexpected_names = ", ".join(repr(n) for n in unexpected)
>               raise TypeError(
                    f"{cls.__name__}() got unexpected keyword arguments: "
                    f"{unexpected_names}"
                )
E               TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'

venv/lib/python3.12/site-packages/django/db/models/base.py:567: TypeError
----------------------------- Captured stdout call -----------------------------
Performing safe reset of SEEDED local data...
Performing targeted reset of seeded data (PREFIX: SEED-)...
Seeding master data...
Seeding purchases and inventory...
_____________ GSTSnapshotServiceTests.test_sale_snapshot_creation ______________

self = <apps.reports.tests.test_snapshot_services.GSTSnapshotServiceTests testMethod=test_sale_snapshot_creation>

    def setUp(self):
>       call_command('seed_local_gst_test_data', reset=True, seed=42)

apps/reports/tests/test_snapshot_services.py:16: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 
venv/lib/python3.12/site-packages/django/core/management/__init__.py:194: in call_command
    return command.execute(*args, **defaults)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/core/management/base.py:459: in execute
    output = self.handle(*args, **options)
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seed_local_gst_test_data.py:23: in handle
    run_seeder(size=size, hard_reset=False, random_seed=seed)
apps/core/management/commands/seeder.py:341: in run_seeder
    batches = seed_purchases(outlets, distributors, products, num_purchases=n_pur)
              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
apps/core/management/commands/seeder.py:179: in seed_purchases
    PurchaseItem.objects.create(
venv/lib/python3.12/site-packages/django/db/models/manager.py:87: in manager_method
    return getattr(self.get_queryset(), name)(*args, **kwargs)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
venv/lib/python3.12/site-packages/django/db/models/query.py:677: in create
    obj = self.model(**kwargs)
          ^^^^^^^^^^^^^^^^^^^^
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <PurchaseItem: SEED-Azithromycin 250mg - SEED-B-786f0e-0-0>, args = ()
kwargs = {'sale_rate': Decimal('120.00')}

    def __init__(self, *args, **kwargs):
        # Alias some things as locals to avoid repeat global lookups
        cls = self.__class__
        opts = self._meta
        _setattr = setattr
        _DEFERRED = DEFERRED
        if opts.abstract:
            raise TypeError("Abstract models cannot be instantiated.")
    
        pre_init.send(sender=cls, args=args, kwargs=kwargs)
    
        # Set up the storage for instance state
        self._state = ModelState()
    
        # There is a rather weird disparity here; if kwargs, it's set, then args
        # overrides it. It should be one or the other; don't duplicate the work
        # The reason for the kwargs check is that standard iterator passes in by
        # args, and instantiation for iteration is 33% faster.
        if len(args) > len(opts.concrete_fields):
            # Daft, but matches old exception sans the err msg.
            raise IndexError("Number of args exceeds number of fields")
    
        if not kwargs:
            fields_iter = iter(opts.concrete_fields)
            # The ordering of the zip calls matter - zip throws StopIteration
            # when an iter throws it. So if the first iter throws it, the second
            # is *not* consumed. We rely on this, so don't change the order
            # without changing the logic.
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
        else:
            # Slower, kwargs-ready version.
            fields_iter = iter(opts.fields)
            for val, field in zip(args, fields_iter):
                if val is _DEFERRED:
                    continue
                _setattr(self, field.attname, val)
                if kwargs.pop(field.name, NOT_PROVIDED) is not NOT_PROVIDED:
                    raise TypeError(
                        f"{cls.__qualname__}() got both positional and "
                        f"keyword arguments for field '{field.name}'."
                    )
    
        # Now we're left with the unprocessed fields that *must* come from
        # keywords, or default.
    
        for field in fields_iter:
            is_related_object = False
            # Virtual field
            if field.attname not in kwargs and field.column is None or field.generated:
                continue
            if kwargs:
                if isinstance(field.remote_field, ForeignObjectRel):
                    try:
                        # Assume object instance was passed in.
                        rel_obj = kwargs.pop(field.name)
                        is_related_object = True
                    except KeyError:
                        try:
                            # Object instance wasn't passed in -- must be an ID.
                            val = kwargs.pop(field.attname)
                        except KeyError:
                            val = field.get_default()
                else:
                    try:
                        val = kwargs.pop(field.attname)
                    except KeyError:
                        # This is done with an exception rather than the
                        # default argument on pop because we don't want
                        # get_default() to be evaluated, and then not used.
                        # Refs #12057.
                        val = field.get_default()
            else:
                val = field.get_default()
    
            if is_related_object:
                # If we are passed a related instance, set it using the
                # field.name instead of field.attname (e.g. "user" instead of
                # "user_id") so that the object gets properly cached (and type
                # checked) by the RelatedObjectDescriptor.
                if rel_obj is not _DEFERRED:
                    _setattr(self, field.name, rel_obj)
            else:
                if val is not _DEFERRED:
                    _setattr(self, field.attname, val)
    
        if kwargs:
            property_names = opts._property_names
            unexpected = ()
            for prop, value in kwargs.items():
                # Any remaining kwargs must correspond to properties or virtual
                # fields.
                if prop in property_names:
                    if value is not _DEFERRED:
                        _setattr(self, prop, value)
                else:
                    try:
                        opts.get_field(prop)
                    except FieldDoesNotExist:
                        unexpected += (prop,)
                    else:
                        if value is not _DEFERRED:
                            _setattr(self, prop, value)
            if unexpected:
                unexpected_names = ", ".join(repr(n) for n in unexpected)
>               raise TypeError(
                    f"{cls.__name__}() got unexpected keyword arguments: "
                    f"{unexpected_names}"
                )
E               TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'

venv/lib/python3.12/site-packages/django/db/models/base.py:567: TypeError
----------------------------- Captured stdout call -----------------------------
Performing safe reset of SEEDED local data...
Performing targeted reset of seeded data (PREFIX: SEED-)...
Seeding master data...
Seeding purchases and inventory...
_____________ TemplateIntegrityTests.test_gstr1_template_integrity _____________

self = <apps.reports.tests.test_template_integrity.TemplateIntegrityTests testMethod=test_gstr1_template_integrity>

    def test_gstr1_template_integrity(self):
        template_dir = os.path.join(settings.BASE_DIR, 'apps', 'reports', 'resources', 'gst_templates')
        manifest_path = os.path.join(template_dir, 'template_manifest.json')
    
        self.assertTrue(os.path.exists(manifest_path), "Template manifest does not exist")
    
        with open(manifest_path, 'r') as f:
            manifest = json.load(f)
    
        template_filename = 'GSTR1_Excel_Workbook_Template_V2.2.xlsx'
        template_path = os.path.join(template_dir, template_filename)
    
>       self.assertTrue(os.path.exists(template_path), f"Official template {template_filename} not found")
E       AssertionError: False is not true : Official template GSTR1_Excel_Workbook_Template_V2.2.xlsx not found

apps/reports/tests/test_template_integrity.py:20: AssertionError
=============================== warnings summary ===============================
apps/reports/tests/test_export_consistency.py::ExportConsistencyTests::test_reconciliation_excel_consistency
  /home/asta/coding/MDF/apps/backend/venv/lib/python3.12/site-packages/openpyxl/packaging/core.py:99: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    now = datetime.datetime.utcnow()

apps/reports/tests/test_export_consistency.py::ExportConsistencyTests::test_reconciliation_excel_consistency
  /home/asta/coding/MDF/apps/backend/venv/lib/python3.12/site-packages/openpyxl/writer/excel.py:292: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    workbook.properties.modified = datetime.datetime.utcnow()

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
=========================== short test summary info ============================
FAILED apps/reports/tests/test_ca_working_paper.py::CAWorkingPaperTests::test_pdf_export_successful - AssertionError: 401 != 200
FAILED apps/reports/tests/test_gst_foundation.py::GSTFoundationTests::test_gst_transaction_snapshot_creation - TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'
FAILED apps/reports/tests/test_gst_foundation.py::GSTFoundationTests::test_seed_mumbai_outlet_credentials - TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'
FAILED apps/reports/tests/test_gst_template_integrity.py::GSTTemplateIntegrityTest::test_manifest_and_template_exist - AssertionError: False is not true : Template file not found.
FAILED apps/reports/tests/test_gst_template_integrity.py::GSTTemplateIntegrityTest::test_template_checksum_matches_manifest - FileNotFoundError: [Errno 2] No such file or directory: '/home/asta/coding/MDF/apps/backend/apps/reports/resources/gst_templates/GSTR1_Excel_Workbook_Template_V2.2.xlsx'
FAILED apps/reports/tests/test_gst_template_integrity.py::GSTTemplateIntegrityTest::test_template_structure_preservation - FileNotFoundError: [Errno 2] No such file or directory: '/home/asta/coding/MDF/apps/backend/apps/reports/resources/gst_templates/GSTR1_Excel_Workbook_Template_V2.2.xlsx'
FAILED apps/reports/tests/test_gstr2b.py::GSTR2BServiceTests::test_reconciliation_matched - TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'
FAILED apps/reports/tests/test_gstr2b.py::GSTR2BServiceTests::test_reconciliation_mismatch - TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'
FAILED apps/reports/tests/test_gstr2b.py::GSTR2BServiceTests::test_reconciliation_missing_in_2b - TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_01_outward_supplies - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_02_itc_eligible - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_03_itc_reversal_section_17_5 - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_04_itc_reversal_rule_37 - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_10_rcm_inward_supply - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_11_inter_state_unregistered - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_13_excess_itc - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_14_liability_shortfall - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_15_invalid_reversals - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_16_table_3_2_bounds - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_17_deferred_itc_lifecycle - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_18_rule37_reclaim - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_3b_21_val_008_blocking_override - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr3b_returns.py::GSTR3BAndReconciliationTest::test_tc_99_generate_ca_json - ImportError: cannot import name 'GSTR3BValidator' from 'apps.reports.validators' (/home/asta/coding/MDF/apps/backend/apps/reports/validators.py)
FAILED apps/reports/tests/test_gstr_builders.py::GSTRBuildersTests::test_gstr1_builder - TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'
FAILED apps/reports/tests/test_gstr_builders.py::GSTRBuildersTests::test_gstr3b_builder - TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'
FAILED apps/reports/tests/test_gstr_returns.py::GSTR1BuilderNotesTestCase::test_original_document_traceability_and_manual_override - AssertionError: False is not true
FAILED apps/reports/tests/test_ooxml_integrity.py::OOXMLIntegrityTestCase::test_advanced_sample_integrity - AssertionError: 422 != 200
FAILED apps/reports/tests/test_ooxml_integrity.py::OOXMLIntegrityTestCase::test_clean_sample_integrity - AssertionError: 422 != 200
FAILED apps/reports/tests/test_reconciliation_excel.py::ReconciliationExcelExportTests::test_reconciliation_excel_export_successful - AssertionError: 401 != 200
FAILED apps/reports/tests/test_reconciliation_excel.py::ReconciliationExcelExportTests::test_reconciliation_excel_no_run_found - AssertionError: 401 != 404
FAILED apps/reports/tests/test_snapshot_services.py::GSTSnapshotServiceTests::test_interstate_sale_taxes - TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'
FAILED apps/reports/tests/test_snapshot_services.py::GSTSnapshotServiceTests::test_purchase_snapshot_creation - TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'
FAILED apps/reports/tests/test_snapshot_services.py::GSTSnapshotServiceTests::test_sale_snapshot_creation - TypeError: PurchaseItem() got unexpected keyword arguments: 'sale_rate'
FAILED apps/reports/tests/test_template_integrity.py::TemplateIntegrityTests::test_gstr1_template_integrity - AssertionError: False is not true : Official template GSTR1_Excel_Workbook_Template_V2.2.xlsx not found
================== 34 failed, 27 passed, 2 warnings in 10.50s ==================


```