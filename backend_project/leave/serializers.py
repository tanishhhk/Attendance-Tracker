from rest_framework import serializers
from .models import Leave


class LeaveSerializer(serializers.ModelSerializer):
    # Without these the admin panel has no way to tell whose leave it is
    # reviewing, so it used to label every row with the logged-in admin's name.
    employee_name = serializers.SerializerMethodField()
    department    = serializers.SerializerMethodField()

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
            'employee_name',
            'department',
        ]
        read_only_fields = ['status', 'applied_on']

    def get_employee_name(self, obj):
        return obj.user.get_full_name() or obj.user.username

    def get_department(self, obj):
        profile = getattr(obj.user, 'profile', None)
        return profile.department if profile and profile.department else '-'

    def validate(self, attrs):
        # The only place this was enforced was attendanceCtrl.js, i.e. client
        # side and trivially bypassable with curl. A reversed range also makes
        # the admin table's day count go negative.
        from_date = attrs.get('from_date', getattr(self.instance, 'from_date', None))
        to_date   = attrs.get('to_date',   getattr(self.instance, 'to_date', None))

        if from_date and to_date and to_date < from_date:
            raise serializers.ValidationError(
                {"to_date": "End date cannot be before start date."}
            )
        return attrs
