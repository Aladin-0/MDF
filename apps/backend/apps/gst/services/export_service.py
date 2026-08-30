from typing import Dict, Any

class ExportBlockedException(Exception):
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.errors = errors or []

class GSTExportService:
    """
    Gateway service for GST JSON exports.
    This service strictly enforces the boundary between internal generation
    and external export (e.g. download or Sandbox API push).
    It does NOT directly file returns; it only generates validated JSON.
    """
    def __init__(self, gstin: str, period: str, return_type: str = 'GSTR1'):
        self.gstin = gstin
        self.period = period
        self.return_type = return_type
        
        if self.return_type == 'GSTR1':
            from apps.reports.gstr_builders import GSTR1Builder
            self.builder = GSTR1Builder(gstin, period)
        elif self.return_type == 'GSTR3B':
            from apps.reports.gstr_builders import GSTR3BBuilder
            self.builder = GSTR3BBuilder(gstin, period)
        else:
            raise ValueError(f"Unsupported return type: {return_type}")

    def get_draft_preview(self) -> Dict[str, Any]:
        """
        Allows previewing the data regardless of errors.
        Surfaces all warnings and blocking errors so the user can fix them.
        Always allowed, even with blocking errors.
        """
        payload = self.builder.generate_json()
        return payload

    def execute_export(self, allow_warnings=True) -> Dict[str, Any]:
        """
        Gates the final export. Blocks completely if blocking_errors are present.
        """
        payload = self.builder.generate_json()
        metadata = payload.get('_metadata', {})
        
        if not metadata.get('is_valid_for_export'):
            errors = metadata.get('blocking_errors', [])
            raise ExportBlockedException(
                "Cannot export GST return due to blocking validation errors.",
                errors=errors
            )
            
        if not allow_warnings and metadata.get('validation_warnings'):
            warnings = metadata.get('validation_warnings', [])
            raise ExportBlockedException(
                "Cannot export GST return due to strict warnings policy.",
                errors=warnings
            )
            
        return payload
