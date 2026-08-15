"""Regression tests for auth and employee management."""
import datetime
from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from attendance.models import UserProfile


class CoreApiTestCase(TestCase):
    def setUp(self):
        self.employee = User.objects.create_user('emp1', password='pw')
        self.admin = User.objects.create_user('boss', password='pw', is_staff=True)

        self.anon = APIClient()
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=self.employee).key
        )
        self.admin_client = APIClient()
        self.admin_client.credentials(
            HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=self.admin).key
        )


class LoginView(CoreApiTestCase):
    def test_valid_credentials_return_a_token_and_role(self):
        res = self.anon.post('/api/login/',
                             {'username': 'boss', 'password': 'pw'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['token'])
        self.assertTrue(res.data['is_staff'])

    def test_bad_credentials_return_401(self):
        res = self.anon.post('/api/login/',
                             {'username': 'boss', 'password': 'nope'}, format='json')
        self.assertEqual(res.status_code, 401)

    def test_inactive_user_cannot_log_in(self):
        User.objects.filter(pk=self.employee.pk).update(is_active=False)
        res = self.anon.post('/api/login/',
                             {'username': 'emp1', 'password': 'pw'}, format='json')
        self.assertEqual(res.status_code, 401)


class EmployeeManagement(CoreApiTestCase):
    def test_create_requires_staff(self):
        res = self.client.post('/api/employees/create/',
                               {'username': 'new1', 'password': 'pw'}, format='json')
        self.assertEqual(res.status_code, 403)

    def test_create_makes_user_and_profile(self):
        res = self.admin_client.post('/api/employees/create/', {
            'username': 'new1', 'password': 'pw',
            'first_name': 'New One', 'department': 'Sales',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        user = User.objects.get(username='new1')
        self.assertEqual(user.profile.department, 'Sales')

    def test_profile_failure_does_not_leave_an_orphaned_user(self):
        """Without transaction.atomic the User survived and the username was
        then permanently unusable, because the retry hit 'already exists'."""
        with mock.patch.object(
            UserProfile.objects, 'create', side_effect=RuntimeError('boom')
        ):
            with self.assertRaises(RuntimeError):
                self.admin_client.post('/api/employees/create/', {
                    'username': 'new1', 'password': 'pw',
                }, format='json')

        self.assertFalse(User.objects.filter(username='new1').exists())

        # the username is still free, so the retry succeeds
        res = self.admin_client.post('/api/employees/create/',
                                     {'username': 'new1', 'password': 'pw'}, format='json')
        self.assertEqual(res.status_code, 201)

    def test_list_requires_staff(self):
        self.assertEqual(self.client.get('/api/employees/').status_code, 403)

    def test_list_excludes_staff_accounts(self):
        res = self.admin_client.get('/api/employees/')
        usernames = [row['username'] for row in res.data]
        self.assertIn('emp1', usernames)
        self.assertNotIn('boss', usernames)

    def test_joined_date_is_rendered_in_project_timezone(self):
        """date_joined is stored UTC; formatting it raw showed evening sign-ups
        as the previous day under Asia/Kolkata."""
        utc_evening = datetime.datetime(2026, 8, 14, 20, 0,
                                        tzinfo=datetime.timezone.utc)  # 01:30 IST on the 15th
        User.objects.filter(pk=self.employee.pk).update(date_joined=utc_evening)
        res = self.admin_client.get('/api/employees/')
        row = next(r for r in res.data if r['username'] == 'emp1')
        self.assertEqual(row['joined'], '2026-08-15')

    def test_delete_requires_staff(self):
        res = self.client.delete('/api/employees/%d/delete/' % self.employee.id)
        self.assertEqual(res.status_code, 403)

    def test_admin_cannot_delete_another_staff_account(self):
        other_admin = User.objects.create_user('boss2', password='pw', is_staff=True)
        res = self.admin_client.delete('/api/employees/%d/delete/' % other_admin.id)
        self.assertEqual(res.status_code, 404)
        self.assertTrue(User.objects.filter(pk=other_admin.pk).exists())


class Routing(CoreApiTestCase):
    def test_site_root_is_reachable(self):
        """home used to be mounted under api/, leaving / as a 404."""
        self.assertEqual(self.anon.get('/').status_code, 200)

    def test_authenticated_endpoints_reject_anonymous_callers(self):
        for url in ('/api/employees/', '/api/attendance/today/', '/api/leaves/my_leaves/'):
            self.assertEqual(self.anon.get(url).status_code, 401, url)
