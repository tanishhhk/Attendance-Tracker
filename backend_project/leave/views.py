from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from .models import Leave
from .serializers import LeaveSerializer


class LeaveViewSet(ModelViewSet):
    serializer_class = LeaveSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Leave.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    # ------------------------------------------------------------------ #
    #  APPLY FOR LEAVE                                                     #
    # ------------------------------------------------------------------ #
    @action(detail=False, methods=['post'])
    def apply(self, request):
        serializer = LeaveSerializer(data=request.data)

        if serializer.is_valid():
            serializer.save(user=request.user, status='pending')
            return Response({
                "message": "Leave applied successfully",
                "leave": serializer.data
            }, status=201)

        return Response(serializer.errors, status=400)

    # ------------------------------------------------------------------ #
    #  MY LEAVES                                                           #
    # ------------------------------------------------------------------ #
    @action(detail=False, methods=['get'])
    def my_leaves(self, request):
        leaves = Leave.objects.filter(user=request.user).order_by('-applied_on')
        serializer = LeaveSerializer(leaves, many=True)
        return Response(serializer.data)

    # ------------------------------------------------------------------ #
    #  APPROVE / REJECT  (admin only)                                      #
    # ------------------------------------------------------------------ #
    @action(detail=True, methods=['post'])
    def decide(self, request, pk=None):
        if not request.user.is_staff:
            return Response({"error": "Not authorized"}, status=403)

        try:
            leave = Leave.objects.get(pk=pk)
        except Leave.DoesNotExist:
            return Response({"error": "Leave not found"}, status=404)

        decision = request.data.get('status')

        if decision not in ['approved', 'rejected']:
            return Response(
                {"error": "status must be 'approved' or 'rejected'"},
                status=400
            )

        leave.status = decision
        leave.save()

        return Response({
            "message": f"Leave {decision}",
            "leave_id": leave.id,
            "status": leave.status,
        })