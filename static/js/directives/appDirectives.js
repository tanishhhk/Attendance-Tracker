app.directive('autoFocus', function($timeout) {
    return {
        restrict: 'A',
        link: function(scope, el) {
            $timeout(function() { el[0].focus(); });
        }
    };
});