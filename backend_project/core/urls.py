from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LoginView, home, PostList, PostViewSet
from .views import TestAuthView
from attendance.views import AttendanceViewSet

router = DefaultRouter()
router.register('posts', PostViewSet)

urlpatterns = [
    path('', home),
    path('posts-api/', PostList.as_view()),
    path('', include(router.urls)),   # FIXED
    path('test-auth/', TestAuthView.as_view()),
    path('login/', LoginView.as_view()), 
]