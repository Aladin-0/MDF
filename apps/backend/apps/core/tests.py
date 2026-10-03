from django.test import TestCase
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from apps.core.models import Outlet, OutletSettings, Organization, default_print_settings_retail

User = get_user_model()

class OutletSettingsPrintEngineTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.org = Organization.objects.create(name="Test Org")
        self.outlet = Outlet.objects.create(name="Test Outlet", gstin="27AAAAA0000A1Z5", organization=self.org)
        self.user = User.objects.create_user(
            email="admin@test.com",
            phone="9999999999",
            password="testpassword",
            outlet_id=self.outlet.id,
            is_staff=True,
            role="admin"
        )
        self.client.force_authenticate(user=self.user)
        self.url = '/api/v1/outlet/settings/'

    def test_get_settings_default_print_schema(self):
        """Test that default JSON schemas are returned for new outlets"""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        
        data = response.json()['data']
        self.assertIn('printSettingsRetail', data)
        self.assertIn('printSettingsWholesale', data)
        
        # Verify the default structure
        retail = data['printSettingsRetail']
        self.assertEqual(retail['template'], 'Thermal_80mm')
        self.assertTrue(isinstance(retail['columns'], list))
        self.assertTrue(len(retail['columns']) > 0)
        self.assertIn('header', retail)
        self.assertIn('footer', retail)

    def test_patch_print_settings_wholesale(self):
        """Test updating the wholesale print settings via PATCH"""
        custom_wholesale = {
            "template": "A4",
            "columns": [
                {"id": "sn", "label": "Serial No.", "isVisible": True, "order": 1, "width": "5%"}
            ],
            "header": {"showLogo": False, "showDrugLicense": True, "showGstin": True, "customText": "WHOLESALE ONLY"},
            "footer": {"bankDetails": "Bank 1", "terms": "No returns"}
        }
        
        response = self.client.patch(self.url, {
            'printSettingsWholesale': custom_wholesale
        }, format='json')
        
        self.assertEqual(response.status_code, 200)
        
        # Verify it saved in DB
        settings = OutletSettings.objects.get(outlet=self.outlet)
        self.assertEqual(settings.print_settings_wholesale['header']['customText'], "WHOLESALE ONLY")
        self.assertEqual(len(settings.print_settings_wholesale['columns']), 1)
        self.assertEqual(settings.print_settings_wholesale['columns'][0]['label'], "Serial No.")

    def test_patch_print_settings_partial_json(self):
        """Test that sending partial JSON or missing keys just saves what is sent"""
        partial_retail = {
            "template": "Thermal_58mm",
            "header": {"customText": "Small Receipt"}
        }
        
        response = self.client.patch(self.url, {
            'printSettingsRetail': partial_retail
        }, format='json')
        
        self.assertEqual(response.status_code, 200)
        
        settings = OutletSettings.objects.get(outlet=self.outlet)
        self.assertEqual(settings.print_settings_retail['template'], "Thermal_58mm")

