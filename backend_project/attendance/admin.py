from django.contrib import admin
from .models import Attendance, Break, UserProfile

# Attendance and Break were imported but never registered, so the Django admin
# was the one place an admin could correct a record and it showed nothing.
admin.site.register(Attendance)
admin.site.register(Break)
admin.site.register(UserProfile)
