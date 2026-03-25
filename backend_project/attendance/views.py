from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from .models import Attendance
from .serializers import AttendanceSerializer
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from datetime import timedelta
from .models import Attendance, Break

class AttendanceViewSet(ModelViewSet):

    queryset = Attendance.objects.all()
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Attendance.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'])
    def check_in(self, request):
        today = timezone.now().date()

        attendance, created = Attendance.objects.get_or_create(
            user=request.user,
            date=today
        )

        if attendance.check_in:
            return Response({"error": "Already checked in"}, status=400)

        now = timezone.now()

        cutoff = now.replace(hour=10, minute=10, second=0)
        attendance.check_in = now
        attendance.status = 'late' if now > cutoff else 'present'
        attendance.save()

        return Response({"message": "Checked in successfully"})
    
    @action(detail=False, methods=['post'])
    def check_out(self, request):
        today = timezone.now().date()

        try:
            attendance = Attendance.objects.get(user=request.user, date=today)
        except Attendance.DoesNotExist:
            return Response({"error": "No check-in found"}, status=404)

        if attendance.check_out:
            return Response({"error": "Already checked out"}, status=400)

        now = timezone.now()
        attendance.check_out = now

        duration = now - attendance.check_in
        attendance.work_duration = duration

        attendance.save()

        return Response({"message": "Checked out successfully"})
    
    @action(detail=False, methods=['post'])
    def start_break(self, request):
        today = timezone.now().date()

        attendance = Attendance.objects.get(user=request.user, date=today)

        br = Break.objects.create(
            attendance=attendance,
            start=timezone.now()
        )

        return Response({"break_id": br.id})
    
    @action(detail=False, methods=['post'])
    def end_break(self, request):
        break_id = request.data.get('break_id')

        try:
            br = Break.objects.get(id=break_id)
        except Break.DoesNotExist:
            return Response({"error": "Break not found"}, status=404)

        br.end = timezone.now()
        br.duration = int((br.end - br.start).total_seconds())
        br.save()

        # update total break time
        attendance = br.attendance
        total = sum([b.duration for b in attendance.breaks.all() if b.duration])
        attendance.total_break_time = timedelta(seconds=total)
        attendance.save()

        return Response({"message": "Break ended"})