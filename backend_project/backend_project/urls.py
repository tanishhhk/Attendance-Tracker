from django.contrib import admin
from django.urls import path, include
from core.views import home

urlpatterns = [
    # home was mounted under api/ where it shadowed the DRF router root, which
    # also left http://127.0.0.1:8000/ returning a 404.
    path('', home),
    path('admin/', admin.site.urls),
    path('api/', include('core.urls')),
    path('api/', include('attendance.urls')),
    path('api/', include('leave.urls')),
]
