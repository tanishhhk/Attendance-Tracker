app.controller('MainController', function($scope, $window, $timeout, AttendanceService) {
    var vm = this;

    // ── AUTH CHECK ──────────────────────────────────────────
    if (!AttendanceService.isLoggedIn()) {
        $window.location.href = 'login.html';
        return;
    }

    vm.currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

    // layout.html branches the whole page on currentUser.role. If the token
    // survived but currentUser did not, neither ng-if matched and the user got
    // a header above an entirely blank page with no way to recover.
    if (!vm.currentUser.role) {
        AttendanceService.logout();
        $window.location.href = 'login.html';
        return;
    }

    vm.onBreak     = false;
    vm.breakTimer  = '00:00:00';
    vm.showProfile = false;
    vm.profileData = {};

    vm.lastLoginDisplay = vm.currentUser.lastLogin
        ? 'Last login: ' + moment(vm.currentUser.lastLogin, 'YYYY-MM-DD HH:mm:ss').fromNow()
        : '';

    // ── PROFILE ─────────────────────────────────────────────
    // Profile data comes from currentUser stored at login time
    // (backend doesn't have a profile endpoint yet — kept local for now)
    vm.loadProfileData = function() {
        vm.profileData = {
            name:           vm.currentUser.name           || '',
            email:          vm.currentUser.email          || '',
            department:     vm.currentUser.department     || '',
            dob:            vm.currentUser.dob            || '',
            phone:          vm.currentUser.phone          || '',
            address:        vm.currentUser.address        || '',
            profilePicture: vm.currentUser.profilePicture || ''
        };
    };

    vm.loadProfileData();

    vm.openProfile  = function() { vm.loadProfileData(); vm.showProfile = true; };
    vm.closeProfile = function() { vm.showProfile = false; };

    vm.triggerFileUpload = function() {
        var input = document.getElementById('profilePicture');
        if (input) { input.click(); }
    };

    // This used to be a delegated $(document).on('change', ...) registered
    // inside the controller body, so a new handler was added to document on
    // every controller instantiation and never removed on $destroy. One file
    // pick then fired several FileReaders and several $scope.$apply() calls on
    // stale scopes. Bind to the element itself, and only once.
    function onProfilePictureChange(e) {
        var file = e.target.files[0];
        if (!file) { return; }
        var reader = new FileReader();
        reader.onload = function(ev) {
            $scope.$apply(function() {
                vm.profileData.profilePicture = ev.target.result;
            });
        };
        reader.readAsDataURL(file);
    }

    // The input lives inside an ng-if, so it only exists once the profile modal
    // is open. $timeout defers past the digest that actually renders it.
    $scope.$watch(function() { return vm.showProfile; }, function(open) {
        if (!open) { return; }
        $timeout(function() {
            var input = document.getElementById('profilePicture');
            if (!input) { return; }
            input.removeEventListener('change', onProfilePictureChange);
            input.addEventListener('change', onProfilePictureChange);
        });
    });

    vm.saveProfile = function() {
        // Save updated profile locally until backend profile API is built
        vm.currentUser = angular.extend(vm.currentUser, {
            name:             vm.profileData.name,
            email:            vm.profileData.email,
            department:       vm.profileData.department,
            dob:              vm.profileData.dob,
            phone:            vm.profileData.phone,
            address:          vm.profileData.address,
            profilePicture:   vm.profileData.profilePicture,
            profileUpdatedAt: moment().format('YYYY-MM-DD HH:mm:ss')
        });
        localStorage.setItem('currentUser', JSON.stringify(vm.currentUser));
        alert('Profile updated successfully!');
        vm.showProfile = false;
    };

    // ── LOGOUT ──────────────────────────────────────────────
    vm.logout = function() {
        AttendanceService.logout();
        localStorage.removeItem('currentUser');
        $window.location.href = 'login.html';
    };

    // ── BREAK RELAY ─────────────────────────────────────────
    vm.endBreak = function() { $scope.$broadcast('endBreak'); };
});