/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const $ = require('jquery');
const _ = require('underscore');
const {assert} = require('chai');
const Account = require('models/account');
const AuthErrors = require('lib/auth-errors');
const Backbone = require('backbone');
const BaseBroker = require('models/auth_brokers/base');
const Constants = require('lib/constants');
const {createRandomHexString} = require('../../lib/helpers');
const Metrics = require('lib/metrics');
const Relier = require('models/reliers/relier');
const sinon = require('sinon');
const View = require('views/sign_in_recovery_code');
const WindowMock = require('../../mocks/window');

const RECOVERY_CODE = createRandomHexString(Constants.RECOVERY_CODE_LENGTH);

describe('views/sign_in_recovery_code', () => {
  let account;
  let broker;
  let metrics;
  let model;
  let notifier;
  let relier;
  let view;
  let windowMock;

  beforeEach(() => {
    windowMock = new WindowMock();

    relier = new Relier({
      window: windowMock
    });

    broker = new BaseBroker({
      relier: relier,
      window: windowMock
    });

    account = new Account({
      email: 'a@a.com',
      sessionToken: 'someToken',
      uid: 'uid'
    });

    model = new Backbone.Model({
      account: account,
      lastPage: 'signin',
      password: 'password'
    });

    notifier = _.extend({}, Backbone.Events);
    metrics = new Metrics({notifier});

    view = new View({
      broker,
      canGoBack: true,
      metrics,
      model,
      notifier,
      relier,
      viewName: 'sign-in-recovery-code',
      window: windowMock
    });

    sinon.stub(view, 'getSignedInAccount').callsFake(() => model.get('account'));

    return view.render()
      .then(() => $('#container').html(view.$el));
  });

  afterEach(() => {
    metrics.destroy();
    view.remove();
    view.destroy();
    view = metrics = null;
  });

  describe('render', () => {
    it('renders the view', () => {
      assert.lengthOf(view.$('#fxa-recovery-code-header'), 1);
      assert.include(view.$('.verification-recovery-code-message').text(), 'recovery code');
    });

    describe('without an account', () => {
      beforeEach(() => {
        account = model.get('account').unset('sessionToken');
        sinon.spy(view, 'navigate');
        return view.render();
      });

      it('redirects to the signin page', () => {
        assert.isTrue(view.navigate.calledWith('signin'));
      });
    });
  });

  describe('validateAndSubmit', () => {
    beforeEach(() => {
      sinon.stub(view, 'submit').callsFake(() => Promise.resolve());
      sinon.spy(view, 'showValidationError');
    });

    describe('with an invalid code', () => {
      beforeEach(() => {
        view.$('#recovery-code').val('ZZZZZZZZ');
        return view.validateAndSubmit().then(assert.fail, () => {});
      });

      it('displays a tooltip, does not call submit', () => {
        assert.isTrue(view.showValidationError.called);
        assert.isFalse(view.submit.called);
      });
    });

    const validCodes = [
      RECOVERY_CODE,
      '   ' + RECOVERY_CODE,
      RECOVERY_CODE + '   ',
      '   ' + RECOVERY_CODE + '   '
    ];
    validCodes.forEach((code) => {
      describe(`with a valid code: '${code}'`, () => {
        beforeEach(() => {
          view.$('.recovery-code').val(code);

          return view.validateAndSubmit();
        });

        it('calls submit', () => {
          assert.equal(view.submit.callCount, 1);
        });
      });
    });
  });

  describe('submit', () => {
    describe('success', () => {
      beforeEach(() => {
        sinon.stub(account, 'consumeRecoveryCode').callsFake(() => Promise.resolve({remaining: 7}));
        sinon.stub(view, 'invokeBrokerMethod').callsFake(() => Promise.resolve());
        sinon.spy(view, 'logViewEvent');
        view.$('.recovery-code').val(RECOVERY_CODE);
        return view.submit();
      });

      it('calls correct broker methods', () => {
        assert.isTrue(account.consumeRecoveryCode.calledWith(RECOVERY_CODE), 'verify with correct code');
        assert.isTrue(view.invokeBrokerMethod.calledWith('afterCompleteSignInWithCode', account));
      });

      it('log metrics', () => {
        assert.isTrue(view.logViewEvent.calledWith('success'), 'verify with metrics');
      });
    });

    describe('invalid recovery code', () => {
      beforeEach(() => {
        sinon.stub(account, 'consumeRecoveryCode').callsFake(() => Promise.reject(AuthErrors.toError('INVALID_RECOVERY_CODE')));
        sinon.spy(view, 'showValidationError');
        view.$('.recovery-code').val(RECOVERY_CODE);
        return view.submit();
      });

      it('rejects with the error for display', () => {
        assert.equal(view.showValidationError.args[0][1].errno, 1056, 'correct error thrown');
      });
    });

    describe('errors', () => {
      beforeEach(() => {
        sinon.stub(account, 'consumeRecoveryCode').callsFake(() => Promise.reject(AuthErrors.toError('UNEXPECTED_ERROR')));
        sinon.spy(view, 'showValidationError');
        view.$('.recovery-code').val(RECOVERY_CODE);
        return view.submit();
      });

      it('rejects with the error for display', () => {
        assert.equal(view.showValidationError.args[0][1].errno, 999, 'correct error thrown');
      });
    });
  });
});
