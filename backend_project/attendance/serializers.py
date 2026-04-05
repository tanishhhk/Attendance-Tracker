from rest_framework import serializers
from .models import Attendance, Break


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