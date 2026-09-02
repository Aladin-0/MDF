import sys

tests_code = """
    def test_tc_3b_10_rcm_inward_supply(self):
        GSTTransactionSnapshot.objects.create(
            outlet=self.outlet, gstin='27AAAAA1234A1Z5', period=self.period,
            transaction_type='purchase', document_id=uuid.uuid4(), document_number='INV-RCM', document_date=date(2026, 8, 1),
            snapshot_json={
                'is_rcm': True, 'is_b2b': True, 'items_by_rate': {'18.0': {'taxable_amount': 1000.0, 'igst': 180.0, 'cgst': 0.0, 'sgst': 0.0, 'cess': 0.0}}
            }
        )
        builder = GSTR3BBuilder(gstin='27AAAAA1234A1Z5', period=self.period)
        payload = builder.generate_json()
        self.assertEqual(payload['sup_details']['isup_rev']['txval'], 1000.0)
        self.assertEqual(payload['sup_details']['isup_rev']['iamt'], 180.0)

    def test_tc_3b_11_inter_state_unregistered(self):
        GSTTransactionSnapshot.objects.create(
            outlet=self.outlet, gstin='27AAAAA1234A1Z5', period=self.period,
            transaction_type='sale', document_id=uuid.uuid4(), document_number='INV-B2C', document_date=date(2026, 8, 1),
            snapshot_json={
                'is_interstate': True, 'is_b2b': False, 'pos': '32', 'items_by_rate': {'18.0': {'taxable_amount': 1000.0, 'igst': 180.0, 'cgst': 0.0, 'sgst': 0.0, 'cess': 0.0}}
            }
        )
        builder = GSTR3BBuilder(gstin='27AAAAA1234A1Z5', period=self.period)
        payload = builder.generate_json()
        t32 = payload['inter_sup']['unreg_details']
        self.assertEqual(len(t32), 1)
        self.assertEqual(t32[0]['pos'], '32')
        self.assertEqual(t32[0]['txval'], 1000.0)

    @patch('apps.reports.gstr2b_service.GSTR2BService._fetch_from_portal')
    def test_tc_3b_12_reconciliation_multi_scenarios(self, mock_fetch):
        mock_fetch.return_value = {
            'data': [{
                'ctin': '27BBBBB1234B1Z5', 'supf': 'Active',
                'inv': [
                    {'inum': 'INV-MATCH', 'dt': '01-08-2026', 'itms': [{'itm_det': {'txval': 1000.0, 'camt': 90.0, 'samt': 90.0}}]},
                    {'inum': 'INV-VAL', 'dt': '01-08-2026', 'itms': [{'itm_det': {'txval': 2000.0, 'camt': 90.0, 'samt': 90.0}}]},
                    {'inum': 'INV-TAX', 'dt': '01-08-2026', 'itms': [{'itm_det': {'txval': 1000.0, 'camt': 100.0, 'samt': 100.0}}]},
                    {'inum': 'INV-RATE', 'dt': '01-08-2026', 'itms': [{'itm_det': {'txval': 1000.0, 'camt': 60.0, 'samt': 60.0}}]},
                    {'inum': 'INV-MISSING-PR', 'dt': '01-08-2026', 'itms': [{'itm_det': {'txval': 1000.0, 'camt': 90.0, 'samt': 90.0}}]}
                ]
            }]
        }
        # Create PRs
        prs = [
            ('INV-MATCH', 1000.0, 90.0, 90.0),
            ('INV-VAL', 1000.0, 90.0, 90.0), # Value mismatch
            ('INV-TAX', 1000.0, 90.0, 90.0), # Tax mismatch
            ('INV-RATE', 1000.0, 90.0, 90.0), # Rate mismatch (18% vs 12%)
            ('INV-MISSING-2B', 1000.0, 90.0, 90.0) # Missing in 2B
        ]
        for num, tv, cg, sg in prs:
            GSTTransactionSnapshot.objects.create(
                outlet=self.outlet, gstin='27AAAAA1234A1Z5', period=self.period, transaction_type='purchase',
                document_id=uuid.uuid4(), document_number=num, document_date=date(2026, 8, 1),
                snapshot_json={'is_b2b': True, 'distributor_gstin': '27BBBBB1234B1Z5', 'items_by_rate': {'18.0': {'taxable_amount': tv, 'igst': 0, 'cgst': cg, 'sgst': sg, 'cess': 0}}}
            )
        service = GSTR2BService(outlet=self.outlet, period=self.period)
        result = service.reconcile()
        run = ITCReconciliationRun.objects.get(id=result['run_id'])
        statuses = list(run.results.values_list('match_status', 'mismatch_reasons'))
        self.assertTrue(any(s[0] == 'MATCHED' for s in statuses))
        self.assertTrue(any(s[0] == 'MISSING_IN_2B' for s in statuses))
        self.assertTrue(any(s[0] == 'MISSING_IN_PR' for s in statuses))
        self.assertTrue(any('VALUE_MISMATCH' in s[1] for s in statuses if s[1]))
        self.assertTrue(any('TAX_MISMATCH' in s[1] for s in statuses if s[1]))
        self.assertTrue(any('TAX_RATE_MISMATCH' in s[1] for s in statuses if s[1]))

    def test_tc_3b_13_excess_itc(self):
        from apps.reports.validators import GSTR3BValidator
        payload = {'itc_elg': {'itc_net': {'iamt': 5000, 'camt': 0, 'samt': 0, 'csamt': 0}}}
        v = GSTR3BValidator()
        res = v.validate_json(payload, gstr2b_eligible_itc=4000.0)
        self.assertTrue(any(i.code == 'VAL-3B-008' for i in res.warnings))

    def test_tc_3b_14_liability_shortfall(self):
        from apps.reports.validators import GSTR3BValidator
        payload = {'sup_details': {'osup_det': {'iamt': 1000, 'camt': 0, 'samt': 0}}}
        v = GSTR3BValidator()
        res = v.validate_json(payload, gstr1_liability=2000.0)
        self.assertTrue(any(i.code == 'VAL-3B-002' for i in res.warnings))
        self.assertTrue(any(i.code == 'VAL-3B-013' for i in res.blocking_errors))

    def test_tc_3b_15_invalid_reversals(self):
        from apps.reports.validators import GSTR3BValidator
        payload = {'itc_elg': {'itc_avl': [{'iamt': 100}], 'itc_rev': [{'iamt': 500, 'ty': 'Rule 42,43,17(5)'}]}}
        v = GSTR3BValidator()
        res = v.validate_json(payload)
        self.assertTrue(any(i.code == 'VAL-3B-009' for i in res.blocking_errors))

    def test_tc_3b_16_table_3_2_bounds(self):
        from apps.reports.validators import GSTR3BValidator
        payload = {'sup_details': {'osup_det': {'iamt': 100}}, 'inter_sup': {'unreg_details': [{'iamt': 500}]}}
        v = GSTR3BValidator()
        res = v.validate_json(payload)
        self.assertTrue(any(i.code == 'VAL-3B-005' for i in res.blocking_errors))
"""

with open('apps/backend/apps/reports/tests/test_gstr3b_returns.py', 'a') as f:
    f.write(tests_code)
