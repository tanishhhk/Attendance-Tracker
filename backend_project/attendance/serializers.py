from rest_framework import serializers
from .models import Attendance,Break, Leave


class BreakSerializer(serializers.ModelSerializer):
    class Meta:
        model = Break
        fields = ['id', 'start', 'end', 'duration']

class AttendanceSerializer(serializers.ModelSerializer):
    breaks = BreakSerializer(many=True, read_only=True)

    class Meta:
        model = Attendance
        fields = [
            'id',
            'date',
            'check_in',
            'check_out',
            'status',
            'work_duration',
            'total_break_time',
            'breaks'
        ]

class LeaveSerializer(serializers.ModelSerializer):
    class Meta:
        model = Leave
        fields = [
            'id',
            'leave_type',
            'from_date',
            'to_date',
            'reason',
            'status',
            'applied_on'
        ]