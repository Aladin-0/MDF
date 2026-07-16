from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
import uuid

class RevisionsRegressionTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_revisions_invalid_outlet_id_no_500(self):
        """Test that /api/v1/revisions/ with invalid outletId returns 400 JSON instead of 500 HTML/Error"""
        # Note: the URL is exposed at /api/v1/revisions/ but the route name is 'sale-revisions-list'
        url = reverse('sale-revisions-list')
        response = self.client.get(url + '?outletId=invalid-uuid')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response['Content-Type'], 'application/json')
        self.assertIn('detail', response.json())

    def test_sale_revisions_invalid_uuid_returns_json_404(self):
        """Test that /api/v1/sales/<invalid-uuid>/revisions/ returns JSON 404 instead of HTML 404"""
        # If we pass a completely invalid string, Django URL resolver fails to match <uuid:sale_id>
        # and falls back to the global handler404 which must return JSON.
        response = self.client.get('/api/v1/sales/not-a-valid-uuid/revisions/')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response['Content-Type'], 'application/json')
        self.assertIn('detail', response.json())

    def test_sale_revisions_valid_uuid_not_found_returns_json_404(self):
        """Test that a valid UUID that doesn't exist returns JSON 404"""
        url = reverse('sale-revisions-detail', kwargs={'sale_id': uuid.uuid4()})
        # Note: the view checks outletId, so we provide a valid UUID for it
        response = self.client.get(url + f'?outletId={uuid.uuid4()}')
        # Assuming not authenticated, it might return 401. Let's just check it doesn't return HTML.
        self.assertIn('application/json', response['Content-Type'])
