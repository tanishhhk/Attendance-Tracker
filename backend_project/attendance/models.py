# attendance/models.py
from django.db import models
from django.contrib.auth.models import User

class Attendance(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    date = models.DateField()
    check_in = models.DateTimeField(null=True, blank=True)
    check_out = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20)  # present, late, absent
    work_duration = models.DurationField(null=True, blank=True)
    total_break_time = models.DurationField(null=True, blank=True)

    class Meta:
        unique_together = ('user', 'date')  # prevents duplicate rows

    def __str__(self):
        return f"{self.user} - {self.date}"

class Break(models.Model):
    attendance = models.ForeignKey(Attendance, related_name='breaks', on_delete=models.CASCADE)
    start = models.DateTimeField()
    end = models.DateTimeField(null=True, blank=True)
    duration = models.IntegerField(null=True, blank=True)  # seconds — nullable now
