from multiprocessing.managers import Token
from urllib import request
from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet
from .models import Post
from .serializers import PostSerializer
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth import authenticate
from rest_framework.authtoken.models import Token
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.contrib.auth.models import User

def home(request):
    return render(request, 'home.html')


class PostList(APIView):

    def get(self, request):
        posts = Post.objects.all()
        serializer = PostSerializer(posts, many=True)
        return Response(serializer.data)


class PostViewSet(ModelViewSet):
    queryset = Post.objects.all()
    serializer_class = PostSerializer

class TestAuthView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"message": "Authenticated successfully"})
    
class LoginView(APIView):
    permission_classes = [AllowAny]   # ADD THIS

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")

        user = authenticate(username=username, password=password)

        if user is None:
            return Response({"error": "Invalid credentials"}, status=401)

        token, created = Token.objects.get_or_create(user=user)

        return Response({
            "token": token.key,
            "user": user.username,
            "name": user.get_full_name() or user.username,
            "is_staff": user.is_staff
        })
    


class CreateEmployeeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_staff:
            return Response({"error": "Not authorized"}, status=403)

        username = request.data.get('username')
        password = request.data.get('password')
        email    = request.data.get('email', '')

        if not username or not password:
            return Response({"error": "Username and password required"}, status=400)

        if User.objects.filter(username=username).exists():
            return Response({"error": "Username already exists"}, status=400)

        user = User.objects.create_user(
            username=username,
            password=password,
            email=email,
            first_name=request.data.get('first_name', '')
        )

        return Response({
            "message": "Employee created successfully",
            "id":       user.id,
            "username": user.username,
            "email":    user.email,
        }, status=201)
    
class EmployeeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({"error": "Not authorized"}, status=403)

        users = User.objects.filter(is_staff=False).values(
            'id', 'username', 'email', 'first_name', 'last_name', 'date_joined'
        )
        data = [{
            "id":         u['id'],
            "username":   u['username'],
            "name":       (u['first_name'] + ' ' + u['last_name']).strip() or u['username'],
            "email":      u['email'],
            "joined":     u['date_joined'].strftime('%Y-%m-%d'),
        } for u in users]

        return Response(data)