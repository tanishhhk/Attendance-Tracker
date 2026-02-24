var app = angular.module('djuboAttendanceApp', []);

app.directive('autoFocus', function($timeout) {
    return {
        restrict: 'A',
        link: function(scope, el) { $timeout(function() { el[0].focus(); }); }
    };
});

app.controller('AuthController', function($scope, $window) {
    var vm = this;

    vm.credentials = { employeeId: '', password: '' };

    // ── MOMENT.JS ── Greeting + date on login page
    vm.greeting = (function() {
        var h = moment().hour();
        return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
    })();
    vm.todayDisplay = moment().format('dddd, MMMM Do YYYY');

    vm.login = function() {
        var users = JSON.parse(localStorage.getItem('djuboUsers') || '[]');

        // ── UNDERSCORE.JS ── _.find for credential match
        var user = _.find(users, function(u) {
            return u.employeeId === vm.credentials.employeeId && u.password === vm.credentials.password;
        });

        if (user) {
            // ── MOMENT.JS ── Stamp last login time
            user.lastLogin = moment().format('YYYY-MM-DD HH:mm:ss');
            // Persist updated lastLogin back to the users list
            var idx = _.findIndex(users, { employeeId: user.employeeId });
            if (idx > -1) users[idx] = user;
            localStorage.setItem('djuboUsers', JSON.stringify(users));
            localStorage.setItem('currentUser', JSON.stringify(user));
            $window.location.href = 'index.html';
        } else {
            alert('Invalid credentials. Please contact your admin.');
        }
    };

    // ── Seed demo accounts only when localStorage is empty ──
    var users = JSON.parse(localStorage.getItem('djuboUsers') || '[]');
    if (users.length === 0) {
        // ── UNDERSCORE.JS ── _.map to build demo list cleanly
        var demoUsers = _.map([
            { name: 'John Doe',    employeeId: 'EMP001', department: 'Engineering', email: 'john@djubo.com',  password: 'password123', role: 'employee' },
            { name: 'Jane Smith',  employeeId: 'EMP002', department: 'Marketing',   email: 'jane@djubo.com',  password: 'password123', role: 'employee' },
            { name: 'Bob Johnson', employeeId: 'EMP003', department: 'Sales',       email: 'bob@djubo.com',   password: 'password123', role: 'employee' },
            { name: 'Admin User',  employeeId: 'ADMIN',  department: 'Management',  email: 'admin@djubo.com', password: 'admin123',    role: 'admin'    }
        ], function(u) {
            // ── MOMENT.JS ── Demo employees joined today
            return _.extend({}, u, { createdAt: moment().format('YYYY-MM-DD HH:mm:ss') });
        });
        localStorage.setItem('djuboUsers', JSON.stringify(demoUsers));
    }
});