app.service('AttendanceService', function($http) {

    var BASE = 'http://127.0.0.1:8000/api';

    // Guarded: an unguarded 'Token ' + null sent the literal string "Token null",
    // which DRF rejects as 401 instead of treating the call as anonymous.
    function authHeader() {
        var token = localStorage.getItem('auth_token');
        return token ? { 'Authorization': 'Token ' + token } : {};
    }

    // AUTH
    this.login = function(username, password) {
        return $http.post(BASE + '/login/', { username: username, password: password });
    };
    this.saveToken  = function(token) { localStorage.setItem('auth_token', token); };
    this.getToken   = function()      { return localStorage.getItem('auth_token'); };
    this.isLoggedIn = function()      { return !!localStorage.getItem('auth_token'); };
    this.logout     = function()      {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('currentUser');
    };

    // ATTENDANCE
this.checkIn  = function() { return $http.post(BASE + '/attendance/check_in/',  {}, { headers: authHeader() }); };
this.checkOut = function() { return $http.post(BASE + '/attendance/check_out/', {}, { headers: authHeader() }); };
this.getToday = function() { return $http.get(BASE  + '/attendance/today/',         { headers: authHeader() }); };
this.getStats = function() { return $http.get(BASE  + '/attendance/stats/',         { headers: authHeader() }); };
this.getAttendance = function() { return $http.get(BASE + '/attendance/',           { headers: authHeader() }); };
this.startBreak = function() { return $http.post(BASE + '/attendance/start_break/', {}, { headers: authHeader() }); };
this.endBreak = function(breakId) { return $http.post(BASE + '/attendance/end_break/', { break_id: breakId }, { headers: authHeader() }); };
this.getAllToday = function() { return $http.get(BASE + '/attendance/all_today/', { headers: authHeader() }); };

    // EMPLOYEES
    this.getEmployees = function() {
        return $http.get(BASE + '/employees/', { headers: authHeader() });
    };
    this.createEmployee = function(data) {
        return $http.post(BASE + '/employees/create/', data, { headers: authHeader() });
    };

    this.deleteEmployee = function(id) {
    return $http.delete(BASE + '/employees/' + id + '/delete/', {
        headers: authHeader()
    });
};

// LEAVES
this.applyLeave = function(leaveData) {
    return $http.post(BASE + '/leaves/apply/', leaveData, { headers: authHeader() });
};
this.getMyLeaves = function() {
    return $http.get(BASE + '/leaves/my_leaves/', { headers: authHeader() });
};
// Admin-only: every employee's requests. The admin panel used to call
// getMyLeaves() here, so it only ever saw the admin's own leaves.
this.getAllLeaves = function() {
    return $http.get(BASE + '/leaves/all_leaves/', { headers: authHeader() });
};
this.decideLeave = function(leaveId, decision) {
    return $http.post(BASE + '/leaves/' + leaveId + '/decide/', { status: decision }, { headers: authHeader() });
};
});

// Shared error-message extraction. $http rejects with data === null on network,
// CORS and timeout failures, so err.data.error threw a TypeError and hid the
// real problem. DRF's own errors use `detail`, not `error`.
app.factory('apiError', function() {
    return function(err, fallback) {
        if (!err || !err.data) {
            if (err && err.status === -1) {
                return 'Cannot reach the server. Is it running on 127.0.0.1:8000?';
            }
            return fallback;
        }
        if (typeof err.data === 'string') { return err.data || fallback; }
        if (err.data.error)  { return err.data.error; }
        if (err.data.detail) { return err.data.detail; }
        // DRF field-validation errors: {"to_date": ["End date cannot be ..."]}
        var firstKey = Object.keys(err.data)[0];
        if (firstKey) {
            var val = err.data[firstKey];
            return angular.isArray(val) ? val[0] : String(val);
        }
        return fallback;
    };
});

app.config(function($httpProvider) {
    $httpProvider.defaults.withCredentials = false;

    // Without this a stale/revoked token left every request 401ing silently:
    // isLoggedIn() still saw a token in localStorage, so the user sat on a blank
    // dashboard full of zeros with no error and no way out.
    // Injects $window/$q only - depending on AttendanceService here would be a
    // circular dependency ($http -> interceptor -> service -> $http).
    $httpProvider.interceptors.push(function($q, $window) {
        return {
            responseError: function(rejection) {
                if (rejection.status === 401 &&
                    $window.location.pathname.indexOf('login.html') === -1) {
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('currentUser');
                    $window.location.href = 'login.html';
                }
                return $q.reject(rejection);
            }
        };
    });
});
