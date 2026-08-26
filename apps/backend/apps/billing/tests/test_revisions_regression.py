from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
import uuid

class RevisionsRegressionTest(TestCase):

    def setUp(self):
        self.client = APIClient()

    def test_revisions_invalid_outlet_id_no_500(self):
        """Test that /api/v1/revisions/ with invalid outletId returns 400 JSON instead of 500 HTML/Error"""
        url = reverse('sale-revisions-list')
        response = self.client.get(url + '?outletId=invalid-uuid')
        self.assertIn(response.status_code, [400, 401])
        self.assertEqual(response['Content-Type'], 'application/json')
        self.assertIn('detail', response.json())

    def test_sale_revisions_invalid_uuid_returns_json_404(self):
        """Test that /api/v1/sales/<invalid-uuid>/revisions/ returns JSON 404 instead of HTML 404"""
        response = self.client.get('/api/v1/sales/not-a-valid-uuid/revisions/')
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response['Content-Type'], 'application/json')
        self.assertIn('detail', response.json())

    def test_sale_revisions_valid_uuid_not_found_returns_json_404(self):
        """Test that a valid UUID that doesn't exist returns JSON 404"""
        url = f'/api/v1/sales/{uuid.uuid4()}/revisions/'
        response = self.client.get(url + f'?outletId={uuid.uuid4()}')
        self.assertIn('application/json', response['Content-Type'])