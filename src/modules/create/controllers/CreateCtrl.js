(function () {
    'use strict';

    /**
     * @param {typeof Base} Base
     * @param {$rootScope.Scope} $scope
     * @param $q
     * @param $mdDialog
     * @param $timeout
     * @param {User} user
     * @param {ModalManager} modalManager
     * @param {ISeedService} seedService
     * @return {CreateCtrl}
     */
    const controller = function (Base, $scope, $q, $mdDialog, $timeout, user, modalManager, seedService) {

        const analytics = require('@waves/event-sender');
        const PATH = 'modules/create/templates';
        const ORDER_LIST = [
            'createAccount',
            'createAccountData',
            'noBackupNoMoney',
            'backupSeed',
            'confirmBackup'
        ];

        const STATE_HASH = {
            CREATE_ACCOUNT: 0,
            CREATE_ACCOUNT_DATA: 1,
            SHOW_NO_BACKUP_NOW_MONEY: 2,
            BACKUP: 3,
            CONFIRM_BACKUP: 4
        };

        class CreateCtrl extends Base {

            constructor() {
                super($scope);

                this.stepIndex = 0;
                this.password = '';
                this.name = '';
                this.seed = '';
                this.address = '';
                this.seedList = [];
                this.seedIsValid = false;
                this.seedConfirmWasFilled = false;
                this.saveUserData = true;

                this.resetAddress();
            }

            showTutorialModals() {
                return modalManager.showTutorialModals();
            }

            onSeedConfirmFulfilled(isValid) {
                this.seedIsValid = isValid;
                this.seedConfirmWasFilled = true;

                this.observeOnce('stepIndex', this.clearSeedConfirm);
            }

            seedOnTouch() {
                this.seedConfirmWasFilled = false;
            }

            clearSeedConfirm() {
                seedService.clear.dispatch();
                this.seedIsValid = false;
                this.seedConfirmWasFilled = false;
            }

            setActiveSeed(item) {
                const old = tsUtils.find(this.seedList, { active: true });
                if (old) {
                    old.active = false;
                }
                item.active = true;
                this.seed = item.seed;
                this.address = item.address;
            }

            getStepUrl() {
                return `${PATH}/${ORDER_LIST[this.stepIndex]}.html`;
            }

            create() {
                analytics.send({ name: 'Create Confirm Phrase Confirm Click' });
                return this._create(true);
            }

            createWithoutBackup() {
                analytics.send({
                    name: 'Create Do It Later Click'
                });
                return this._create(false);
            }

            clickCopySeed() {
                analytics.send({ name: 'Create Backup Phrase Copy Click' });
            }

            /**
             * @param {number} [index]
             */
            next(index) {

                if (!index) {
                    index = this.stepIndex + 1;
                }

                if (index < 0) {
                    index = this.stepIndex + index;
                }

                if (index === STATE_HASH.CREATE_ACCOUNT && index > STATE_HASH.CREATE_ACCOUNT) {
                    analytics.send({
                        name: 'Create New Continue Click',
                        params: {
                            guestMode: !this.saveUserData
                        }
                    });
                }
                if (index === STATE_HASH.CREATE_ACCOUNT_DATA) {
                    analytics.send({ name: 'Create Protect Your Account Show' });
                }
                if (this.stepIndex === STATE_HASH.CREATE_ACCOUNT_DATA && index > this.stepIndex) {
                    analytics.send({ name: 'Create Protect Your Account Continue Click' });
                }
                if (index === STATE_HASH.SHOW_NO_BACKUP_NOW_MONEY) {
                    analytics.send({ name: 'Create No Backup Show' });
                }
                if (this.stepIndex === STATE_HASH.SHOW_NO_BACKUP_NOW_MONEY && index > this.stepIndex) {
                    analytics.send({ name: 'Create Back Up Now Click' });
                }
                if (index === STATE_HASH.BACKUP) {
                    analytics.send({ name: 'Create Backup Phrase Show' });
                }
                if (this.stepIndex === STATE_HASH.BACKUP && index > this.stepIndex) {
                    analytics.send({ name: 'Create Backup Phrase I Written Click' });
                }
                if (index === STATE_HASH.CONFIRM_BACKUP) {
                    analytics.send({ name: 'Create Confirm Phrase Show' });
                }

                if (!ORDER_LIST[index]) {
                    throw new Error('Wrong order list index!');
                } else {
                    return this.checkNext()
                        .then(() => {
                            this.stepIndex = index;
                            if (index === STATE_HASH.BACKUP) {
                                analytics.send({ name: 'Create Backup Phrase Show' });
                            }
                            if (index === STATE_HASH.CONFIRM_BACKUP) {
                                analytics.send({ name: 'Create Confirm Phrase Show' });
                            }
                        });
                }
            }

            checkNext() {
                const step = ORDER_LIST[this.stepIndex];
                if (step === 'noBackupNoMoney') {
                    analytics.send({ name: 'Create Warning Show' });
                    return this.showBackupWarningPopup()
                        .then(() => {
                            analytics.send({ name: 'Create Warning I Understand Click' });
                        });
                }
                return $q.when();
            }

            resetAddress() {
                const list = [];
                for (let i = 0; i < 5; i++) {
                    const seedData = ds.Seed.create();
                    list.push({ seed: seedData.phrase, address: seedData.address });
                }

                this.setActiveSeed(list[0]);
                this.seedList = list;
            }

            showBackupWarningPopup() {
                return modalManager.showCustomModal({
                    templateUrl: 'modules/create/templates/noBackupNoMoney.modal.html',
                    clickOutsideToClose: false,
                    escapeToClose: false
                });
            }

            _create(hasBackup) {
                if (!this.saveUserData) {
                    this.password = Date.now().toString();
                }

                const encryptedSeed = new ds.Seed(this.seed).encrypt(this.password);
                const userSettings = user.getDefaultUserSettings({ termsAccepted: false });

                const newUser = {
                    userType: this.restoreType,
                    address: this.address,
                    name: this.name,
                    password: this.password,
                    id: this.userId,
                    path: this.userPath,
                    settings: userSettings,
                    saveToStorage: this.saveUserData,
                    encryptedSeed
                };

                const api = ds.signature.getDefaultSignatureApi(newUser);

                return user.create({
                    ...newUser,
                    settings: userSettings.getSettings(),
                    api
                }, hasBackup);
            }

        }

        return new CreateCtrl();
    };

    controller.$inject = [
        'Base', '$scope', '$q', '$mdDialog', '$timeout', 'user', 'modalManager', 'seedService'
    ];

    angular.module('app.create').controller('CreateCtrl', controller);
})();
