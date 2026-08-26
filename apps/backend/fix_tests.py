import os

files_to_fix = [
    '/home/asta/coding/MDF/apps/backend/apps/gst/tests/test_sandbox_provider_config.py',
    '/home/asta/coding/MDF/apps/backend/apps/gst/tests/test_sandbox_auth.py',
    '/home/asta/coding/MDF/apps/backend/apps/gst/tests/test_sandbox_provider.py',
    '/home/asta/coding/MDF/apps/backend/apps/gst/tests/test_sandbox_views.py'
]

def fix_config_py():
    path = files_to_fix[0]
    with open(path, 'r') as f:
        content = f.read()
    content = content.replace("'SANDBOX_PROVIDER_MODE': 'test',", "'SANDBOX_API_KEY': 'test_key', 'SANDBOX_API_SECRET': 'test_secret', 'SANDBOX_PROVIDER_MODE': 'test',")
    content = content.replace("'SANDBOX_PROVIDER_MODE': 'live',", "'SANDBOX_API_KEY': 'live_key', 'SANDBOX_API_SECRET': 'test_secret', 'ENABLE_GST_SANDBOX_LIVE_MODE': 'True', 'SANDBOX_PROVIDER_MODE': 'live',")
    content = content.replace("'SANDBOX_PROVIDER_MODE': 'invalid_mode',", "'SANDBOX_API_KEY': 'test_key', 'SANDBOX_API_SECRET': 'test_secret', 'SANDBOX_PROVIDER_MODE': 'invalid_mode',")
    with open(path, 'w') as f:
        f.write(content)

def fix_auth_py():
    path = files_to_fix[1]
    with open(path, 'r') as f:
        content = f.read()
    content = content.replace("self.assertEqual(creds['base_url'], 'https://api.sandbox.co.in')", "self.assertEqual(creds['base_url'], 'https://test-api.sandbox.co.in')")
    content = content.replace("self.assertIn(\"Unauthorized\", exc.exception.message)", "self.assertIn(\"Unauthorized\", str(exc.exception))")
    content = content.replace("mock_resp.reason = \"Unauthorized\"", "mock_resp.reason = \"Unauthorized\"\n        mock_resp.json.return_value = {'message': 'Unauthorized'}")
    with open(path, 'w') as f:
        f.write(content)

def fix_provider_py():
    path = files_to_fix[2]
    with open(path, 'r') as f:
        content = f.read()
    content = content.replace("provider.env", "provider.provider_mode")
    with open(path, 'w') as f:
        f.write(content)

def fix_views_py():
    path = files_to_fix[3]
    with open(path, 'r') as f:
        content = f.read()
    content = content.replace("'GST_ENV': 'production'", "'SANDBOX_PROVIDER_MODE': 'live', 'ENABLE_GST_SANDBOX_LIVE_MODE': 'False'")
    content = content.replace("'GST_ENV': 'sandbox'", "'SANDBOX_PROVIDER_MODE': 'test'")
    with open(path, 'w') as f:
        f.write(content)

fix_config_py()
fix_auth_py()
fix_provider_py()
fix_views_py()
