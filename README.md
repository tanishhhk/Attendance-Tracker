# Attendance Tracker

An attendance-management application with a Django REST Framework backend and a legacy AngularJS static frontend. It supports token-based login, check-in/check-out, break tracking, attendance history, leave requests, and staff-only employee/leave administration.

## Technology

- Backend: Python, Django, Django REST Framework, SQLite, token authentication
- Frontend: AngularJS 1.8, HTML, CSS, JavaScript, Highcharts
- API testing: regression tests in `backend_project/attendance/tests.py` plus app-specific Django test modules

## Repository layout

- `backend_project/`: Django project, API apps, migrations, and tests
- `frontend/index.html`, `frontend/routes.js`, `frontend/static/`: AngularJS frontend assets
- `postman/` and `.postman/`: API request collections/configuration where present

## Run the backend locally

Python 3.10+ recommended.

```bash
git clone https://github.com/tanishhhk/Attendance-Tracker.git
cd Attendance-Tracker/backend_project
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

From the `backend_project/` directory, optionally copy `.env.example` to `.env`. On local development the app generates a temporary secret key if `DJANGO_SECRET_KEY` is absent; that key changes across process restarts. Do not use the local fallback for a shared or deployed instance.

Run migrations and start Django:

```bash
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

The API runs at <http://127.0.0.1:8000/>. The Django admin is at <http://127.0.0.1:8000/admin/>.

## Run tests

```bash
python manage.py test
```

The attendance regression suite checks token-protected access, isolation between users, restrictions on forged attendance updates/deletes, the IST late/absence cutoffs, and break/check-out behavior.

## API overview

All application APIs are mounted under `/api/`.

| Area | Example endpoints | Access |
|---|---|---|
| Login | `POST /api/login/` | Public |
| Authentication check | `GET /api/test-auth/` | Authenticated |
| Attendance | `GET /api/attendance/`, `POST /api/attendance/check_in/`, `check_out/`, `start_break/`, `end_break/`, `today/` | Authenticated; records scoped to user |
| Leave | `/api/leaves/`, `POST /api/leaves/apply/`, `GET /api/leaves/my_leaves/` | Authenticated; own requests |
| Staff leave review | `GET /api/leaves/all_leaves/`, `POST /api/leaves/{id}/decide/` | Staff-only |
| Employee administration | `GET /api/employees/`, `POST /api/employees/create/`, `DELETE /api/employees/{id}/delete/` | Staff-only |

Authenticate using the token returned by `POST /api/login/`:

```
Authorization: Token <token>
```

## Frontend

The frontend uses legacy AngularJS scripts and static files; the repository does not currently have a frontend package manifest or a modern build pipeline. Open it through a local static web server rather than relying on file URLs, then configure the API base URL in the frontend service to match the backend host. Confirm and document the exact run command when the UI setup is standardized.

## Deployment and security notes

Before a public deployment:

1. Set `DJANGO_DEBUG=false`.
2. Set a strong, stable `DJANGO_SECRET_KEY` outside source control.
3. Set `DJANGO_ALLOWED_HOSTS` to the precise deployment hostnames.
4. Configure `DJANGO_CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS` to the actual frontend origin.
5. Use HTTPS and verify proxy/SSL settings on the chosen hosting platform.
6. Use persistent database storage and back up attendance data. SQLite is configured as the default for local development.
7. Run migrations and `python manage.py check --deploy` in the deployment environment.

The old development secret is no longer hard-coded in the settings file. If the old value was ever used by a deployed/shared instance, rotate it there as well. This repo has not been presented as a security-audited production service.

## License

No license is currently specified.
