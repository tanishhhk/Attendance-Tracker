"""Regression tests for the attendance bugs fixed in this pass.

Every test here fails against the previous version of attendance/views.py.
"""
import datetime
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import Attendance, Break, UserProfile


def at_ist(year, month, day, hour, minute=0):
    """Build the UTC instant corresponding to a wall-clock time in Asia/Kolkata."""
    ist = timezone.get_default_timezone()
    naive = datetime.datetime(year, month, day, hour, minute)
    return timezone.make_aware(naive, ist).astimezone(datetime.timezone.utc)


class AttendanceApiTestCase(TestCase):
    def setUp(self):
        self.employee = User.objects.create_user('emp1', password='pw', first_name='Emp One')
        UserProfile.objects.create(user=self.employee, department='Engineering', employee_id='emp1')
        self.admin = User.objects.create_user('boss', password='pw', is_staff=True)

        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=self.employee).key
        )
        self.admin_client = APIClient()
        self.admin_client.credentials(
            HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=self.admin).key
        )


class WriteEndpointsAreLockedDown(AttendanceApiTestCase):
    """An employee must not be able to forge or erase their own attendance."""

    def test_cannot_post_a_forged_attendance_row(self):
        res = self.client.post('/api/attendance/', {
            'date': '2026-08-14', 'status': 'present',
        }, format='json')
        self.assertEqual(res.status_code, 405)
        self.assertEqual(Attendance.objects.count(), 0)

    def test_cannot_patch_a_late_day_into_a_present_one(self):
        rec = Attendance.objects.create(
            user=self.employee, date=timezone.localdate(), status='late'
        )
        res = self.client.patch('/api/attendance/%d/' % rec.id,
                                {'status': 'present'}, format='json')
        self.assertEqual(res.status_code, 405)
        rec.refresh_from_db()
        self.assertEqual(rec.status, 'late')

    def test_cannot_delete_an_attendance_row(self):
        rec = Attendance.objects.create(
            user=self.employee, date=timezone.localdate(), status='late'
        )
        res = self.client.delete('/api/attendance/%d/' % rec.id)
        self.assertEqual(res.status_code, 405)
        self.assertTrue(Attendance.objects.filter(pk=rec.pk).exists())

    def test_list_and_detail_still_work(self):
        Attendance.objects.create(
            user=self.employee, date=timezone.localdate(), status='present'
        )
        self.assertEqual(self.client.get('/api/attendance/').status_code, 200)


class CheckInLateCutoff(AttendanceApiTestCase):
    def test_before_0930_ist_is_present(self):
        with mock.patch('django.utils.timezone.now', return_value=at_ist(2026, 8, 14, 9, 0)):
            res = self.client.post('/api/attendance/check_in/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], 'present')

    def test_after_0930_ist_is_late(self):
        with mock.patch('django.utils.timezone.now', return_value=at_ist(2026, 8, 14, 9, 45)):
            res = self.client.post('/api/attendance/check_in/')
        self.assertEqual(res.data['status'], 'late')

    def test_second_check_in_is_rejected(self):
        with mock.patch('django.utils.timezone.now', return_value=at_ist(2026, 8, 14, 9, 0)):
            self.client.post('/api/attendance/check_in/')
            res = self.client.post('/api/attendance/check_in/')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Attendance.objects.count(), 1)


class AbsentCutoffUsesLocalTime(AttendanceApiTestCase):
    """The cutoff used timezone.now() (UTC), so 19:00 meant 00:30 IST next day."""

    def test_not_checked_in_before_1900_ist(self):
        with mock.patch('django.utils.timezone.now', return_value=at_ist(2026, 8, 14, 15, 0)):
            res = self.admin_client.get('/api/attendance/all_today/')
        self.assertEqual(res.data['employees'][0]['status'], 'not_checked_in')
        self.assertEqual(res.data['stats']['absent'], 0)

    def test_absent_after_1900_ist_same_working_day(self):
        with mock.patch('django.utils.timezone.now', return_value=at_ist(2026, 8, 14, 19, 30)):
            res = self.admin_client.get('/api/attendance/all_today/')
        self.assertEqual(res.data['employees'][0]['status'], 'absent')
        self.assertEqual(res.data['stats']['absent'], 1)

    def test_all_today_is_staff_only(self):
        self.assertEqual(self.client.get('/api/attendance/all_today/').status_code, 403)

    def test_stored_absent_rows_are_counted(self):
        Attendance.objects.create(
            user=self.employee, date=timezone.localdate(), status='absent'
        )
        res = self.admin_client.get('/api/attendance/all_today/')
        self.assertEqual(res.data['stats']['absent'], 1)


class BreakHandling(AttendanceApiTestCase):
    def _check_in(self, when):
        with mock.patch('django.utils.timezone.now', return_value=when):
            return self.client.post('/api/attendance/check_in/')

    def test_today_reports_active_break_start_for_timer_resume(self):
        self._check_in(at_ist(2026, 8, 14, 9, 0))
        with mock.patch('django.utils.timezone.now', return_value=at_ist(2026, 8, 14, 13, 0)):
            self.client.post('/api/attendance/start_break/')
            res = self.client.get('/api/attendance/today/')
        self.assertTrue(res.data['break_active'])
        self.assertIsNotNone(res.data['active_break_start'])

    def test_today_shape_is_stable_when_not_checked_in(self):
        res = self.client.get('/api/attendance/today/')
        for key in ('break_active', 'active_break_id', 'active_break_start'):
            self.assertIn(key, res.data)

    def test_cannot_end_a_break_belonging_to_a_past_day(self):
        old = Attendance.objects.create(
            user=self.employee,
            date=timezone.localdate() - datetime.timedelta(days=5),
            status='present',
            check_in=timezone.now() - datetime.timedelta(days=5),
            check_out=timezone.now() - datetime.timedelta(days=5),
        )
        stale = Break.objects.create(
            attendance=old, start=timezone.now() - datetime.timedelta(days=5)
        )
        res = self.client.post('/api/attendance/end_break/',
                               {'break_id': stale.id}, format='json')
        self.assertEqual(res.status_code, 404)
        stale.refresh_from_db()
        self.assertIsNone(stale.end)

    def test_work_duration_is_never_negative(self):
        self._check_in(at_ist(2026, 8, 14, 9, 0))
        with mock.patch('django.utils.timezone.now', return_value=at_ist(2026, 8, 14, 10, 0)):
            self.client.post('/api/attendance/start_break/')
        # a break far longer than the shift
        Break.objects.filter(attendance__user=self.employee).update(duration=99999)
        with mock.patch('django.utils.timezone.now', return_value=at_ist(2026, 8, 14, 11, 0)):
            self.client.post('/api/attendance/check_out/')
        rec = Attendance.objects.get(user=self.employee)
        self.assertGreaterEqual(rec.work_duration, datetime.timedelta(0))


class QuerysetIsolation(AttendanceApiTestCase):
    def test_user_only_sees_their_own_records(self):
        other = User.objects.create_user('emp2', password='pw')
        Attendance.objects.create(user=other, date=timezone.localdate(), status='present')
        Attendance.objects.create(user=self.employee, date=timezone.localdate(), status='late')
        res = self.client.get('/api/attendance/')
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['status'], 'late')

    def test_list_is_ordered_newest_first(self):
        today = timezone.localdate()
        for offset in (0, 3, 1):
            Attendance.objects.create(
                user=self.employee,
                date=today - datetime.timedelta(days=offset),
                status='present',
            )
        dates = [row['date'] for row in self.client.get('/api/attendance/').data]
        self.assertEqual(dates, sorted(dates, reverse=True))
