(function () {
    'use strict';

    /**
     * @return {IssueHeader}
     */
    const controller = function () {

        class IssueHeader {

            /**
             * @type {Signable}
             */
            signable;
            /**
             * @type {*}
             * @private
             */
            _tx;

            $postLink() {
                this._tx = this.signable.getTxData();
                this.name = this._tx.name;
                this.quantity = this._tx.quantity.div(Math.pow(10, this._tx.precision)).toFormat(this._tx.precision);
            }

        }

        return new IssueHeader();
    };

    controller.$inject = [];

    angular.module('app.ui').component('wIssueHeader', {
        bindings: {
            signable: '<',
            isScam: '<'
        },
        controller,
        templateUrl: 'modules/ui/directives/transactionInfo/types/issue/issue-header.html'
    });
})();
