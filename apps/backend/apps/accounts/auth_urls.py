from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from apps.accounts.views import LoginView, StaffMeView, ChangePinView, SwitchOutletView, LogoutView

urlpatterns = [
    path('login/', LoginView.as_view(), name='login'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('refresh/', TokenRefreshView.as_view(), name='token-refresh'),
    path('me/', StaffMeView.as_view(), name='staff-me'),
    path('me/pin/', ChangePinView.as_view(), name='change-pin'),
    path('switch-outlet/', SwitchOutletView.as_view(), name='switch-outlet'),
]
