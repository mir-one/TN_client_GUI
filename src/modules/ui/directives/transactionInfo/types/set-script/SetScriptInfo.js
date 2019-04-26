(function () {
    'use strict';

    /**
     * @param {$rootScope.Scope} $scope
     * @return {SetScriptInfo}
     */
    const controller = function ($scope) {

        class SetScriptInfo {

            /**
             * @type {Signable}
             */
            signable;
            /**
             * @type {boolean}
             */
            hasScript = false;


            $postLink() {
                this.transaction = this.signable.getTxData();
                this.hasScript = !!((this.transaction.script || '').replace('base64:', ''));
                this.transaction.script = this.transaction.script || '';

                (this.transaction.id ? Promise.resolve(this.transaction.id) : this.signable.getId())
                    .then(id => {
                        this.id = id;
                        $scope.$apply();
                    });
            }

        }

        return new SetScriptInfo();
    };

    controller.$inject = ['$scope'];

    angular.module('app.ui').component('wSetScriptInfo', {
        bindings: {
            signable: '<'
        },
        controller,
        templateUrl: 'modules/ui/directives/transactionInfo/types/set-script/info.html'
    });
})();
