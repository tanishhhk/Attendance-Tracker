from rest_framework import serializers
from .models import Leave


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
            'applied_on',
        ]
        read_only_fields = ['status', 'applied_on']