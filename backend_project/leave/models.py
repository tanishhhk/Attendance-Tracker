from django.db import models
from django.contrib.auth.models import User


class Leave(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    leave_type = models.CharField(max_length=50)
    from_date = models.DateField()
    to_date = models.DateField()
    reason = models.TextField()
    status = models.CharField(max_length=20, default='pending')
    applied_on = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user} - {self.leave_type} - {self.status}"