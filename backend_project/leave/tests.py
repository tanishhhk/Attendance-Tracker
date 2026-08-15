"""Regression tests for the leave-approval workflow.

The approve/reject UI and the staff-only decide endpoint both already existed,
but no endpoint returned anyone else's leaves, so the workflow was unreachable.
"""
import datetime

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from attendance.models import UserProfile
from .models import Leave


class LeaveApiTestCase(TestCase):
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

    def make_leave(self, status='pending', user=None, days=1):
        today = timezone.localdate()
        return Leave.objects.create(
            user=user or self.employee,
            leave_type='Sick Leave',
            from_date=today,
            to_date=today + datetime.timedelta(days=days - 1),
            reason='flu',
            status=status,
        )


class AdminCanSeeEveryonesLeaves(LeaveApiTestCase):
    def test_all_leaves_returns_other_users_requests(self):
        self.make_leave()
        res = self.admin_client.get('/api/leaves/all_leaves/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['employee_name'], 'Emp One')
        self.assertEqual(res.data[0]['department'], 'Engineering')

    def test_all_leaves_is_staff_only(self):
        self.assertEqual(self.client.get('/api/leaves/all_leaves/').status_code, 403)

    def test_my_leaves_still_scopes_to_the_caller(self):
        other = User.objects.create_user('emp2', password='pw')
        self.make_leave(user=other)
        self.make_leave(user=self.employee)
        res = self.client.get('/api/leaves/my_leaves/')
        self.assertEqual(len(res.data), 1)

    def test_employee_without_profile_reports_a_placeholder_department(self):
        other = User.objects.create_user('emp2', password='pw')
        self.make_leave(user=other)
        res = self.admin_client.get('/api/leaves/all_leaves/')
        depts = [row['department'] for row in res.data]
        self.assertIn('-', depts)


class DecideGuards(LeaveApiTestCase):
    def test_admin_can_approve_a_pending_leave(self):
        leave = self.make_leave()
        res = self.admin_client.post('/api/leaves/%d/decide/' % leave.id,
                                     {'status': 'approved'}, format='json')
        self.assertEqual(res.status_code, 200)
        leave.refresh_from_db()
        self.assertEqual(leave.status, 'approved')

    def test_an_approved_leave_cannot_be_flipped_to_rejected(self):
        leave = self.make_leave(status='approved')
        res = self.admin_client.post('/api/leaves/%d/decide/' % leave.id,
                                     {'status': 'rejected'}, format='json')
        self.assertEqual(res.status_code, 400)
        leave.refresh_from_db()
        self.assertEqual(leave.status, 'approved')

    def test_employee_cannot_decide(self):
        leave = self.make_leave()
        res = self.client.post('/api/leaves/%d/decide/' % leave.id,
                               {'status': 'approved'}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_invalid_decision_is_rejected(self):
        leave = self.make_leave()
        res = self.admin_client.post('/api/leaves/%d/decide/' % leave.id,
                                     {'status': 'maybe'}, format='json')
        self.assertEqual(res.status_code, 400)


class MutationAfterDecisionIsBlocked(LeaveApiTestCase):
    def test_cannot_extend_an_approved_leave(self):
        leave = self.make_leave(status='approved')
        res = self.client.patch('/api/leaves/%d/' % leave.id,
                                {'to_date': '2026-12-31'}, format='json')
        self.assertEqual(res.status_code, 403)
        leave.refresh_from_db()
        self.assertNotEqual(str(leave.to_date), '2026-12-31')

    def test_cannot_delete_an_approved_leave(self):
        leave = self.make_leave(status='approved')
        res = self.client.delete('/api/leaves/%d/' % leave.id)
        self.assertEqual(res.status_code, 403)
        self.assertTrue(Leave.objects.filter(pk=leave.pk).exists())

    def test_pending_leave_can_still_be_edited(self):
        leave = self.make_leave()
        new_to = str(timezone.localdate() + datetime.timedelta(days=3))
        res = self.client.patch('/api/leaves/%d/' % leave.id,
                                {'to_date': new_to}, format='json')
        self.assertEqual(res.status_code, 200)


class ServerSideDateValidation(LeaveApiTestCase):
    def test_reversed_date_range_is_rejected(self):
        today = timezone.localdate()
        res = self.client.post('/api/leaves/apply/', {
            'leave_type': 'Sick Leave',
            'from_date':  str(today + datetime.timedelta(days=5)),
            'to_date':    str(today),
            'reason':     'flu',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('to_date', res.data)
        self.assertEqual(Leave.objects.count(), 0)

    def test_valid_range_is_accepted_and_starts_pending(self):
        today = timezone.localdate()
        res = self.client.post('/api/leaves/apply/', {
            'leave_type': 'Sick Leave',
            'from_date':  str(today),
            'to_date':    str(today + datetime.timedelta(days=2)),
            'reason':     'flu',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(Leave.objects.get().status, 'pending')

    def test_status_cannot_be_forced_through_apply(self):
        today = timezone.localdate()
        self.client.post('/api/leaves/apply/', {
            'leave_type': 'Sick Leave',
            'from_date':  str(today),
            'to_date':    str(today),
            'reason':     'flu',
            'status':     'approved',
        }, format='json')
        self.assertEqual(Leave.objects.get().status, 'pending')
