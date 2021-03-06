(function ($) {
	function postEndpointController(elem, options) {
		this.element = $(elem);

		var self = this;

		self.submitter = $(self.element.data('submitter'));
		self.endpoint = self.element.attr('action');
		self.method = self.element.attr('method');
		self.prompt = $(self.submitter).html();
		self.modal = self.element.data('modal') ? $(self.element.data('modal')) : null;
		self.successPrompt = self.element.data('success-prompt');

		self.start = function () {
			self.submitter.on('click', function (e) {
				e.preventDefault();
				self.submitter.html('<i class="fa fa-circle-o-notch fa-spin"></i> Loading.');
				self.doIt();
			});
		};

		self.stop = function () {
			self.submitter.off('click');
		};

		self.doIt = function () {
			var data = self.element.serializeObject();
			flashAjaxStatus('info', 'saving');
			$.ajax({
				'method': self.method,
				'url': self.endpoint,
				'data': data,
				'headers': {
					'x-digitopia-hijax': 'true'
				}
			}).done(function (data, textStatus, jqXHR) {
				var flashLevel = jqXHR.getResponseHeader('x-digitopia-hijax-flash-level') ? jqXHR.getResponseHeader('x-digitopia-hijax-flash-level') : 'info';
				var flashMessage = self.successPrompt ? self.successPrompt : jqXHR.getResponseHeader('x-digitopia-hijax-flash-message');
				var redirect = jqXHR.getResponseHeader('x-digitopia-hijax-location');
				var loggedIn = jqXHR.getResponseHeader('x-digitopia-hijax-did-login');
				var loggedOut = jqXHR.getResponseHeader('x-digitopia-hijax-did-logout');
				var failed = false;
				if (_.get(data, 'result.flashLevel')) {
					flashLevel = data.result.flashLevel;
				}
				if (_.get(data, 'result.flashMessage')) {
					flashMessage = self.successPrompt ? self.successPrompt : data.result.flashMessage;
				}
				if (_.get(data, 'result.hijaxLocation')) {
					redirect = data.result.hijaxLocation;
				}
				if (_.get(data, 'result.didLogIn')) {
					loggedIn = true;
				}
				if (_.get(data, 'result.didLogOut')) {
					loggedOut = true;
				}

				if (_.get(data, 'result.status')) {
					if (result.status !== 'ok') {
						failed = true;
					}
				}

				if (loggedIn) {
					didLogIn();
				}

				if (loggedOut) {
					didLogOut();
				}

				self.submitter.html(self.prompt);

				flashAjaxStatus(flashLevel, flashMessage);

				if (!failed) {
					if (redirect) {
						loadPage(redirect);
					}

					if (self.modal) {
						$(self.modal).modal('hide');
					}
				}

			}).fail(function (jqXHR, textStatus, errorThrown) {
				self.submitter.html(self.prompt);
				if (_.get(jqXHR, 'jqXHR.responseJSON.error.message')) {
					flashAjaxStatus('error', jqXHR.responseJSON.error.message);
				}
				else {
					flashAjaxStatus('error', textStatus + ': ' + errorThrown);
				}
			});
		};
	}
	$.fn.postEndpointController = GetJQueryPlugin('postEndpointController', postEndpointController);
})(jQuery);
