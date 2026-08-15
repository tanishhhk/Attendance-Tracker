from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from .models import Leave
from .serializers import LeaveSerializer


class LeaveViewSet(ModelViewSet):
    serializer_class = LeaveSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (Leave.objects
                .filter(user=self.request.user)
                .select_related('user', 'user__profile'))

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def _reject_if_decided(self, instance):
        # from_date/to_date/reason/leave_type stay writable on a ModelViewSet, so
        # without this an employee could PATCH an already-approved 1-day sick
        # leave into a 31-day one, or DELETE it outright.
        if instance.status != 'pending':
            raise PermissionDenied(
                "This leave has already been %s and can no longer be changed."
                % instance.status
            )

    def perform_update(self, serializer):
        self._reject_if_decided(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._reject_if_decided(instance)
        instance.delete()

#APPLY FOR LEAVE
    @action(detail=False, methods=['post'])
    def apply(self, request):
        serializer = self.get_serializer(data=request.data)

        if serializer.is_valid():
            serializer.save(user=request.user, status='pending')
            return Response({
                "message": "Leave applied successfully",
                "leave": serializer.data
            }, status=201)

        return Response(serializer.errors, status=400)

#MY LEAVES

    @action(detail=False, methods=['get'])
    def my_leaves(self, request):
        leaves = self.get_queryset().order_by('-applied_on')
        serializer = self.get_serializer(leaves, many=True)
        return Response(serializer.data)

#ALL LEAVES  (admin only)

    @action(detail=False, methods=['get'])
    def all_leaves(self, request):
        # The admin panel's Leave Requests tab and its approve/reject buttons
        # already existed, but there was no endpoint that returned anyone else's
        # leaves - so the admin only ever saw their own and could never find the
        # id needed by decide(). This is what makes that tab work.
        if not request.user.is_staff:
            return Response({"error": "Not authorized"}, status=403)

        leaves = (Leave.objects
                  .select_related('user', 'user__profile')
                  .order_by('-applied_on'))
        serializer = self.get_serializer(leaves, many=True)
        return Response(serializer.data)

#APPROVE / REJECT  (admin only)

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

        # Previously an approved leave could be silently flipped to rejected and
        # back, unlimited times, with no audit trail.
        if leave.status != 'pending':
            return Response(
                {"error": "This leave has already been %s." % leave.status},
                status=400
            )

        leave.status = decision
        leave.save()

        return Response({
            "message": f"Leave {decision}",
            "leave_id": leave.id,
            "status": leave.status,
        })
