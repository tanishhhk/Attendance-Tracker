// ═══════════════════════════════════════════════════════════════
//  DJUBO — static/js/controllers/settingsCtrl.js
//  Settings controller (profile update, preferences)
// ═══════════════════════════════════════════════════════════════

app.controller('SettingsController', function($scope, AttendanceService) {
    var vm = this;

    vm.departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];

    // Load current user settings from localStorage
    vm.currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');

    vm.settings = {
        theme:        'light',
        notifications: true,
        autoCheckout: false
    };

    vm.saveSettings = function() {
        localStorage.setItem('djuboSettings', JSON.stringify(vm.settings));
        alert('Settings saved!');
    };

    // Load any saved settings
    var saved = JSON.parse(localStorage.getItem('djuboSettings') || 'null');
    if (saved) vm.settings = saved;
});