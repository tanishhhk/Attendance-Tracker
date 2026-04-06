app.service('AttendanceService', function($http) {

    var BASE = 'http://127.0.0.1:8000/api';

    function authHeader() {
        var token = localStorage.getItem('auth_token');
        return { 'Authorization': 'Token ' + token };
    }

    // AUTH
    this.login = function(username, password) {
        return $http.post(BASE + '/login/', { username: username, password: password });
    };
    this.saveToken  = function(token) { localStorage.setItem('auth_token', token); };
    this.getToken   = function()      { return localStorage.getItem('auth_token'); };
    this.isLoggedIn = function()      { return !!localStorage.getItem('auth_token'); };
    this.logout     = function()      { localStorage.removeItem('auth_token'); };

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
this.decideLeave = function(leaveId, decision) {
    return $http.post(BASE + '/leaves/' + leaveId + '/decide/', { status: decision }, { headers: authHeader() });
};
});

app.config(function($httpProvider) {
    $httpProvider.defaults.withCredentials = false;
});