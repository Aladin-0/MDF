from django.urls import path

from . import api
from .views import UnifiedRevisionDetailView

urlpatterns = [
    path('events/', api.EventListView.as_view(), name='audit-events'),
    path('events/<uuid:event_id>/', api.EventDetailView.as_view(), name='audit-event-detail'),
    path('flags/', api.FlagListView.as_view(), name='audit-flags'),
    path('flags/<uuid:flag_id>/review/', api.FlagReviewView.as_view(), name='audit-flag-review'),
    path('summary/', api.SummaryView.as_view(), name='audit-summary'),
    path('people/', api.PeopleView.as_view(), name='audit-people'),
    path('people/<str:actor_id>/', api.PersonView.as_view(), name='audit-person'),
    path('export/', api.ExportView.as_view(), name='audit-export'),
    path('edit-log/', api.EditLogView.as_view(), name='audit-edit-log'),
    path('policy/', api.PolicyView.as_view(), name='audit-policy'),
    # the old names, so a stale browser tab keeps working: same answers as the new endpoints
    path('logs/export/', api.ExportView.as_view(), name='activity-log-export'),
    path('logs/', api.EventListView.as_view(), name='activity-log-list'),
    path('revisions/<str:record_type>/<uuid:record_id>/', UnifiedRevisionDetailView.as_view(), name='unified-revision-detail'),
]
