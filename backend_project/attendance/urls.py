from django.urls import path, include
from rest_framework.routers import SimpleRouter
from .views import AttendanceViewSet

# SimpleRouter, not DefaultRouter: all three apps mount a router under the same
# 'api/' prefix and every DefaultRouter registers a URL named 'api-root', so
# they collided on that name.
router = SimpleRouter()
router.register('attendance', AttendanceViewSet, basename='attendance')

urlpatterns = [
    path('', include(router.urls)),
]
