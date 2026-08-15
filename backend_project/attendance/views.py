# attendance/views.py
from rest_framework.viewsets import ReadOnlyModelViewSet
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth.models import User
from django.db import IntegrityError
from django.utils import timezone
from datetime import timedelta
from .models import Attendance, Break, UserProfile
from .serializers import AttendanceSerializer


LATE_CUTOFF_HOUR = 9
LATE_CUTOFF_MINUTE = 30

# After this local hour, an employee who never checked in counts as absent.
ABSENT_CUTOFF_HOUR = 19


# Read-only on purpose: attendance rows are produced solely by the check_in /
# check_out / break actions below. A full ModelViewSet exposed create/update/
# destroy, which let any employee POST their own {"status": "present"} row or
# DELETE a late day, bypassing the whole late-detection state machine.
class AttendanceViewSet(ReadOnlyModelViewSet):
    serializer_class = AttendanceSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # each user only sees their own attendance; newest first so the list is
        # deterministic instead of database-order dependent
        return Attendance.objects.filter(user=self.request.user).order_by('-date')

    @action(detail=False, methods=['post']) 
    def check_in(self, request): #checkin feature
        today = timezone.localdate()

        if Attendance.objects.filter(user=request.user, date=today, check_in__isnull=False).exists(): #check_in_isnull is done to check if already checked in or not
            return Response({"error": "Already checked in today"}, status=400)

        now = timezone.localtime()  #fetch local ist timezone
        cutoff = now.replace(hour=LATE_CUTOFF_HOUR, minute=LATE_CUTOFF_MINUTE,
                             second=0, microsecond=0)
        attendance_status = 'late' if now > cutoff else 'present'

        # unique_together('user','date') means two concurrent check-in POSTs (the
        # button is not debounced client-side) can race past the exists() check
        # above; catch the loser instead of returning a 500.
        try:
            attendance, _ = Attendance.objects.get_or_create(
                user=request.user,
                date=today,
                defaults={
                    'check_in': now,
                    'status': attendance_status,
                }
            )
        except IntegrityError:
            return Response({"error": "Already checked in today"}, status=400)

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
            return Response({"error": "You haven't checked in yet"}, status=400) #to check if user has checked in

        if attendance.check_out:
            return Response({"error": "Already checked out"}, status=400) #to check if a checkout record already exists?

        now = timezone.localtime()

#close any open break automatically
        open_break = attendance.breaks.filter(end__isnull=True).first()
        if open_break:
            open_break.end = now
            open_break.duration = max(0, int((open_break.end - open_break.start).total_seconds()))
            open_break.save()

        attendance.check_out = now

#recalculate total break time
        total_break_seconds = sum(
            b.duration for b in attendance.breaks.all() if b.duration is not None
        )
        attendance.total_break_time = timedelta(seconds=total_break_seconds)

#net work duration = total time minus breaks, never negative
        gross_duration = now - attendance.check_in
        attendance.work_duration = max(
            timedelta(0), gross_duration - attendance.total_break_time
        )

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
            start=timezone.localtime()
        )

        return Response({
            "message": "Break started",
            "break_id": br.id,
            "start": br.start,
        })

#END BREAK
    @action(detail=False, methods=['post'])
    def end_break(self, request):
        break_id = request.data.get('break_id')

        if not break_id:
            return Response({"error": "break_id is required"}, status=400)

        # Constrain to today's still-open record: without the date/check_out
        # filter a user could pass a break_id from any past day and rewrite that
        # day's total_break_time.
        try:
            br = Break.objects.get(
                id=break_id,
                attendance__user=request.user,
                attendance__date=timezone.localdate(),
                attendance__check_out__isnull=True,
            )
        except Break.DoesNotExist:
            return Response({"error": "Break not found"}, status=404)

        if br.end:
            return Response({"error": "Break already ended"}, status=400)

        br.end = timezone.localtime()
        br.duration = max(0, int((br.end - br.start).total_seconds()))
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

#TODAY STATUS
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
                "active_break_id": None,
                "active_break_start": None,
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
            # needed so the client can resume the break timer after a reload
            "active_break_start": open_break.start if open_break else None,
        })

#STATS                                                               

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

        today = timezone.localdate()
        # localtime(), not now(): timezone.now() is UTC, so .replace(hour=19)
        # built 19:00 UTC == 00:30 IST the *next* day. Nobody was ever marked
        # absent during the working day and the admin's absent counter stuck at 0.
        now = timezone.localtime()
        cutoff_absent = now.replace(hour=ABSENT_CUTOFF_HOUR, minute=0,
                                    second=0, microsecond=0)

        employees = User.objects.filter(is_staff=False)
        records = {
            a.user_id: a
            for a in Attendance.objects.filter(user__in=employees, date=today)
        }
        profiles = {
            p.user_id: p for p in UserProfile.objects.filter(user__in=employees)
        }

        data = []
        present = 0
        absent  = 0
        late    = 0
        total   = 0

        for emp in employees:
            total += 1
            record = records.get(emp.id)
            profile = profiles.get(emp.id)

            if record:
                emp_status = record.status
                if   emp_status == 'present': present += 1
                elif emp_status == 'late':    late    += 1
                elif emp_status == 'absent':  absent  += 1
            elif now >= cutoff_absent:
                emp_status = 'absent'
                absent += 1
            else:
                emp_status = 'not_checked_in'

            data.append({
                "id":        emp.id,
                "name":      emp.get_full_name() or emp.username,
                "username":  emp.username,
                "department": profile.department if profile else '-',
                "status":    emp_status,
                "check_in":  record.check_in  if record else None,
                "check_out": record.check_out if record else None,
            })

        return Response({
            "employees": data,
            "stats": {
                "total":   total,
                "present": present,
                "absent":  absent,
                "late":    late,
            }
        })