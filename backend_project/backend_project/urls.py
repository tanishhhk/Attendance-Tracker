from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),

    path('api/', include('core.urls')),
    path('api/attendance/', include('attendance.urls')),
    path('api/leave/', include('leave.urls')),
]