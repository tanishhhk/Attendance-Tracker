# attendance/views.py
from rest_framework.viewsets import ModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from datetime import timedelta
from .models import Attendance, Break
from .serializers import AttendanceSerializer


LATE_CUTOFF_HOUR = 9
LATE_CUTOFF_MINUTE = 30


class AttendanceViewSet(ModelViewSet):
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Attendance.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'])
    def check_in(self, request):
        today = timezone.localdate()

        if Attendance.objects.filter(user=request.user, date=today, check_in__isnull=False).exists():
            return Response({"error": "Already checked in today"}, status=400)

        now = timezone.localtime()  # ← localtime important hai IST ke liye
        cutoff = now.replace(hour=9, minute=30, second=0, microsecond=0)
        attendance_status = 'late' if now > cutoff else 'present'
        
        attendance, _ = Attendance.objects.get_or_create(
            user=request.user,
            date=today,
            defaults={
                'check_in': now,
                'status': attendance_status,
            }
        )

        if not attendance.check_in:
            attendance.check_in = now
            attendance.status = attendance_status
            attendance.save()

        return Response({
            "message": "Checked in successfully",
            "check_in": attendance.check_in,
            "status": attendance.status,
        })

    @action(detail=False, methods=['post'])
    def check_out(self, request):
        today = timezone.localdate()

        try:
            attendance = Attendance.objects.get(user=request.user, date=today)
        except Attendance.DoesNotExist:
            return Response({"error": "No check-in found for today"}, status=404)

        if not attendance.check_in:
            return Response({"error": "You haven't checked in yet"}, status=400)

        if attendance.check_out:
            return Response({"error": "Already checked out"}, status=400)

        # Close any open break automatically
        open_break = attendance.breaks.filter(end__isnull=True).first()
        if open_break:
            open_break.end = timezone.now()
            open_break.duration = int((open_break.end - open_break.start).total_seconds())
            open_break.save()

        now = timezone.now()
        attendance.check_out = now

        # Recalculate total break time
        total_break_seconds = sum(
            b.duration for b in attendance.breaks.all() if b.duration is not None
        )
        attendance.total_break_time = timedelta(seconds=total_break_seconds)

        # Net work duration = total time minus breaks
        gross_duration = now - attendance.check_in
        attendance.work_duration = gross_duration - attendance.total_break_time

        attendance.save()

        return Response({
            "message": "Checked out successfully",
            "check_out": attendance.check_out,
            "work_duration": str(attendance.work_duration),
            "total_break_time": str(attendance.total_break_time),
        })

    @action(detail=False, methods=['post'])
    def start_break(self, request):
        today = timezone.localdate()

        try:
            attendance = Attendance.objects.get(user=request.user, date=today)
        except Attendance.DoesNotExist:
            return Response({"error": "No check-in found for today"}, status=404)

        if not attendance.check_in:
            return Response({"error": "You haven't checked in yet"}, status=400)

        if attendance.check_out:
            return Response({"error": "Already checked out"}, status=400)

        # Guard: no open break already running
        if attendance.breaks.filter(end__isnull=True).exists():
            return Response({"error": "A break is already in progress"}, status=400)

        br = Break.objects.create(
            attendance=attendance,
            start=timezone.now()
        )

        return Response({
            "message": "Break started",
            "break_id": br.id,
            "start": br.start,
        })

    # ------------------------------------------------------------------ #
    #  END BREAK                                                           #
    # ------------------------------------------------------------------ #
    @action(detail=False, methods=['post'])
    def end_break(self, request):
        break_id = request.data.get('break_id')

        if not break_id:
            return Response({"error": "break_id is required"}, status=400)

        try:
            br = Break.objects.get(id=break_id, attendance__user=request.user)
        except Break.DoesNotExist:
            return Response({"error": "Break not found"}, status=404)

        if br.end:
            return Response({"error": "Break already ended"}, status=400)

        br.end = timezone.now()
        br.duration = int((br.end - br.start).total_seconds())
        br.save()

        # Update running total on attendance
        attendance = br.attendance
        total_break_seconds = sum(
            b.duration for b in attendance.breaks.all() if b.duration is not None
        )
        attendance.total_break_time = timedelta(seconds=total_break_seconds)
        attendance.save()

        return Response({
            "message": "Break ended",
            "duration_seconds": br.duration,
            "total_break_time": str(attendance.total_break_time),
        })

    # ------------------------------------------------------------------ #
    #  TODAY STATUS                                                        #
    # ------------------------------------------------------------------ #
    @action(detail=False, methods=['get'])
    def today(self, request):
        today = timezone.localdate()

        try:
            attendance = Attendance.objects.get(user=request.user, date=today)
        except Attendance.DoesNotExist:
            return Response({
                "date": today,
                "status": "not_checked_in",
                "check_in": None,
                "check_out": None,
                "work_duration": None,
                "total_break_time": None,
                "break_active": False,
            })

        open_break = attendance.breaks.filter(end__isnull=True).first()

        return Response({
            "date": attendance.date,
            "status": attendance.status,
            "check_in": attendance.check_in,
            "check_out": attendance.check_out,
            "work_duration": str(attendance.work_duration) if attendance.work_duration else None,
            "total_break_time": str(attendance.total_break_time) if attendance.total_break_time else None,
            "break_active": open_break is not None,
            "active_break_id": open_break.id if open_break else None,
        })

    # ------------------------------------------------------------------ #
    #  STATS                                                               #
    # ------------------------------------------------------------------ #
    @action(detail=False, methods=['get'])
    def stats(self, request):
        records = Attendance.objects.filter(user=request.user)

        total = records.count()
        present = records.filter(status='present').count()
        late = records.filter(status='late').count()
        absent = records.filter(status='absent').count()

        return Response({
            "total_days": total,
            "present": present,
            "late": late,
            "absent": absent,
        })
    
    @action(detail=False, methods=['get'])
    def all_today(self, request):
        if not request.user.is_staff:
            return Response({"error": "Not authorized"}, status=403)
        
        from django.contrib.auth.models import User
        from django.utils import timezone
        
        today = timezone.localdate()
        employees = User.objects.filter(is_staff=False)
        
        data = []
        present = 0
        absent  = 0
        late    = 0
        
        for emp in employees:
            record = Attendance.objects.filter(user=emp, date=today).first()
            if record:
                status = record.status
                if status == 'present': present += 1
                elif status == 'late':  late += 1
            else:
                status = 'not_checked_in'
            
            data.append({
                "id":        emp.id,
                "name":      emp.get_full_name() or emp.username,
                "username":  emp.username,
                "status":    status,
                "check_in":  record.check_in  if record else None,
                "check_out": record.check_out if record else None,
            })
        
        return Response({
            "employees": data,
            "stats": {
                "total":   employees.count(),
                "present": present,
                "absent":  employees.count() - present - late,  # jo check in nahi kiya
                "late":    late,
            }
        })