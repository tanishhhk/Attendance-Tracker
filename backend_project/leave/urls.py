from django.urls import path, include
from rest_framework.routers import SimpleRouter
from .views import LeaveViewSet

# SimpleRouter for the same 'api-root' name-collision reason as attendance.
router = SimpleRouter()
router.register(r'leaves', LeaveViewSet, basename='leave')

urlpatterns = [
    path('', include(router.urls)),
]