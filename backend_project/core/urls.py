from django.urls import path, include
from rest_framework.routers import DefaultRouter
from attendance.views import AttendanceViewSet
from .views import CreateEmployeeView, LoginView, home, PostList, PostViewSet, TestAuthView, EmployeeListView

router = DefaultRouter()
router.register('posts', PostViewSet)

urlpatterns = [
    path('', home),
    path('posts-api/', PostList.as_view()),
    path('', include(router.urls)),
    path('test-auth/', TestAuthView.as_view()),
    path('login/', LoginView.as_view()), 
    path('employees/create/', CreateEmployeeView.as_view(), name='create-employee'),
    path('employees/', EmployeeListView.as_view(), name='employee-list'),
]
