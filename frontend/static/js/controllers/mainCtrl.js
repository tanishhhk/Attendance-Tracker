app.controller('MainController', function($scope, $window, $interval, $location, AttendanceService) {
    var vm = this;

    var currentUser = localStorage.getItem('currentUser');
    if (!currentUser) { $window.location.href = 'login.html'; return; }

    vm.currentUser = JSON.parse(currentUser);
    vm.onBreak     = false;
    vm.breakTimer  = '00:00:00';
    vm.showProfile = false;
    vm.profileData = {};

    // MOMENT.JS Last login relative time in header
    vm.lastLoginDisplay = vm.currentUser.lastLogin
        ? 'Last login: ' + moment(vm.currentUser.lastLogin, 'YYYY-MM-DD HH:mm:ss').fromNow()
        : '';

    vm.loadProfileData = function() {
        var users = AttendanceService.getUsers();
        var user  = _.find(users, function(u) { return u.employeeId === vm.currentUser.employeeId; });
        if (user) {
            vm.profileData = _.extend(
                _.pick(user, 'name', 'employeeId', 'email', 'department', 'dob', 'phone', 'address', 'profilePicture'),
                { profilePicture: user.profilePicture || '' }
            );
        }
    };
    vm.loadProfileData();

    vm.openProfile  = function() { vm.loadProfileData(); vm.showProfile = true; };
    vm.closeProfile = function() { vm.showProfile = false; };
    vm.triggerFileUpload = function() { $('#profilePicture').click(); };

    $(document).ready(function() {
        $(document).on('change', '#profilePicture', function(e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(ev) {
                $scope.$apply(function() { vm.profileData.profilePicture = ev.target.result; });
            };
            reader.readAsDataURL(file);
        });
    });

    vm.saveProfile = function() {
        var users = AttendanceService.getUsers();
        var idx   = _.findIndex(users, { employeeId: vm.currentUser.employeeId });
        if (idx > -1) {
            users[idx] = _.extend(users[idx], {
                name: vm.profileData.name, email: vm.profileData.email,
                department: vm.profileData.department, dob: vm.profileData.dob,
                phone: vm.profileData.phone, address: vm.profileData.address,
                profilePicture: vm.profileData.profilePicture,
                profileUpdatedAt: moment().format('YYYY-MM-DD HH:mm:ss')
            });
            AttendanceService.saveUsers(users);
            vm.currentUser = _.extend(vm.currentUser, _.pick(users[idx], 'name', 'email', 'department', 'profilePicture'));
            localStorage.setItem('currentUser', JSON.stringify(vm.currentUser));
            alert('Profile updated successfully!');
            vm.showProfile = false;
        }
    };

    vm.logout  = function() { localStorage.removeItem('currentUser'); $window.location.href = 'login.html'; };
    vm.endBreak = function() { $scope.$broadcast('endBreak'); };
});